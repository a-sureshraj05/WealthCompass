"""Authenticated fresh news requests, ranked separately for the current user."""
import asyncio
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from backend.app.api.deps import get_user_scope
from backend.app.core.scoping import UserScope
from backend.app.core import portfolio_news
from backend.app.db.schema import Holding

router = APIRouter()
_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix='portfolio-news')
_lock = threading.Lock()
_calls = {}


def _admit(user_id):
    now = time.monotonic()
    with _lock:
        # Bounded request metadata, no holdings or news shared across users.
        expired = [key for key, times in _calls.items() if not times or times[-1] < now - 60]
        for key in expired:
            _calls.pop(key, None)
        times = _calls.setdefault(user_id, deque())
        while times and times[0] < now - 60:
            times.popleft()
        if len(times) >= 6:
            raise HTTPException(status_code=429, detail='News was requested several times. Please try again in a minute.')
        times.append(now)


@router.post('/news/refresh')
async def refresh_news(scope: UserScope = Depends(get_user_scope)):
    _admit(scope.user_id)
    # Resolve encrypted, scoped values on the request thread before any worker.
    weights = portfolio_news.portfolio_weights(scope.query(Holding).all())
    requested = list(weights)[:portfolio_news.MAX_SYMBOLS]
    base = dict(checkedAt=datetime.now(timezone.utc).isoformat(), items=[], totalHoldings=len(weights), checkedHoldings=len(requested), coverageWeight=sum(weights[s] for s in requested), failedHoldings=0, preview=False)
    if not requested:
        return dict(base, status='empty', message='Connect or import holdings to get portfolio news.')
    loop = asyncio.get_running_loop()
    async def fetch(symbol):
        try:
            return symbol, await loop.run_in_executor(_pool, portfolio_news.fetch_symbol_news, symbol), False
        except Exception:
            return symbol, [], True
    tasks = [asyncio.create_task(fetch(symbol)) for symbol in requested]
    done, pending = await asyncio.wait(tasks, timeout=22)
    for task in pending:
        task.cancel()
    responses = [task.result() for task in done]
    failures = sum(failed for _, _, failed in responses) + len(pending)
    items = portfolio_news.rank_articles({symbol:rows for symbol, rows, _ in responses}, weights, datetime.now(timezone.utc))
    message = 'Some sources could not be checked. Showing the stories retrieved.' if failures else None
    if not items:
        message = 'News sources are temporarily unavailable. Please try again.' if failures else 'No recent stories were returned for the checked holdings.'
    return dict(base, checkedAt=datetime.now(timezone.utc).isoformat(), items=items, failedHoldings=failures, status='partial' if items and failures else 'ready' if items else 'unavailable' if failures else 'empty', message=message)
