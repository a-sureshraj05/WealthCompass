"""Transaction-derived history: cash, closed positions, splits, gaps and tenancy."""
from datetime import date, datetime
from types import SimpleNamespace

import pandas as pd
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.core import crypto, performance_history as history, performance_prices as prices
from backend.app.core.performance_ledger import Event, holding_windows, ledger_events, reconstruct
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, HistoricalPrice, PortfolioDailyValue, Transaction


def d(day): return date(2024, 1, day)
def event(day, kind, qty=0, amount=0, symbol='AAA', multiplier=1):
    return Event(day * 10 + len(kind), d(day), symbol, kind, qty, amount, multiplier)
def spy(*days): return {d(day): 100 + day for day in days}
def market(**values): return {'AAA': {d(int(day)): {'close': value} for day, value in values.items()}}


def test_full_sale_retains_cash_without_needing_a_sale_day_or_later_quote():
    events = [event(2, 'deposit', amount=1000), event(2, 'buy', 10, 1000), event(4, 'sell', 10, 1200), event(5, 'withdrawal', amount=100)]
    rows, issues = reconstruct(events, market(**{'2': 100, '3': 110}), spy(1, 2, 3, 4, 5))
    assert not issues
    assert [row['value'] for row in rows] == [0, 1000, 1100, 1200, 1100]
    assert rows[-1]['withdrawals'] == 100
    assert holding_windows(events, {}, d(5)) == [(d(2), d(3))]


def test_partial_sale_needs_quotes_until_final_sale_and_reentry_has_separate_window():
    events = [event(2, 'deposit', amount=1000), event(2, 'buy', 10, 1000), event(3, 'sell', 5, 550), event(4, 'sell', 5, 600), event(8, 'buy', 1, 100)]
    assert holding_windows(events, {}, d(10)) == [(d(2), d(3)), (d(8), d(10))]
    rows, issues = reconstruct(events, market(**{'2': 100}), spy(1, 2, 3, 4))
    assert rows[2]['value'] is None
    assert rows[-1]['value'] == 1150
    assert issues[0]['code'] == 'missing_price'


def test_stock_split_changes_shares_not_cash_and_option_uses_contract_multiplier():
    events = [event(2, 'deposit', amount=1000), event(2, 'buy', 2, 1000), event(4, 'sell', 10, 600)]
    quotes = {'AAA': {d(2): {'close': 500}, d(3): {'close': 55, 'split': 10}, d(4): {'close': 60}}}
    rows, issues = reconstruct(events, quotes, spy(1, 2, 3, 4))
    assert not issues
    assert [row['value'] for row in rows] == [0, 1000, 1100, 1200]
    events = [event(2, 'deposit', amount=1000), event(2, 'buy', 1, 500, multiplier=100)]
    rows, _ = reconstruct(events, market(**{'2': 6}), spy(1, 2))
    assert rows[-1]['value'] == 1100


def test_income_reinvestment_and_fees_are_returns_not_funding():
    for with_dividend in (False, True):
        events = [event(2, 'deposit', amount=1001), event(2, 'buy', 10, 1000)]
        if with_dividend: events.append(event(3, 'income', amount=10))
        events += [event(3, 'reinvest', .1, 10), event(4, 'fee', amount=1)]
        rows, issues = reconstruct(events, market(**{'2': 100, '3': 100, '4': 100}), spy(1, 2, 3, 4))
        assert not issues
        assert rows[-1]['value'] == 1010
        assert rows[2]['deposits'] == 0


def test_missing_funding_never_invents_deposits_or_resumes_using_understated_cash():
    events = [event(2, 'buy', 1, 100), event(3, 'deposit', amount=200)]
    rows, issues = reconstruct(events, market(**{'2': 110, '3': 120}), spy(1, 2, 3))
    assert [row['value'] for row in rows] == [0, None, None]
    assert issues[0]['code'] == 'cash_history'
    rows, issues = reconstruct(events, market(**{'2': 110, '3': 120}), spy(1, 2, 3), opening_cash=100)
    assert not issues
    assert rows[-1]['value'] == 320


def test_weekend_funding_is_assigned_to_next_exchange_session():
    events = [event(6, 'deposit', amount=100)]  # Saturday
    rows, issues = reconstruct(events, {}, spy(5, 8))
    assert not issues
    assert rows[-1]['deposits'] == rows[-1]['value'] == 100


def transaction(**overrides):
    values = dict(id=1, date=datetime(2024, 1, 2), ticker='AAA', option_symbol=None, action='BUY', quantity=1, price=100, totalCost=100, assetType='Equity', source='manual', raw_id=None, is_override=False)
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.parametrize('changes,code', [
    ({'date': None}, 'missing_date'), ({'action': 'TRANSFER'}, 'unsupported_action'),
    ({'quantity': float('nan')}, 'invalid_number'),
    ({'source': 'snaptrade', 'action': 'DEPOSIT'}, 'ambiguous_income'),
    ({'assetType': 'Options'}, 'option_symbol'),
])
def test_invalid_or_ambiguous_records_block_reconstruction(changes, code):
    events, issues = ledger_events([transaction(**changes)])
    assert not events
    assert issues[0]['code'] == code


def test_provider_fetches_only_exposed_intervals_and_restores_as_traded_split_price(monkeypatch):
    calls = []
    class Ticker:
        def get_splits(self, **kwargs): return pd.Series([10], index=pd.to_datetime(['2024-06-10']))
        def history(self, **kwargs):
            calls.append(kwargs)
            return pd.DataFrame({'Close': [50.]}, index=pd.to_datetime([kwargs['start']]))
        def get_history_metadata(self): return {'currency': 'USD'}
    monkeypatch.setattr(prices.yf, 'Ticker', lambda symbol: Ticker())
    events = [event(2, 'buy', 1, 500), event(4, 'sell', 1, 510), event(8, 'buy', 1, 500)]
    result = prices.fetch_instrument('AAA', events, d(10))
    assert [(call['start'], call['end']) for call in calls] == [('2024-01-02', '2024-01-04'), ('2024-01-08', '2024-01-11')]
    assert result[d(2)]['close'] == 500
    assert all(call['auto_adjust'] is False for call in calls)


@pytest.fixture
def scoped(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/performance.db', connect_args={'check_same_thread': False})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    db = factory()
    dek = crypto.generate_dek()
    token = crypto.CURRENT_DEK.set(dek)
    monkeypatch.setattr(history, 'valuation_cutoff', lambda: d(5))
    monkeypatch.setattr(history, 'fetch_spy', lambda start, end: {day: {'close': value, 'adjusted': value, 'currency': 'USD'} for day, value in spy(1, 2, 3, 4, 5).items()})
    monkeypatch.setattr(history, 'fetch_instrument', lambda symbol, events, end: {d(day): {'close': 100 + day, 'currency': 'USD'} for day in (2, 3, 4, 5)})
    yield UserScope(db, 1), factory, dek
    crypto.CURRENT_DEK.reset(token)
    db.close()
    engine.dispose()


def seed(scope):
    for row in (transaction(action='BUY', assetType='Cash', ticker='CASH', totalCost=1000), transaction(id=2, quantity=5, totalCost=500)):
        values = vars(row).copy(); values.pop('id')
        scope.add(Transaction(**values))
    scope.db.commit()


def test_persisted_daily_values_encrypted_and_rebuild_is_scoped(scoped):
    scope, factory, dek = scoped
    other = UserScope(scope.db, 2)
    # Another user's encrypted rows must remain byte-identical under their DEK.
    other_token = crypto.CURRENT_DEK.set(crypto.generate_dek())
    other.add(PortfolioDailyValue(date=d(1), cash=9123.45, total_value=9123.45, deposits=0, withdrawals=0, spy_index=100, complete=True))
    scope.db.commit()
    before = scope.db.execute(text('SELECT * FROM portfolio_daily_values WHERE user_id=2')).all()
    crypto.CURRENT_DEK.reset(other_token)
    seed(scope)
    assert history.read_history(scope)['status'] == 'needs_rebuild'
    history.queue_build(scope)
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['status'] == 'ready'
    assert result['snapshots'][-1]['value'] == 1025
    assert scope.query(PortfolioDailyValue).count() == 5
    assert scope.db.query(HistoricalPrice).count() == 9
    assert before == scope.db.execute(text('SELECT * FROM portfolio_daily_values WHERE user_id=2')).all()
    raw = scope.db.execute(text('SELECT total_value FROM portfolio_daily_values WHERE user_id=1')).scalars().all()
    assert all('1025' not in value for value in raw)
    scope.query(Transaction).filter(Transaction.ticker == 'AAA').first().totalCost = 450
    scope.db.commit()
    assert history.read_history(scope)['status'] == 'needs_rebuild'


def test_failed_prices_show_only_complete_interval_and_never_use_fixture(scoped, monkeypatch):
    scope, factory, dek = scoped
    seed(scope)
    monkeypatch.setattr(history, 'fetch_instrument', lambda *args: {d(2): {'close': 102, 'currency': 'USD'}, d(3): {'close': 103, 'currency': 'USD'}})
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['status'] == 'ready'
    assert result['coverageEnd'] == '2024-01-03'
    assert result['asOf'] == '2024-01-05'
    assert len(result['snapshots']) == 2
    assert any(issue['code'] == 'missing_price' for issue in result['issues'])
    assert all(row['value'] != 212995.75 for row in result['snapshots'])


def test_unknown_date_not_silently_dropped_from_ledger(scoped):
    scope, factory, dek = scoped
    seed(scope)
    scope.add(Transaction(date=None, action='BUY', quantity=1, totalCost=50, ticker='AAA'))
    scope.db.commit()
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['status'] == 'incomplete'
    assert result['issues'][0]['code'] == 'missing_date'


def test_full_withdrawal_keeps_zero_ending_value(scoped, monkeypatch):
    scope, factory, dek = scoped
    seed(scope)
    sale = vars(transaction(date=datetime(2024, 1, 4), action='SELL', quantity=5, totalCost=525)).copy(); sale.pop('id')
    withdrawal = vars(transaction(date=datetime(2024, 1, 4), action='SELL', ticker='CASH', assetType='Cash', totalCost=1025)).copy(); withdrawal.pop('id')
    scope.add(Transaction(**sale)); scope.add(Transaction(**withdrawal)); scope.db.commit()
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['snapshots'][-1]['value'] == 0
    assert result['coverageEnd'] == '2024-01-04'


def test_standalone_reinvestment_does_not_consume_other_accounts_dividend():
    events = [Event(1, d(2), 'AAA', 'deposit', 0, 1000), Event(2, d(2), 'AAA', 'buy', 10, 1000), Event(3, d(3), 'AAA', 'income', 0, 10, account='first'), Event(4, d(3), 'AAA', 'reinvest', .1, 10, account='second')]
    rows, issues = reconstruct(events, market(**{'2': 100, '3': 100}), spy(1, 2, 3))
    assert not issues
    assert rows[-1]['value'] == 1020


def test_additive_migration_works_before_or_after_startup_create_all(tmp_path):
    import importlib.util
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect
    spec = importlib.util.spec_from_file_location('history_migration', 'backend/migrations/versions/7d0a241b51ae_add_daily_performance_history.py')
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    engine = create_engine(f'sqlite:///{tmp_path}/migration.db')
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade(); migration.upgrade()
        assert set(inspect(connection).get_table_names()) == {'historical_prices', 'portfolio_daily_values', 'portfolio_performance_state'}
        migration.downgrade()
        assert not inspect(connection).get_table_names()
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
    engine.dispose()


def test_provider_outage_reuses_genuine_cached_prices_without_erasing_valid_history(scoped, monkeypatch):
    scope, factory, dek = scoped
    seed(scope)
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    before = history.read_history(scope)['snapshots']
    def unavailable(*args): raise ConnectionError('provider unavailable')
    monkeypatch.setattr(history, 'fetch_spy', unavailable)
    monkeypatch.setattr(history, 'fetch_instrument', unavailable)
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['status'] == 'ready'
    assert result['snapshots'] == before
    assert {issue['code'] for issue in result['issues']} == {'benchmark', 'price_provider'}
