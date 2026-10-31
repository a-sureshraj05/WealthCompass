"""Live price refresh.

`process_transactions()` is the only other path that writes `currentPrice`, and
it rebuilds every tax lot to do so. Prices are just a projection over existing
lots, so this router re-fetches quotes and updates them in place — leaving lot
structure, lot assignments, and realized gains untouched.
"""

import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.api.deps import get_user_scope
from backend.app.core.database import engine, get_db
from backend.app.core.scoping import UserScope
from backend.app.core.stock_fetcher import get_stock_quote, is_expired_option
from backend.app.core.table_loader import holding_loader
from backend.app.core.table_loader.holding_loader import _multiplier
from backend.app.db.schema import UnrealizedGain

logger = logging.getLogger(__name__)
router = APIRouter()

# yfinance calls are network-bound; option chains are the slow ones. Keep the
# pool modest to avoid tripping rate limiting on a ~60 symbol portfolio.
MAX_WORKERS = 8

# holding_loader.load() is delete-then-insert with a commit in between, so two
# refreshes running at once interleave as: A deletes, B deletes (nothing left),
# A inserts, B inserts — leaving every holding duplicated and the portfolio
# total exactly doubled. Easy to hit, since the frontend refreshes on mount and
# the app is open on more than one device.
#
# Serialising the whole endpoint is the right trade here: a refresh is a
# read-mostly rebuild that takes a couple of seconds, and two concurrent ones
# would only fetch the same quotes twice. FastAPI runs sync endpoints in a
# threadpool, so a module-level lock is sufficient — on SQLite, i.e. local dev
# only. It is per-process, not per-database, so it stops protecting anything
# the moment this runs under more than one worker/replica, which is exactly
# the Postgres-hosted case below. Frozen as the dev-only fallback, not grown.
_refresh_lock = threading.Lock()


class PriceRefreshResult(BaseModel):
    symbols: int          # distinct symbols quoted
    lotsUpdated: int      # unrealized_gains rows written
    failed: List[str]     # symbols yfinance could not price


@router.post("/prices/refresh", response_model=PriceRefreshResult)
def refresh_prices(db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Re-quote every open lot and rebuild holdings from the new prices.

    Serialised per-user; see _refresh_lock's comment for the race this
    guards against (duplicated holdings from two concurrent refreshes).

    Wash-sale fields are intentionally left alone: `wash_sale_at_risk` depends on
    `wash_sale_recent_buy_date`, which is not persisted on the row, so it cannot
    be re-derived here. Those are recomputed on the next full reprocess.
    """
    if engine.dialect.name == "sqlite":
        with _refresh_lock:
            return _refresh_prices_locked(scope)

    # Postgres: a session-level advisory lock, keyed by user_id (already an
    # int — no hashing needed), held on a DEDICATED connection across the
    # whole critical section. Deliberately NOT pg_advisory_xact_lock:
    # _refresh_prices_locked commits three times internally (once below,
    # twice inside holding_loader's delete-then-insert), so a transaction-
    # scoped lock would release at the FIRST of those commits — before the
    # actual race window even begins. Must also not be scope.db's own
    # connection: that one gets returned to the pool at each of those
    # internal commits, which would release a session-level lock the same
    # way. The explicit unlock in `finally` is mandatory, not best-effort —
    # an unreleased session-level lock poisons whatever pooled connection it
    # rode on until the pool recycles it; these locks only release on
    # explicit unlock or socket close, never on a plain return-to-pool.
    #
    # Naturally per-user rather than global, unlike the SQLite fallback
    # above — a real improvement, not just a port: unrelated users'
    # refreshes no longer block each other, only a user's own overlapping
    # calls (e.g. two open tabs) do.
    with engine.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(:uid)"), {"uid": scope.user_id})
        try:
            return _refresh_prices_locked(scope)
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:uid)"), {"uid": scope.user_id})


def _refresh_prices_locked(scope: UserScope) -> PriceRefreshResult:
    db = scope.db
    lots = scope.query(UnrealizedGain).all()
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
        # `is None` isn't enough: a 0 from a thin or throttled quote is falsy but
        # not None, and storing it would mark a live position worthless. Only an
        # expired contract is legitimately worth zero.
        if current is None or current <= 0:
            if is_expired_option(symbol):
                quotes[symbol] = (0.0, 0.0)
            else:
                failed.append(symbol)
            continue
        quotes[symbol] = (current, prev if prev and prev > 0 else current)

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
    holding_loader.load(scope, prev_close_cache=prev_close_cache)

    logger.info("Price refresh: %d symbols, %d lots updated, %d failed",
                len(symbols), lots_updated, len(failed))
    return PriceRefreshResult(symbols=len(symbols), lotsUpdated=lots_updated, failed=failed)
