"""Build an encrypted, user-scoped daily history from the actual stored ledger."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import hashlib
import json
import threading
from sqlalchemy import or_
from zoneinfo import ZoneInfo

from backend.app.core import crypto
from backend.app.core.database import SessionLocal
from backend.app.core.scoping import UserScope
from backend.app.core.performance_ledger import ledger_events, reconstruct, issue
from backend.app.core.performance_prices import fetch_instrument, fetch_spy
from backend.app.core.spy_trade_benchmark import trade_matched_spy
from backend.app.db.schema import HistoricalPrice, PortfolioDailyValue, PortfolioPerformanceState, PortfolioTradeBenchmark, SnaptradeTransaction, Transaction

VERSION = "ledger-close-v2-spy-trades"
_jobs = {}
_jobs_lock = threading.Lock()


def valuation_cutoff():
    now = datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York"))
    day = now.date()
    if (now.hour, now.minute) < (16, 20): day -= timedelta(days=1)
    while day.weekday() >= 5: day -= timedelta(days=1)
    return day


def source_ledger(scope, cutoff):
    rows = scope.query(Transaction).filter(Transaction.is_deleted == False, Transaction.is_duplicate == False, or_(Transaction.date.is_(None), Transaction.date < datetime.combine(cutoff + timedelta(days=1), datetime.min.time()))).order_by(Transaction.date, Transaction.id).all()
    return rows


def signature(rows, opening_cash, cutoff):
    serial = [[row.id, str(row.date), row.brokerage, row.account_id, row.ticker, row.option_symbol, row.action, row.quantity, row.price, row.totalCost, row.assetType, row.source, row.raw_id, row.is_override] for row in rows]
    return hashlib.sha256(json.dumps([VERSION, str(cutoff), opening_cash, serial], sort_keys=True).encode()).hexdigest()


def job_status(user_id):
    with _jobs_lock: return dict(_jobs.get(user_id, {}))


def read_history(scope):
    job = job_status(scope.user_id)
    if job.get("running"): return {"status": "building", "progress": job.get("progress", "Loading historical prices…")}
    cutoff = valuation_cutoff()
    state = scope.query(PortfolioPerformanceState).first()
    rows = source_ledger(scope, cutoff)
    if not rows: return {"status": "empty", "issues": [issue("empty", "No transactions are recorded before the latest completed trading day.")], "snapshots": []}
    if not state or state.fingerprint != signature(rows, state.opening_cash, cutoff): return {"status": "needs_rebuild", "transactionCount": len(rows)}
    result = dict(state.result or {})
    result["issues"] = list(result.get("issues", []))
    result["generatedAt"] = state.generated_at.isoformat() + "Z" if state.generated_at else None
    result["openingCash"] = state.opening_cash
    if result.get("status") == "error": return result
    daily = scope.query(PortfolioDailyValue).order_by(PortfolioDailyValue.date).all()
    # Never bridge a missing valuation. Show the latest complete interval,
    # disclosing any unavailable later history rather than extending its date.
    intervals, interval = [], []
    for row in daily:
        if row.complete and row.total_value is not None and row.total_value >= 0:
            if row.total_value > 0 or interval: interval.append(row)
            if row.total_value == 0 and interval:
                intervals.append(interval)
                interval = []
        else:
            if interval: intervals.append(interval)
            interval = []
    if interval: intervals.append(interval)
    usable = next((segment for segment in reversed(intervals) if len(segment) > 1), [])
    blocked = result.get("blocking", False)
    if blocked: usable = []
    if usable and usable[-1].date < cutoff:
        result.setdefault("issues", []).insert(0, issue("coverage_end", "The chart ends at the last complete interval; later valuations are unavailable. No gap is bridged.", usable[-1].date))
    matched = {row.date: row for row in scope.query(PortfolioTradeBenchmark).all()}
    result["snapshots"] = [{"date": row.date.isoformat(), "value": row.total_value, "deposits": row.deposits, "withdrawals": row.withdrawals, "spyTotalReturnIndex": row.spy_index,
                            "spyTradeValue": matched[row.date].total_value if row.date in matched else None,
                            "spyTradeCash": matched[row.date].cash if row.date in matched else None} for row in usable]
    result["status"] = "ready" if len(usable) > 1 else "incomplete"
    result["asOf"] = daily[-1].date.isoformat() if daily else str(cutoff)
    result["coverageEnd"] = usable[-1].date.isoformat() if usable else None
    result["marketDates"] = [row.date.isoformat() for row in daily]
    result["firstYear"] = usable[0].date.year if usable else cutoff.year
    result["coverageStart"] = usable[0].date.isoformat() if usable else None
    return result


def queue_build(scope, opening_cash=None, set_opening=False):
    with _jobs_lock:
        if _jobs.get(scope.user_id, {}).get("running"): return False
        _jobs[scope.user_id] = {"running": True, "progress": "Reading your recorded transactions…"}
    if set_opening:
        state = scope.query(PortfolioPerformanceState).first()
        if state is None: state = PortfolioPerformanceState(); scope.add(state)
        try:
            state.opening_cash = opening_cash
            state.fingerprint = None
            scope.db.commit()
        except Exception:
            with _jobs_lock: _jobs.pop(scope.user_id, None)
            raise
    return True


def _progress(user_id, text):
    with _jobs_lock: _jobs[user_id] = {"running": True, "progress": text}


def cache_market_prices(db, histories, now):
    """Load each instrument's public cache once, rather than once per session."""
    for symbol, history in histories.items():
        if not history:
            continue
        cached_rows = db.query(HistoricalPrice).filter(
            HistoricalPrice.symbol == symbol,
            HistoricalPrice.date >= min(history),
            HistoricalPrice.date <= max(history),
        ).all()
        cached_by_date = {row.date: row for row in cached_rows}
        for day, point in history.items():
            cached = cached_by_date.get(day)
            if cached is None:
                cached = HistoricalPrice(symbol=symbol, date=day)
                db.add(cached)
            cached.close = point["close"]
            cached.adjusted_close = point.get("adjusted")
            cached.split_ratio = point.get("split", 1.0)
            cached.currency = point["currency"]
            cached.fetched_at = now


def build_history(user_id, dek, session_factory=SessionLocal):
    token = crypto.CURRENT_DEK.set(dek)
    db = session_factory()
    scope = UserScope(db, user_id)
    try:
        _build(scope)
    except Exception:
        db.rollback()
        # Do not log transaction contents or leak provider request details.
        state = scope.query(PortfolioPerformanceState).first()
        if state is None: state = PortfolioPerformanceState(); scope.add(state)
        state.result = {"status": "error", "issues": [issue("build_failed", "History could not be rebuilt. Retry the historical-price request.")], "snapshots": []}
        state.fingerprint = signature(source_ledger(scope, valuation_cutoff()), state.opening_cash, valuation_cutoff())
        state.generated_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()
        crypto.CURRENT_DEK.reset(token)
        with _jobs_lock: _jobs.pop(user_id, None)


def _build(scope):
    cutoff = valuation_cutoff()
    state = scope.query(PortfolioPerformanceState).first()
    if state is None: state = PortfolioPerformanceState(); scope.add(state)
    transactions = source_ledger(scope, cutoff)
    fingerprint = signature(transactions, state.opening_cash, cutoff)
    raw_ids = [row.raw_id for row in transactions if row.source == "snaptrade" and row.raw_id]
    currencies = {row.id: row.currency or "USD" for row in scope.query(SnaptradeTransaction).filter(SnaptradeTransaction.id.in_(raw_ids)).all()} if raw_ids else {}
    events, issues = ledger_events(transactions, currencies)
    daily, market, spy = [], {}, {}
    matched, matched_issues = {}, []
    securities = defaultdict(list)
    for event in events:
        if event.kind in {"buy", "sell", "reinvest", "expiry"}: securities[event.symbol].append(event)
    if len(securities) > 200: issues.append(issue("too_many_symbols", "This rebuild supports up to 200 instruments."))
    if not issues and events:
        start = min(event.day for event in events)
        _progress(scope.user_id, "Fetching SPY total-return history…")
        try:
            spy = fetch_spy(start, cutoff)
            if not spy: raise ValueError("No benchmark history")
        except Exception:
            cached = scope.db.query(HistoricalPrice).filter(HistoricalPrice.symbol == "SPY:TOTAL_RETURN", HistoricalPrice.date >= start - timedelta(days=10), HistoricalPrice.date <= cutoff, HistoricalPrice.currency == "USD", HistoricalPrice.adjusted_close > 0).all()
            spy = {row.date: {"close": row.close, "adjusted": row.adjusted_close, "split": row.split_ratio, "currency": row.currency} for row in cached}
            issues.append(issue("benchmark", "Fresh SPY history could not be retrieved. Only previously cached benchmark sessions, if available, are used. Retry when the price provider is available."))
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(fetch_instrument, symbol, rows, cutoff): symbol for symbol, rows in securities.items()}
            for count, future in enumerate(as_completed(futures), 1):
                symbol = futures[future]
                try: market[symbol] = future.result()
                except Exception:
                    cached_rows = scope.db.query(HistoricalPrice).filter(HistoricalPrice.symbol == symbol, HistoricalPrice.date >= min(event.day for event in securities[symbol]), HistoricalPrice.date <= cutoff, HistoricalPrice.currency == "USD").all()
                    market[symbol] = {row.date: {"close": row.close, "split": row.split_ratio, "currency": row.currency} for row in cached_rows}
                    issues.append(issue("price_provider", "Historical prices or corporate-action metadata could not be retrieved for this instrument.", symbol=symbol))
                _progress(scope.user_id, f"Historical prices: {count} of {len(securities)} instruments checked…")
        # Fetched records are shared public market data, not user positions.
        _progress(scope.user_id, "Saving historical market prices…")
        cache_market_prices(scope.db, {**market, "SPY:TOTAL_RETURN": spy}, datetime.utcnow())
        if spy:
            daily, valuation_issues = reconstruct(events, market, {day: point["adjusted"] for day, point in spy.items()}, state.opening_cash)
            issues.extend(valuation_issues)
            matched, matched_issues = trade_matched_spy(events, {day: point["adjusted"] for day, point in spy.items()}, state.opening_cash)
    _progress(scope.user_id, "Saving encrypted daily valuations…")
    scope.delete_all(PortfolioDailyValue)
    scope.delete_all(PortfolioTradeBenchmark)
    for row in daily:
        scope.add(PortfolioDailyValue(date=row["date"], holdings_value=row["holdings"], cash=row["cash"], total_value=row["value"], deposits=row["deposits"], withdrawals=row["withdrawals"], spy_index=row["spyTotalReturnIndex"], complete=row["complete"]))
    for day, row in matched.items():
        scope.add(PortfolioTradeBenchmark(date=day, total_value=row["value"], cash=row["cash"]))
    state.fingerprint = fingerprint
    blocking = any(row["code"] == "opening_positions" for row in issues)
    issues.sort(key=lambda row: 0 if row["code"] in {"cash_history", "opening_positions"} else 1)
    state.result = {"status": "calculated", "issues": issues[:30], "tradeBenchmarkIssues": matched_issues, "blocking": blocking, "requiresOpeningCash": any(row["code"] == "cash_history" for row in issues), "transactionCount": len(transactions), "dailyValueCount": len(daily),
                    "method": "Daily close reconstruction; external cash flows assumed at end of day. TWR is an estimate when flows occur intraday.", "source": "Recorded transactions and Yahoo Finance historical prices", "requestedStart": min((event.day.isoformat() for event in events), default=None)}
    state.generated_at = datetime.utcnow()
    scope.db.commit()
