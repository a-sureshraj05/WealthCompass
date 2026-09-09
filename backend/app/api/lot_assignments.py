from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.deps import get_user_scope
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.db.schema import LotAssignment, Transaction as DBTransaction
from backend.app.core.transaction_actions import BUY_ACTIONS, SELL_ACTIONS

router = APIRouter()


class LotAssignmentCreate(BaseModel):
    sell_transaction_id: int
    buy_transaction_id: int
    quantity: float


class LotAssignmentResponse(BaseModel):
    id: int
    sell_transaction_id: int
    buy_transaction_id: int
    quantity: float

    class Config:
        from_attributes = True


@router.get("/lot-assignments", response_model=List[LotAssignmentResponse])
def get_lot_assignments(sell_transaction_id: int = None, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """List all lot assignments, optionally filtered by sell transaction."""
    q = scope.query(LotAssignment)
    if sell_transaction_id:
        q = q.filter(LotAssignment.sell_transaction_id == sell_transaction_id)
    return q.all()


@router.post("/lot-assignments", response_model=LotAssignmentResponse)
def create_lot_assignment(payload: LotAssignmentCreate, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Assign a quantity from a specific buy lot to a sell transaction."""
    sell = scope.query(DBTransaction).filter(DBTransaction.id == payload.sell_transaction_id).first()
    if not sell or sell.action.upper() not in SELL_ACTIONS:
        raise HTTPException(status_code=400, detail="sell_transaction_id must refer to a SELL transaction")

    buy = scope.query(DBTransaction).filter(DBTransaction.id == payload.buy_transaction_id).first()
    if not buy or buy.action.upper() not in BUY_ACTIONS:
        raise HTTPException(status_code=400, detail="buy_transaction_id must refer to a BUY transaction")

    if buy.ticker != sell.ticker or buy.brokerage != sell.brokerage or buy.assetType != sell.assetType:
        raise HTTPException(status_code=400, detail="Buy and sell must be for the same ticker, brokerage, and asset type")

    if buy.date >= sell.date:
        raise HTTPException(status_code=400, detail="Buy must occur before the sell date")

    # Check that assigned quantity doesn't exceed the buy lot's available quantity
    already_assigned = (
        scope.query(LotAssignment)
        .filter(LotAssignment.buy_transaction_id == payload.buy_transaction_id)
        .all()
    )
    total_assigned = sum(a.quantity for a in already_assigned)
    if total_assigned + payload.quantity > buy.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Assignment exceeds available buy quantity. Available: {buy.quantity - total_assigned:.4f}"
        )

    assignment = LotAssignment(
        sell_transaction_id=payload.sell_transaction_id,
        buy_transaction_id=payload.buy_transaction_id,
        quantity=payload.quantity,
    )
    scope.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/lot-assignments/{assignment_id}")
def delete_lot_assignment(assignment_id: int, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Remove a lot assignment."""
    assignment = scope.query(LotAssignment).filter(LotAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted"}


@router.get("/lot-assignments/open-buys")
def get_open_buys(sell_transaction_id: int, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """
    Return open BUY lots available to assign to a given SELL transaction.
    These are BUY transactions for the same ticker/brokerage, dated before the sell,
    with their remaining unassigned quantity.
    """
    sell = scope.query(DBTransaction).filter(DBTransaction.id == sell_transaction_id).first()
    if not sell or sell.action.upper() not in SELL_ACTIONS:
        raise HTTPException(status_code=400, detail="sell_transaction_id must refer to a SELL transaction")

    buys = (
        scope.query(DBTransaction)
        .filter(
            DBTransaction.ticker == sell.ticker,
            DBTransaction.brokerage == sell.brokerage,
            DBTransaction.assetType == sell.assetType,
            func.upper(DBTransaction.action).in_(list(BUY_ACTIONS)),
            DBTransaction.date < sell.date,
            DBTransaction.is_deleted == False,
        )
        .order_by(DBTransaction.date)
        .all()
    )

    # Compute already-assigned quantities per buy lot
    all_assignments = scope.query(LotAssignment).filter(
        LotAssignment.buy_transaction_id.in_([b.id for b in buys])
    ).all()
    assigned_map = {}
    for a in all_assignments:
        assigned_map[a.buy_transaction_id] = assigned_map.get(a.buy_transaction_id, 0) + a.quantity

    result = []
    for b in buys:
        available = b.quantity - assigned_map.get(b.id, 0)
        if available > 0:
            result.append({
                "id": b.id,
                "date": b.date,
                "ticker": b.ticker,
                "quantity": b.quantity,
                "available_quantity": round(available, 6),
                "price": b.price,
                "brokerage": b.brokerage,
            })
    return result
