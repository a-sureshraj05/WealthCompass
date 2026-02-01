from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
import datetime

from backend.app.db.schema import Holding as DBHolding  # Alias to avoid name collision
from backend.app.core.database import get_db

router = APIRouter()

# Pydantic model for response validation
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

@router.get("/transactions")
def get_transactions():
    return []

@router.get("/holdings", response_model=List[Holding])
def get_holdings(db: Session = Depends(get_db)):
    return db.query(DBHolding).all()
