from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
import datetime

from backend.app.db.schema import Holding as DBHolding, Transaction as DBTransaction  # Alias to avoid name collision
from backend.app.core.database import get_db

router = APIRouter()

# Pydantic model for response validation - Holding
class Holding(BaseModel):
    id: int
    brokerage: str
    date: datetime.datetime
    ticker: str
    name: str
    action: str
    quantity: float
    costPerShare: float
    totalCost: float

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

    class Config:
        from_attributes = True

@router.get("/transactions", response_model=List[Transaction])
def get_transactions(
    db: Session = Depends(get_db),
    brokerages: Optional[List[str]] = Query(None),
    tickers: Optional[List[str]] = Query(None),
    start_date: Optional[datetime.date] = Query(None),
    end_date: Optional[datetime.date] = Query(None)
):
    query = db.query(DBTransaction)

    if brokerages:
        query = query.filter(DBTransaction.brokerage.in_(brokerages))
    if tickers:
        query = query.filter(DBTransaction.ticker.in_(tickers))
    if start_date:
        query = query.filter(DBTransaction.date >= start_date)
    if end_date:
        # Add one day to end_date to include transactions on the end_date itself
        query = query.filter(DBTransaction.date <= (end_date + datetime.timedelta(days=1)))

    return query.all()

@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(DBTransaction).filter(DBTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(transaction)
    db.commit()
    return {"message": "Transaction deleted successfully"}

@router.get("/holdings", response_model=List[Holding])
def get_holdings(db: Session = Depends(get_db)):
    return db.query(DBHolding).all()
