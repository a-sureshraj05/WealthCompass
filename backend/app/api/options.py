from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api.deps import get_user_scope
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.db.schema import UnrealizedGain, RealizedGain, OptionsRetain
from backend.app.core.utils.ticker import underlying_ticker as _underlying_ticker

router = APIRouter()

OPTIONS_MULTIPLIER = 100  # 1 contract = 100 shares


class RetainUpdate(BaseModel):
    brokerage: str
    ticker: str
    buy_date: str  # ISO datetime string
    retain_quantity: float


def _retain_map(db: Session) -> dict:
    return {
        (r.brokerage, r.ticker, r.buy_date): r.retain_quantity
        for r in scope.query(OptionsRetain).all()
    }


@router.get("/options/positions")
def get_open_options(db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Return all open options lots with their retain quantities."""
    lots = (
        scope.query(UnrealizedGain)
        .filter(UnrealizedGain.assetType == "Options")
        .order_by(UnrealizedGain.ticker, UnrealizedGain.buyDate)
        .all()
    )
    retains = _retain_map(db)

    result = []
    for lot in lots:
        underlying = _underlying_ticker(lot.ticker)
        retain_qty = min(retains.get((lot.brokerage, underlying, lot.buyDate), 0), lot.quantity)
        sellable_qty = max(0.0, lot.quantity - retain_qty)
        result.append({
            "id": lot.id,
            "brokerage": lot.brokerage,
            "account_id": lot.account_id,
            "ticker": _underlying_ticker(lot.ticker),
            "buyDate": lot.buyDate.isoformat() if lot.buyDate else None,
            "quantity": lot.quantity,
            "retainQuantity": retain_qty,
            "sellableQuantity": sellable_qty,
            "buyPrice": lot.buyPrice,
            "currentPrice": lot.currentPrice,
            "prevClose": lot.prevClose,
            "unrealizedGain": lot.unrealizedGain,
            "isLongTerm": lot.isLongTerm,
            "option_symbol": lot.option_symbol,
        })
    return result


@router.put("/options/retain")
def update_retain(payload: RetainUpdate, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Upsert the retain quantity for an open options lot."""
    buy_date = datetime.fromisoformat(payload.buy_date)
    existing = (
        scope.query(OptionsRetain)
        .filter(
            OptionsRetain.brokerage == payload.brokerage,
            OptionsRetain.ticker == payload.ticker,
            OptionsRetain.buy_date == buy_date,
        )
        .first()
    )
    if existing:
        existing.retain_quantity = payload.retain_quantity
    else:
        scope.add(OptionsRetain(
            brokerage=payload.brokerage,
            ticker=payload.ticker,
            buy_date=buy_date,
            retain_quantity=payload.retain_quantity,
        ))
    db.commit()
    return {"ok": True}


@router.get("/options/calculator")
def get_calculator(db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """
    Compute how much the sellable contracts need to gain to cover:
      1. Total outstanding options premium (cost of ALL open positions)
      2. All realized losses
      3. Tax: 40% of (current-year short-term realized gains + unrealized gains)
    """
    current_year = datetime.now().year

    # --- Open options positions ---
    lots = scope.query(UnrealizedGain).filter(UnrealizedGain.assetType == "Options").all()
    retains = _retain_map(db)

    outstanding_premium = 0.0
    total_sellable_qty = 0.0
    total_sellable_value = 0.0

    positions = []
    for lot in lots:
        retain_qty = min(retains.get((lot.brokerage, _underlying_ticker(lot.ticker), lot.buyDate), 0), lot.quantity)
        sellable_qty = max(0.0, lot.quantity - retain_qty)
        lot_premium = lot.quantity * OPTIONS_MULTIPLIER * lot.buyPrice
        outstanding_premium += lot_premium
        total_sellable_qty += sellable_qty
        total_sellable_value += sellable_qty * OPTIONS_MULTIPLIER * lot.currentPrice

    # --- Realized gains/losses (options only) ---
    all_realized = scope.query(RealizedGain).all()
    options_realized = [g for g in all_realized if (g.assetType or "").lower() == "options"]
    realized_losses = abs(sum(g.gain for g in options_realized if g.gain < 0))

    # Current-year short-term realized gains from OPTIONS only
    current_year_short_term = sum(
        g.gain for g in options_realized
        if g.gain > 0
        and not g.isLongTerm
        and g.sellDate is not None
        and g.sellDate.year == current_year
    )

    # --- Unrealized gains (options only, positive) ---
    unrealized_gains = sum(
        lot.unrealizedGain for lot in lots
        if lot.unrealizedGain > 0
    )

    # --- Tax estimate: 40% of taxable amount ---
    taxable = max(0.0, current_year_short_term + unrealized_gains)
    tax_estimate = 0.40 * taxable

    # --- Total needed from selling sellable contracts ---
    total_needed = outstanding_premium + realized_losses + tax_estimate

    # --- Projected gain % ---
    if total_sellable_value > 0 and total_sellable_qty > 0:
        projected_gain_pct = (total_needed / total_sellable_value - 1) * 100
        target_price_per_contract = total_needed / (total_sellable_qty * OPTIONS_MULTIPLIER)
    else:
        projected_gain_pct = None
        target_price_per_contract = None

    return {
        "outstandingPremium": round(outstanding_premium, 2),
        "realizedLosses": round(realized_losses, 2),
        "currentYearShortTermGains": round(current_year_short_term, 2),
        "unrealizedGains": round(unrealized_gains, 2),
        "taxEstimate": round(tax_estimate, 2),
        "totalNeeded": round(total_needed, 2),
        "totalSellableValue": round(total_sellable_value, 2),
        "totalSellableQty": total_sellable_qty,
        "projectedGainPct": round(projected_gain_pct, 2) if projected_gain_pct is not None else None,
        "targetPricePerContract": round(target_price_per_contract, 4) if target_price_per_contract is not None else None,
        "taxYear": current_year,
    }
