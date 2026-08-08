from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.auth import get_current_user
from backend.app.core import process
from backend.app.core.statement_parser import csv_data_parse
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.core.utils.asset_type import normalize as normalize_asset_type
from backend.app.db.schema import \
    Transaction as DBTransaction, ManualRawTransaction as DBManualRawTransaction, \
    SnaptradeTransaction as DBSnaptradeTransaction, User

router = APIRouter()


class StatementRequest(BaseModel):
    text: str
    brokerageName: str


@router.post("/import/parse-statement")
def parse_statement_import_endpoint(
    request: StatementRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # An upload belongs to whoever is logged in. Every row written below is
    # stamped through the scope rather than by hand, so an added field or an
    # extra insert cannot quietly land in another account.
    scope = UserScope(db, current_user.id)
    try:
        # Delete this user's existing manual raw transactions for this brokerage
        scope.delete_all(DBManualRawTransaction, brokerage=request.brokerageName)
        # Delete their manual transactions — preserve is_backend_verified ones
        # (those are user-curated seed lots that must survive re-imports)
        scope.query(DBTransaction).filter(
            DBTransaction.brokerage == request.brokerageName,
            DBTransaction.source == "manual",
            DBTransaction.is_backend_verified == False,
        ).delete(synchronize_session=False)
        db.commit()

        parsed_transactions_data = csv_data_parse(
            request.text, request.brokerageName
        )

        # Raw table keeps all tickers. Unified transactions table only gets manual
        # rows that predate SnapTrade's earliest transaction for that ticker —
        # SnapTrade covers from its min date onwards, manual fills the history before it.
        snap_min_dates = {
            (brokerage, ticker): min_date
            for brokerage, ticker, min_date in scope.query(
                DBSnaptradeTransaction.brokerage,
                DBSnaptradeTransaction.ticker,
                func.min(DBSnaptradeTransaction.date),
            ).group_by(DBSnaptradeTransaction.brokerage, DBSnaptradeTransaction.ticker).all()
        }

        new_transaction_ids = []
        for transaction_data in parsed_transactions_data:
            asset_type = normalize_asset_type(transaction_data["assetType"], ticker=transaction_data["ticker"])

            # Insert into ManualRawTransaction (raw log — always)
            db_raw = DBManualRawTransaction(
                brokerage=transaction_data["brokerage"],
                date=transaction_data["date"],
                ticker=transaction_data["ticker"],
                name=transaction_data["name"],
                action=transaction_data["action"],
                quantity=transaction_data["quantity"],
                price=transaction_data["costPerShare"],
                costPerShare=transaction_data["costPerShare"],
                totalCost=transaction_data["totalCost"],
                assetType=asset_type,
            )
            scope.add(db_raw)  # stamps user_id
            db.flush()

            # Only push to unified table if this row predates SnapTrade's coverage
            snap_min = snap_min_dates.get((transaction_data["brokerage"], transaction_data["ticker"]))
            if snap_min is None:
                continue
            snap_min_day = snap_min.date() if hasattr(snap_min, "date") else snap_min
            if transaction_data["date"].date() >= snap_min_day:
                continue

            db_transaction = DBTransaction(
                brokerage=transaction_data["brokerage"],
                date=transaction_data["date"],
                ticker=transaction_data["ticker"],
                name=transaction_data["name"],
                action=transaction_data["action"],
                quantity=transaction_data["quantity"],
                price=transaction_data["costPerShare"],
                costPerShare=transaction_data["costPerShare"],
                totalCost=transaction_data["totalCost"],
                assetType=asset_type,
                source="manual",
                raw_id=db_raw.id,
            )
            scope.add(db_transaction)  # stamps user_id
            db.flush()
            new_transaction_ids.append(db_transaction.id)
        db.commit()

        process.process_transactions(db, current_user.id, request.brokerageName)

        # After commit, query for the newly added transactions to get their IDs and full data
        # Or, to simplify, fetch all transactions for the given brokerage after the update
        updated_transactions = (
            scope.query(DBTransaction)
            .filter(DBTransaction.brokerage == request.brokerageName)
            .all()
        )

        return {
            "message": "Transactions parsed and saved successfully!",
            "transactions": updated_transactions,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error processing statement import: {str(e)}"
        )
