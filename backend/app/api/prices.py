"""Live price refresh.

`process_transactions()` is the only other path that writes `currentPrice`, and
it rebuilds every tax lot to do so. Prices are just a projection over existing
lots, so this router re-fetches quotes and updates them in place — leaving lot
structure, lot assignments, and realized gains untouched.
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.stock_fetcher import get_stock_quote
from backend.app.core.table_loader import holding_loader
from backend.app.core.table_loader.holding_loader import _multiplier
from backend.app.db.schema import UnrealizedGain

logger = logging.getLogger(__name__)
router = APIRouter()

# yfinance calls are network-bound; option chains are the slow ones. Keep the
# pool modest to avoid tripping rate limiting on a ~60 symbol portfolio.
MAX_WORKERS = 8


class PriceRefreshResult(BaseModel):
    symbols: int          # distinct symbols quoted
    lotsUpdated: int      # unrealized_gains rows written
    failed: List[str]     # symbols yfinance could not price


@router.post("/prices/refresh", response_model=PriceRefreshResult)
def refresh_prices(db: Session = Depends(get_db)):
    """Re-quote every open lot and rebuild holdings from the new prices.

    Wash-sale fields are intentionally left alone: `wash_sale_at_risk` depends on
    `wash_sale_recent_buy_date`, which is not persisted on the row, so it cannot
    be re-derived here. Those are recomputed on the next full reprocess.
    """
    lots = db.query(UnrealizedGain).all()
    if not lots:
        return PriceRefreshResult(symbols=0, lotsUpdated=0, failed=[])

    # One quote per distinct symbol — the OCC symbol for options, else the ticker.
    symbols = sorted({(lot.option_symbol or lot.ticker) for lot in lots if (lot.option_symbol or lot.ticker)})

    try:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
            quotes_raw = list(pool.map(get_stock_quote, symbols))
    except Exception as e:
        logger.exception("Price refresh failed during fetch")
        raise HTTPException(status_code=502, detail=f"Price fetch failed: {e}")

    quotes = {}
    failed = []
    for symbol, (current, prev) in zip(symbols, quotes_raw):
        if current is None:
            failed.append(symbol)
            continue
        quotes[symbol] = (current, prev if prev is not None else current)

    # Feeds holding_loader's equity previous-close lookup; options are derived
    # from their own lots inside the loader.
    prev_close_cache = {}
    lots_updated = 0
    for lot in lots:
        quote = quotes.get(lot.option_symbol or lot.ticker)
        if not quote:
            continue
        current, prev = quote
        lot.currentPrice = current
        lot.prevClose = prev
        lot.unrealizedGain = lot.quantity * _multiplier(lot.assetType) * (current - lot.buyPrice)
        if not lot.option_symbol:
            prev_close_cache[lot.ticker] = prev
        lots_updated += 1

    db.commit()

    # Holdings are a pure aggregate of the lots above, so rebuild rather than
    # letting the two views drift apart.
    holding_loader.load(db, prev_close_cache=prev_close_cache)

    logger.info("Price refresh: %d symbols, %d lots updated, %d failed",
                len(symbols), lots_updated, len(failed))
    return PriceRefreshResult(symbols=len(symbols), lotsUpdated=lots_updated, failed=failed)
