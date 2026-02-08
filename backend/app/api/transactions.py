from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
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
def get_transactions(db: Session = Depends(get_db)):
    return db.query(DBTransaction).all()

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
