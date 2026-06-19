import logging
from typing import Any, Dict, Tuple
from sqlalchemy.orm import Session
from backend.app.db.schema import Holding, UnrealizedGain
from backend.app.core.utils.asset_type import normalize as normalize_asset_type

logger = logging.getLogger(__name__)

_OPTIONS_MULTIPLIER = 100  # 1 contract = 100 underlying shares


def _multiplier(asset_type: str) -> int:
    return _OPTIONS_MULTIPLIER if (asset_type or "").lower() == "options" else 1


def delete(db: Session, brokerage_name: str = None) -> None:
    if brokerage_name:
        db.query(Holding).filter(Holding.brokerage == brokerage_name).delete()
    else:
        db.query(Holding).delete()
    db.commit()


def load(db: Session, brokerage_name: str = None, prev_close_cache: Dict[str, float] = None) -> None:
    logger.info("Starting load for brokerage: %s", brokerage_name)
    delete(db, brokerage_name)

    query = db.query(UnrealizedGain)
    if brokerage_name:
        query = query.filter(UnrealizedGain.brokerage == brokerage_name)
    unrealized_rows = query.all()

    aggregated: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for row in unrealized_rows:
        if row.quantity < 1e-6:
            continue

        key = (row.brokerage, row.account_id, row.ticker, (row.assetType or "equity").lower())
        if key not in aggregated:
            aggregated[key] = {
                "brokerage": row.brokerage,
                "account_id": row.account_id,
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
        ticker = agg["ticker"]

        m = _multiplier(agg.get("assetType"))
        prev_close = (prev_close_cache or {}).get(ticker, current_price)
        holding = Holding(
            brokerage=agg["brokerage"],
            account_id=agg.get("account_id"),
            ticker=ticker,
            quantity=total_quantity,
            averageCostPerShare=total_cost / total_quantity if total_quantity > 0 else 0.0,
            totalCost=total_cost,
            currentPrice=current_price,
            previousClose=prev_close,
            marketValue=total_quantity * m * current_price,
            assetType=normalize_asset_type(agg.get("assetType") or "", ticker=ticker),
        )
        holdings_list.append(holding)

    try:
        logger.info("Adding %d aggregated holdings to DB.", len(holdings_list))
        db.add_all(holdings_list)
        db.commit()
        logger.info("Successfully committed aggregated holdings.")
    except Exception as e:
        db.rollback()
        logger.error("ERROR committing aggregated holdings: %s", e)
        raise
