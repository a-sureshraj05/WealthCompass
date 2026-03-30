from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.db.schema import StockSplit

router = APIRouter()


class SplitCreate(BaseModel):
    ticker: str
    split_date: datetime
    numerator: float
    denominator: float


class SplitResponse(BaseModel):
    id: int
    ticker: str
    split_date: datetime
    numerator: float
    denominator: float

    class Config:
        from_attributes = True


@router.get("/splits", response_model=List[SplitResponse])
def get_splits(ticker: Optional[str] = None, db: Session = Depends(get_db)):
    """List all stock splits, optionally filtered by ticker."""
    q = db.query(StockSplit).order_by(StockSplit.ticker, StockSplit.split_date)
    if ticker:
        q = q.filter(StockSplit.ticker == ticker.upper())
    return q.all()


@router.post("/splits", response_model=SplitResponse)
def create_split(payload: SplitCreate, db: Session = Depends(get_db)):
    """Add a new stock split event."""
    payload.ticker = payload.ticker.upper()
    existing = db.query(StockSplit).filter_by(ticker=payload.ticker, split_date=payload.split_date).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Split for {payload.ticker} on {payload.split_date.date()} already exists")
    split = StockSplit(**payload.model_dump())
    db.add(split)
    db.commit()
    db.refresh(split)
    return split


@router.delete("/splits/{split_id}")
def delete_split(split_id: int, db: Session = Depends(get_db)):
    """Remove a stock split event."""
    split = db.query(StockSplit).filter(StockSplit.id == split_id).first()
    if not split:
        raise HTTPException(status_code=404, detail="Split not found")
    db.delete(split)
    db.commit()
    return {"message": "Split deleted"}
