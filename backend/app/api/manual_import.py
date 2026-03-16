from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core import process
from backend.app.core.statement_parser import csv_data_parse
from backend.app.core.database import get_db
from backend.app.core.utils.asset_type import normalize as normalize_asset_type
from backend.app.db.schema import \
    Transaction as DBTransaction, ManualRawTransaction as DBManualRawTransaction

router = APIRouter()


class StatementRequest(BaseModel):
    text: str
    brokerageName: str


@router.post("/import/parse-statement")
def parse_statement_import_endpoint(
    request: StatementRequest, db: Session = Depends(get_db)
):
    try:
        # Delete existing manual raw transactions for this brokerageName
        db.query(DBManualRawTransaction).filter(
            DBManualRawTransaction.brokerage == request.brokerageName
        ).delete()
        # Delete existing manual transactions from the unified table for this brokerageName
        db.query(DBTransaction).filter(
            DBTransaction.brokerage == request.brokerageName,
            DBTransaction.source == "manual",
        ).delete()
        db.commit()

        parsed_transactions_data = csv_data_parse(
            request.text, request.brokerageName
        )

        new_transaction_ids = []
        for transaction_data in parsed_transactions_data:
            asset_type = normalize_asset_type(transaction_data["assetType"])

            # Insert into ManualRawTransaction (raw log)
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
            db.add(db_raw)
            db.flush()  # Get db_raw.id before inserting transaction

            # Insert into unified Transaction table
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
            db.add(db_transaction)
            db.flush()
            new_transaction_ids.append(db_transaction.id)
        db.commit()

        process.process_transactions(
            db, request.brokerageName
        )  # Call the new processing function with db session and brokerage name

        # After commit, query for the newly added transactions to get their IDs and full data
        # Or, to simplify, fetch all transactions for the given brokerage after the update
        updated_transactions = (
            db.query(DBTransaction)
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
