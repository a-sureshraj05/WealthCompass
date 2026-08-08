import logging
from typing import Any, Dict, Tuple
from sqlalchemy.orm import Session
from backend.app.db.schema import Holding, UnrealizedGain
from backend.app.core.scoping import UserScope
from backend.app.core.utils.asset_type import normalize as normalize_asset_type

logger = logging.getLogger(__name__)

_OPTIONS_MULTIPLIER = 100  # 1 contract = 100 underlying shares


def _multiplier(asset_type: str) -> int:
    return _OPTIONS_MULTIPLIER if (asset_type or "").lower() == "options" else 1


def delete(scope: UserScope, brokerage_name: str = None) -> None:
    # Scoped delete: unscoped, this clears every user's holdings.
    scope.delete_all(Holding, brokerage=brokerage_name)
    scope.db.commit()


def load(scope: UserScope, brokerage_name: str = None, prev_close_cache: Dict[str, float] = None) -> None:
    logger.info("Starting load for user %s, brokerage: %s", scope.user_id, brokerage_name)
    delete(scope, brokerage_name)

    query = scope.query(UnrealizedGain)
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
                "marketValue": 0.0,
                "prevMarketValue": 0.0,
                "assetType": row.assetType,
            }

        m = _multiplier(row.assetType)
        # Value each lot at its own price before summing. An options position can
        # hold several contracts at different strikes/expiries, so a single price
        # cannot stand in for the group.
        current = row.currentPrice or 0.0
        prev = row.prevClose if row.prevClose is not None else current
        aggregated[key]["quantity"] += row.quantity
        aggregated[key]["totalCost"] += row.quantity * m * row.buyPrice
        aggregated[key]["marketValue"] += row.quantity * m * current
        aggregated[key]["prevMarketValue"] += row.quantity * m * prev

    holdings_list = []
    for agg in aggregated.values():
        total_quantity = agg["quantity"]
        total_cost = agg["totalCost"]
        market_value = agg["marketValue"]
        ticker = agg["ticker"]

        m = _multiplier(agg.get("assetType"))
        units = total_quantity * m
        # Blended per-unit prices derived from the summed values, so a multi-strike
        # options position reports a real weighted average rather than one lot's price.
        current_price = market_value / units if units > 0 else 0.0
        prev_close = agg["prevMarketValue"] / units if units > 0 else current_price
        # Equities carry a shared per-ticker close; options must come from the lots,
        # since prev_close_cache is only populated for non-options.
        if m == 1:
            prev_close = (prev_close_cache or {}).get(ticker, prev_close)
        holding = Holding(
            brokerage=agg["brokerage"],
            account_id=agg.get("account_id"),
            ticker=ticker,
            quantity=total_quantity,
            averageCostPerShare=total_cost / total_quantity if total_quantity > 0 else 0.0,
            totalCost=total_cost,
            currentPrice=current_price,
            previousClose=prev_close,
            marketValue=market_value,
            assetType=normalize_asset_type(agg.get("assetType") or "", ticker=ticker),
        )
        holdings_list.append(holding)

    try:
        logger.info("Adding %d aggregated holdings to DB.", len(holdings_list))
        scope.add_all(holdings_list)  # stamps user_id
        scope.db.commit()
        logger.info("Successfully committed aggregated holdings.")
    except Exception as e:
        scope.db.rollback()
        logger.error("ERROR committing aggregated holdings: %s", e)
        raise
