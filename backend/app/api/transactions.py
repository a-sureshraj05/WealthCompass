import datetime
import json
from collections import Counter
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core import process
from backend.app.core.database import get_db
from backend.app.core.utils.asset_type import normalize as normalize_asset_type
from backend.app.db.schema import \
    Holding as DBHolding  # Alias to avoid name collision
from backend.app.db.schema import ManualRawTransaction as DBManualRawTransaction
from backend.app.db.schema import RealizedGain as DBRealizedGain
from backend.app.db.schema import SnaptradeTransaction as DBSnaptradeTransaction
from backend.app.db.schema import Transaction as DBTransaction
from backend.app.db.schema import UnrealizedGain as DBUnrealizedGain

router = APIRouter()


# Pydantic model for response validation - RealizedGain
class RealizedGain(BaseModel):
    id: int
    brokerage: str
    ticker: str
    buyDate: datetime.datetime
    sellDate: datetime.datetime
    quantity: float
    buyPrice: float
    sellPrice: float
    gain: float
    isLongTerm: bool
    assetType: Optional[str] = None
    is_wash_sale: bool = False
    wash_sale_disallowed_amount: float = 0.0

    class Config:
        from_attributes = True


# Pydantic model for response validation - UnrealizedGain
class UnrealizedGain(BaseModel):
    id: int
    brokerage: str
    ticker: str
    buyDate: datetime.datetime
    quantity: float
    buyPrice: float
    currentPrice: float
    unrealizedGain: float
    isLongTerm: bool
    assetType: Optional[str] = None
    wash_sale_adjustment: float = 0.0
    wash_sale_clear_date: Optional[datetime.date] = None
    wash_sale_at_risk: bool = False
    wash_sale_risk_trigger_date: Optional[datetime.date] = None

    class Config:
        from_attributes = True


# Pydantic model for response validation - Holding
class Holding(BaseModel):
    id: int
    brokerage: str
    ticker: str
    quantity: float
    averageCostPerShare: float
    totalCost: float
    currentPrice: float
    previousClose: float = 0.0
    marketValue: float
    assetType: Optional[str] = None

    class Config:
        from_attributes = True


# Pydantic model for response validation - Transaction
class Transaction(BaseModel):
    id: int
    brokerage: str
    date: datetime.datetime
    ticker: str
    name: Optional[str] = None
    action: str
    quantity: float
    price: Optional[float] = None
    costPerShare: Optional[float] = None
    totalCost: Optional[float] = None
    assetType: Optional[str] = None
    is_deleted: bool = False
    is_override: bool = False
    is_duplicate: bool = False
    is_backend_verified: bool = False
    current_brokerage: Optional[str] = None

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    date: Optional[str] = None
    brokerage: Optional[str] = None
    ticker: Optional[str] = None
    name: Optional[str] = None
    action: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    costPerShare: Optional[float] = None
    totalCost: Optional[float] = None
    assetType: Optional[str] = None
    current_brokerage: Optional[str] = None


class SplitRequest(BaseModel):
    quantity: float


@router.get("/transactions", response_model=List[Transaction])
def get_transactions(
    db: Session = Depends(get_db),
    brokerages: Optional[List[str]] = Query(None),
    tickers: Optional[List[str]] = Query(None),
    start_date: Optional[datetime.date] = Query(None),
    end_date: Optional[datetime.date] = Query(None),
    source: Optional[str] = Query("all"),  # "all" | "manual" | "snaptrade"
    visibility: Optional[str] = Query("active"),  # "active" | "hidden" | "all"
):
    query = db.query(DBTransaction)

    if visibility == "active":
        query = query.filter(DBTransaction.is_deleted == False, DBTransaction.is_duplicate == False)
    elif visibility == "hidden":
        query = query.filter(DBTransaction.is_deleted == True)
    elif visibility == "duplicates":
        query = query.filter(DBTransaction.is_duplicate == True)
    # "all" applies no filter

    if brokerages:
        query = query.filter(DBTransaction.brokerage.in_(brokerages))
    if tickers:
        query = query.filter(DBTransaction.ticker.in_(tickers))
    if start_date:
        query = query.filter(DBTransaction.date >= start_date)
    if end_date:
        query = query.filter(
            DBTransaction.date <= (end_date + datetime.timedelta(days=1))
        )
    if source and source != "all":
        query = query.filter(DBTransaction.source == source)

    return query.all()


@router.patch("/transactions/{transaction_id}")
def update_transaction(transaction_id: int, updates: TransactionUpdate, db: Session = Depends(get_db)):
    transaction = db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    # Snapshot original values only on the first edit
    if not transaction.is_override:
        transaction.original_values = json.dumps({
            "date": transaction.date.isoformat() if transaction.date else None,
            "brokerage": transaction.brokerage,
            "ticker": transaction.ticker,
            "name": transaction.name,
            "action": transaction.action,
            "quantity": transaction.quantity,
            "price": transaction.price,
            "costPerShare": transaction.costPerShare,
            "totalCost": transaction.totalCost,
            "assetType": transaction.assetType,
        })
    if updates.date is not None:
        transaction.date = datetime.datetime.fromisoformat(updates.date)
    if updates.brokerage is not None:
        transaction.brokerage = updates.brokerage
    if updates.ticker is not None:
        transaction.ticker = updates.ticker
    if updates.name is not None:
        transaction.name = updates.name
    if updates.action is not None:
        transaction.action = updates.action
    if updates.quantity is not None:
        transaction.quantity = updates.quantity
    if updates.price is not None:
        transaction.price = updates.price
    if updates.costPerShare is not None:
        transaction.costPerShare = updates.costPerShare
    if updates.totalCost is not None:
        transaction.totalCost = updates.totalCost
    if updates.assetType is not None:
        transaction.assetType = updates.assetType
    if updates.current_brokerage is not None:
        transaction.current_brokerage = updates.current_brokerage
    transaction.is_override = True
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/transactions/{transaction_id}/revert")
def revert_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not transaction.is_override:
        raise HTTPException(status_code=400, detail="Transaction has no override to revert")

    # Try to restore from the raw source table first
    raw = None
    if transaction.raw_id:
        if transaction.source == "manual":
            raw = db.query(DBManualRawTransaction).filter(DBManualRawTransaction.id == transaction.raw_id).first()
            if raw:
                transaction.date = raw.date
                transaction.brokerage = raw.brokerage
                transaction.ticker = raw.ticker
                transaction.name = raw.name
                transaction.action = raw.action
                transaction.quantity = raw.quantity
                transaction.price = raw.price
                transaction.costPerShare = raw.costPerShare
                transaction.totalCost = raw.totalCost
                transaction.assetType = raw.assetType
        elif transaction.source == "snaptrade":
            raw = db.query(DBSnaptradeTransaction).filter(DBSnaptradeTransaction.id == transaction.raw_id).first()
            if raw:
                transaction.date = raw.date
                transaction.brokerage = raw.brokerage
                transaction.ticker = raw.ticker
                transaction.name = raw.name
                transaction.action = raw.action
                transaction.quantity = raw.quantity
                transaction.price = raw.price
                transaction.costPerShare = raw.price
                transaction.totalCost = raw.amount
                transaction.assetType = raw.assetType

    # Fallback: restore from JSON snapshot if raw lookup failed
    if raw is None and transaction.original_values:
        original = json.loads(transaction.original_values)
        if original.get("date"):
            transaction.date = datetime.datetime.fromisoformat(original["date"])
        transaction.brokerage = original.get("brokerage", transaction.brokerage)
        transaction.ticker = original.get("ticker", transaction.ticker)
        transaction.name = original.get("name", transaction.name)
        transaction.action = original.get("action", transaction.action)
        transaction.quantity = original.get("quantity", transaction.quantity)
        transaction.price = original.get("price", transaction.price)
        transaction.costPerShare = original.get("costPerShare", transaction.costPerShare)
        transaction.totalCost = original.get("totalCost", transaction.totalCost)
        transaction.assetType = original.get("assetType", transaction.assetType)

    transaction.is_override = False
    transaction.original_values = None
    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/transactions/{transaction_id}/split")
def split_transaction(transaction_id: int, body: SplitRequest, db: Session = Depends(get_db)):
    """Split a BUY lot into two. The split is persisted in transaction_split_configs so it survives resets."""
    transaction = db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if body.quantity <= 0 or body.quantity >= transaction.quantity:
        raise HTTPException(status_code=400, detail=f"Split quantity must be between 0 and {transaction.quantity}")

    original_qty = transaction.quantity
    remaining_qty = original_qty - body.quantity

    # Apply the split to the live DBTransactions
    split_txn = DBTransaction(
        brokerage=transaction.brokerage,
        date=transaction.date,
        ticker=transaction.ticker,
        name=transaction.name,
        action=transaction.action,
        quantity=body.quantity,
        price=transaction.price,
        costPerShare=transaction.costPerShare,
        totalCost=round(transaction.totalCost * (body.quantity / original_qty), 2),
        assetType=transaction.assetType,
        source=transaction.source,
        raw_id=transaction.raw_id,
        current_brokerage=transaction.current_brokerage,
        option_symbol=transaction.option_symbol,
        is_override=True,
    )
    transaction.quantity = remaining_qty
    transaction.totalCost = round(transaction.totalCost * (remaining_qty / original_qty), 2)
    transaction.is_override = True

    db.add(split_txn)
    db.commit()
    db.refresh(transaction)
    db.refresh(split_txn)
    return {"original_id": transaction.id, "split_id": split_txn.id}


@router.patch("/transactions/{transaction_id}/verify")
def set_transaction_verified(transaction_id: int, is_backend_verified: bool, db: Session = Depends(get_db)):
    """Manually mark a transaction as backend-verified. Only called explicitly by the user.
    No automated process, sync, or loader should ever call this endpoint."""
    transaction = db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    transaction.is_backend_verified = is_backend_verified
    db.commit()
    return {"message": "Transaction verification status updated"}


@router.patch("/transactions/{transaction_id}/hidden")
def set_transaction_hidden(transaction_id: int, is_deleted: bool, db: Session = Depends(get_db)):
    transaction = (
        db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    transaction.is_deleted = is_deleted
    db.commit()
    return {"message": "Transaction updated successfully"}


@router.delete("/transactions/raw")
def delete_raw_data(source: Optional[str] = None, brokerage: Optional[str] = None, db: Session = Depends(get_db)):
    """Delete raw source data. source=manual|snaptrade|None(both). Optionally filter by brokerage."""
    if source in (None, "manual"):
        q = db.query(DBManualRawTransaction)
        if brokerage:
            q = q.filter(DBManualRawTransaction.brokerage == brokerage)
        q.delete(synchronize_session=False)
    if source in (None, "snaptrade"):
        q = db.query(DBSnaptradeTransaction)
        if brokerage:
            q = q.filter(DBSnaptradeTransaction.brokerage == brokerage)
        q.delete(synchronize_session=False)
    # Also clear processed data that was derived from the deleted raw rows
    db.query(DBTransaction).delete(synchronize_session=False)
    db.query(DBHolding).delete(synchronize_session=False)
    db.query(DBRealizedGain).delete(synchronize_session=False)
    db.query(DBUnrealizedGain).delete(synchronize_session=False)
    db.commit()
    label = source or "all"
    return {"message": f"Deleted {label} raw data and all processed data."}


@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = (
        db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(transaction)
    db.commit()
    return {"message": "Transaction deleted successfully"}


@router.post("/transactions/clear")
def clear_processed_data(db: Session = Depends(get_db)):
    """Clear only derived tables (holdings, gains). Transactions table is never touched here —
    use Reset to re-seed transactions from raw sources."""
    db.query(DBHolding).delete()
    db.query(DBRealizedGain).delete()
    db.query(DBUnrealizedGain).delete()
    db.commit()
    return {"message": "Processed data cleared. Transactions preserved."}


@router.post("/transactions/reset")
def reset_transactions(brokerage: Optional[str] = None, db: Session = Depends(get_db)):
    """Clear transactions table and re-seed from raw source tables. Optionally filter by brokerage.
    Manual customisations (current_brokerage, is_deleted, field edits) are snapshotted before
    the wipe and replayed onto the freshly-seeded rows so they survive the reset.
    """
    # Snapshot all customised rows keyed by (raw_id, source).
    # Also capture is_backend_verified and is_duplicate so manual corrections survive the reset.
    overrides: dict = {}
    for t in db.query(DBTransaction).all():
        is_customised = (
            t.is_deleted
            or t.is_override
            or t.is_backend_verified
            or t.is_duplicate
            or (t.current_brokerage and t.current_brokerage != t.brokerage)
        )
        if is_customised and t.raw_id and t.source:
            overrides[(t.raw_id, t.source)] = {
                "is_deleted": t.is_deleted,
                "is_override": t.is_override,
                "is_backend_verified": t.is_backend_verified,
                "is_duplicate": t.is_duplicate,
                "current_brokerage": t.current_brokerage,
                "original_values": t.original_values,
                "date": t.date,
                "brokerage": t.brokerage,
                "ticker": t.ticker,
                "name": t.name,
                "action": t.action,
                "quantity": t.quantity,
                "price": t.price,
                "costPerShare": t.costPerShare,
                "totalCost": t.totalCost,
                "assetType": t.assetType,
            }

    # Delete only non-verified transactions. Rows with is_backend_verified=1 are
    # manually curated (ACATS lots, corrected data) and must survive the reset.
    db.query(DBTransaction).filter(
        DBTransaction.is_backend_verified == False
    ).delete(synchronize_session=False)
    db.commit()

    # Build sets of raw_ids already covered by surviving verified rows — skip re-seeding these.
    verified_manual_ids = {
        t.raw_id for t in db.query(DBTransaction).filter(
            DBTransaction.is_backend_verified == True,
            DBTransaction.source == "manual",
            DBTransaction.raw_id.isnot(None),
        ).all()
    }
    verified_snaptrade_ids = {
        t.raw_id for t in db.query(DBTransaction).filter(
            DBTransaction.is_backend_verified == True,
            DBTransaction.source == "snaptrade",
            DBTransaction.raw_id.isnot(None),
        ).all()
    }

    # Re-seed from manual raw transactions
    manual_q = db.query(DBManualRawTransaction)
    if brokerage:
        manual_q = manual_q.filter(DBManualRawTransaction.brokerage == brokerage)
    for raw in manual_q.all():
        if raw.id in verified_manual_ids:
            continue  # verified row already exists for this raw entry
        db.add(DBTransaction(
            brokerage=raw.brokerage,
            date=raw.date,
            ticker=raw.ticker,
            name=raw.name,
            action=raw.action,
            quantity=raw.quantity,
            price=raw.price,
            costPerShare=raw.costPerShare,
            totalCost=raw.totalCost,
            assetType=normalize_asset_type(raw.assetType, ticker=raw.ticker),
            source="manual",
            raw_id=raw.id,
            current_brokerage=raw.brokerage,
        ))

    # Re-seed from snaptrade transactions.
    # Intra-brokerage transfers (e.g. Schwab account A → Schwab account B) produce
    # two identical rows with different IDs. Flag ALL rows whose key appears more
    # than once so both sides of the internal transfer are excluded from P&L.
    snaptrade_q = db.query(DBSnaptradeTransaction)
    if brokerage:
        snaptrade_q = snaptrade_q.filter(DBSnaptradeTransaction.brokerage == brokerage)
    snaptrade_rows = snaptrade_q.all()
    key_counts = Counter(
        (raw.brokerage, raw.ticker, raw.action, raw.quantity, raw.price, raw.date)
        for raw in snaptrade_rows
    )
    for raw in snaptrade_rows:
        if raw.id in verified_snaptrade_ids:
            continue  # verified row already exists for this raw entry
        key = (raw.brokerage, raw.ticker, raw.action, raw.quantity, raw.price, raw.date)
        is_dup = key_counts[key] > 1
        db.add(DBTransaction(
            brokerage=raw.brokerage,
            date=raw.date,
            ticker=raw.ticker,
            name=raw.name,
            action=raw.action,
            quantity=raw.quantity,
            price=raw.price,
            costPerShare=raw.price,
            totalCost=raw.amount,
            assetType=normalize_asset_type(raw.assetType, ticker=raw.ticker),
            option_symbol=raw.option_symbol,
            source="snaptrade",
            raw_id=raw.id,
            is_duplicate=is_dup,
            current_brokerage=raw.brokerage,
        ))

    db.commit()

    # Replay manual customisations onto the freshly-seeded rows
    if overrides:
        for t in db.query(DBTransaction).filter(DBTransaction.is_backend_verified == False).all():
            ov = overrides.get((t.raw_id, t.source))
            if not ov:
                continue
            t.is_deleted = ov["is_deleted"]
            t.is_duplicate = ov["is_duplicate"]
            t.is_backend_verified = ov["is_backend_verified"]
            t.current_brokerage = ov["current_brokerage"]
            if ov["is_override"]:
                t.is_override = True
                t.original_values = ov["original_values"]
                t.date = ov["date"]
                t.brokerage = ov["brokerage"]
                t.ticker = ov["ticker"]
                t.name = ov["name"]
                t.action = ov["action"]
                t.quantity = ov["quantity"]
                t.price = ov["price"]
                t.costPerShare = ov["costPerShare"]
                t.totalCost = ov["totalCost"]
                t.assetType = ov["assetType"]
        db.commit()

    process.process_transactions(db, brokerage_name=brokerage)
    label = brokerage if brokerage else "all brokerages"
    return {"message": f"Transactions reset and reprocessed for {label}."}


@router.get("/cash-balance")
def get_cash_balance(db: Session = Depends(get_db)):
    """Return total cash balance from Cash asset type transactions (BUY adds, SELL subtracts)."""
    cash_txns = db.query(DBTransaction).filter(
        DBTransaction.assetType == "Cash",
        DBTransaction.is_deleted == False,
    ).all()
    balance = 0.0
    for t in cash_txns:
        if t.action.upper() == "BUY":
            balance += t.totalCost
        elif t.action.upper() == "SELL":
            balance -= t.totalCost
    return {"balance": round(balance, 2)}


@router.get("/buying-power")
def get_buying_power():
    """Return net cash per brokerage from SnapTrade account balances.
    Uses buying_power for margin accounts (reflects borrowed funds), cash otherwise.
    Only USD entries are counted to avoid summing multi-currency duplicates.
    """
    try:
        from backend.app.api.snaptrade import get_client, get_accounts
        from backend.app.core.database import SessionLocal
        db = SessionLocal()
        try:
            client = get_client()
            from backend.app.api.snaptrade import USER_ID, USER_SECRET
            accounts = get_accounts(db)
            result: dict = {}
            for account in accounts:
                try:
                    bal = client.account_information.get_user_account_balance(
                        query_params={"userId": USER_ID, "userSecret": USER_SECRET},
                        path_params={"accountId": account["id"]},
                    )
                    brokerage = account["brokerage"]
                    for b in bal.body:
                        currency = (b.get("currency") or {})
                        code = currency.get("code", "USD") if isinstance(currency, dict) else getattr(currency, "code", "USD")
                        if code != "USD":
                            continue
                        buying_power = b.get("buying_power")
                        cash = b.get("cash")
                        # buying_power is the accurate value for margin accounts;
                        # for non-margin accounts SnapTrade sets it equal to cash.
                        value = buying_power if buying_power is not None else (cash if cash is not None else 0.0)
                        print(f"[buying-power] {brokerage} cash={cash} buying_power={buying_power} → using {value}")
                        result[brokerage] = round(result.get(brokerage, 0.0) + float(value), 2)
                except Exception as e:
                    print(f"[buying-power] error for {account.get('brokerage')}: {e}")
        finally:
            db.close()
        print(f"[buying-power] result: {result}")
        return result
    except Exception as e:
        print(f"[buying-power] top-level error: {e}")
        return {}


@router.get("/holdings", response_model=List[Holding])
def get_holdings(db: Session = Depends(get_db)):
    return db.query(DBHolding).all()


@router.get("/realized-gains", response_model=List[RealizedGain])
def get_realized_gains(db: Session = Depends(get_db)):
    return db.query(DBRealizedGain).all()


@router.get("/unrealized-gains", response_model=List[UnrealizedGain])
def get_unrealized_gains(db: Session = Depends(get_db)):
    return db.query(DBUnrealizedGain).all()


@router.post("/realized-gains/process")
def process_realized_gains_endpoint(db: Session = Depends(get_db)):
    process.process_transactions(db)
    return {"message": "Realized gains processing initiated."}
