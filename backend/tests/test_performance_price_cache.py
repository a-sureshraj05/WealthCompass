"""A long first backfill must not make one remote SELECT per market day."""
from datetime import date, datetime, timedelta

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.app.core.performance_history import cache_market_prices
from backend.app.db.schema import HistoricalPrice


def test_price_backfill_batches_lookups_and_preserves_unrelated_cached_prices():
    engine = create_engine('sqlite:///:memory:')
    HistoricalPrice.__table__.create(engine)
    db = sessionmaker(bind=engine, autoflush=False)()
    start = date(2020, 1, 1)
    old = datetime(2020, 1, 1)
    now = datetime(2026, 11, 7)
    db.add_all([
        HistoricalPrice(symbol='AAPL', date=start, close=1, split_ratio=1, currency='USD', fetched_at=old),
        HistoricalPrice(symbol='AAPL', date=start-timedelta(days=1), close=77, split_ratio=1, currency='USD', fetched_at=old),
        HistoricalPrice(symbol='OTHER', date=start, close=88, split_ratio=1, currency='USD', fetched_at=old),
    ])
    db.commit()
    selects = []
    def count_selects(conn, cursor, statement, parameters, context, many):
        if statement.lstrip().upper().startswith('SELECT'):
            selects.append(statement)
    event.listen(engine, 'before_cursor_execute', count_selects)
    market = {start+timedelta(days=n): {'close': 100+n, 'currency': 'USD'} for n in range(2000)}
    spy = {start: {'close': 300, 'adjusted': 250, 'split': 2, 'currency': 'USD'}}
    cache_market_prices(db, {'AAPL': market, 'SPY:TOTAL_RETURN': spy, 'EMPTY': {}}, now)
    db.commit()
    assert len(selects) == 2  # One query per instrument, independent of day count.
    event.remove(engine, 'before_cursor_execute', count_selects)
    assert db.query(HistoricalPrice).count() == 2003
    assert db.get(HistoricalPrice, ('AAPL', start)).close == 100
    assert db.get(HistoricalPrice, ('AAPL', start+timedelta(days=1999))).close == 2099
    benchmark = db.get(HistoricalPrice, ('SPY:TOTAL_RETURN', start))
    assert (benchmark.close, benchmark.adjusted_close, benchmark.split_ratio, benchmark.fetched_at) == (300, 250, 2, now)
    for symbol, day, price in [('OTHER', start, 88), ('AAPL', start-timedelta(days=1), 77)]:
        row = db.get(HistoricalPrice, (symbol, day))
        assert row.close == price and row.fetched_at == old
    cache_market_prices(db, {'AAPL': market, 'SPY:TOTAL_RETURN': spy}, now)
    db.commit()
    assert db.query(HistoricalPrice).count() == 2003
    db.close()
    engine.dispose()
