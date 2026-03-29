from typing import Any, Dict, Tuple
from sqlalchemy.orm import Session
from backend.app.db.schema import Holding, UnrealizedGain

_OPTIONS_MULTIPLIER = 100  # 1 contract = 100 underlying shares

def _multiplier(asset_type: str) -> int:
    return _OPTIONS_MULTIPLIER if (asset_type or "").lower() == "options" else 1

def delete(db: Session, brokerage_name: str = None):
    if brokerage_name:
        db.query(Holding).filter(Holding.brokerage == brokerage_name).delete()
    else:
        db.query(Holding).delete()
    db.commit()

def load(db: Session, brokerage_name: str = None):
    print(f"[holding_loader] Starting load for brokerage: {brokerage_name}")
    delete(db, brokerage_name)

    query = db.query(UnrealizedGain)
    if brokerage_name:
        query = query.filter(UnrealizedGain.brokerage == brokerage_name)
    unrealized_rows = query.all()

    aggregated: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for row in unrealized_rows:
        if row.quantity <= 0:
            continue

        key = (row.brokerage, row.ticker, (row.assetType or "equity").lower())
        if key not in aggregated:
            aggregated[key] = {
                "brokerage": row.brokerage,
                "ticker": row.ticker,
                "quantity": 0.0,
                "totalCost": 0.0,
                "currentPrice": row.currentPrice,
                "assetType": row.assetType,
            }

        m = _multiplier(row.assetType)
        aggregated[key]["quantity"] += row.quantity
        aggregated[key]["totalCost"] += row.quantity * m * row.buyPrice

    holdings_list = []
    for agg in aggregated.values():
        total_quantity = agg["quantity"]
        total_cost = agg["totalCost"]
        current_price = agg["currentPrice"]

        m = _multiplier(agg.get("assetType"))
        holding = Holding(
            brokerage=agg["brokerage"],
            ticker=agg["ticker"],
            quantity=total_quantity,
            averageCostPerShare=total_cost / total_quantity if total_quantity > 0 else 0.0,
            totalCost=total_cost,
            currentPrice=current_price,
            marketValue=total_quantity * m * current_price,
            assetType=agg.get("assetType"),
        )
        holdings_list.append(holding)

    try:
        print(f"[holding_loader] Adding {len(holdings_list)} aggregated holdings to DB.")
        db.add_all(holdings_list)
        db.commit()
        print(f"[holding_loader] Successfully committed aggregated holdings.")
    except Exception as e:
        db.rollback()
        print(f"[holding_loader] ERROR committing aggregated holdings: {e}")
        raise
