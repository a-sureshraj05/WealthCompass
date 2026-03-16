import datetime
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core import process
from backend.app.core.database import get_db
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
    name: str
    action: str
    quantity: float
    price: float
    costPerShare: float
    totalCost: float
    assetType: str
    is_deleted: bool = False
    is_override: bool = False

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
        query = query.filter(DBTransaction.is_deleted == False)
    elif visibility == "hidden":
        query = query.filter(DBTransaction.is_deleted == True)
    # "all" applies no is_deleted filter

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


@router.post("/transactions/reset")
def reset_transactions(db: Session = Depends(get_db)):
    """Clear transactions table and re-seed from raw source tables with proper raw_id linkage."""
    db.query(DBTransaction).delete()
    db.commit()

    # Re-seed from manual raw transactions
    manual_raws = db.query(DBManualRawTransaction).all()
    for raw in manual_raws:
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
            assetType=raw.assetType,
            source="manual",
            raw_id=raw.id,
        ))

    # Re-seed from snaptrade transactions
    snaptrade_raws = db.query(DBSnaptradeTransaction).all()
    for raw in snaptrade_raws:
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
            assetType=raw.assetType,
            source="snaptrade",
            raw_id=raw.id,
        ))

    db.commit()
    process.process_transactions(db)
    return {"message": "Transactions reset and reprocessed from raw tables."}


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
