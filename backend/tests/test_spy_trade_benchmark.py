"""Trade amounts/timing, retained cash, total return, failure isolation and privacy."""
from datetime import date, datetime
import importlib.util

import pytest
from sqlalchemy import create_engine, inspect, text
from alembic.migration import MigrationContext
from alembic.operations import Operations

from backend.app.core import crypto, performance_history as history
from backend.app.core.performance_ledger import Event
from backend.app.core.spy_trade_benchmark import trade_matched_spy
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, PortfolioTradeBenchmark, Transaction
from backend.tests.test_performance_history import scoped, seed, d


def e(day, kind, amount=0, multiplier=1):
    return Event(1, date.fromisoformat(day), 'AAA', kind, 1, amount, multiplier)
def prices(**values): return {date.fromisoformat(day): value for day, value in values.items()}


def test_hundred_then_thousand_buys_and_exact_sale_amount_keep_proceeds_as_cash():
    events = [e('2020-01-02', 'deposit', 100), e('2020-01-02', 'buy', 100), e('2020-05-01', 'deposit', 1000), e('2020-05-01', 'buy', 1000), e('2020-05-03', 'sell', 300), e('2020-05-04', 'withdrawal', 100)]
    spy = prices(**{'2020-01-01':100, '2020-01-02':100, '2020-05-01':200, '2020-05-02':220, '2020-05-03':240, '2020-05-04':240})
    result, issues = trade_matched_spy(events, spy)
    assert not issues
    assert result[date(2020, 5, 1)]['value'] == pytest.approx(1200)
    assert result[date(2020, 5, 2)]['value'] == pytest.approx(1320)
    assert result[date(2020, 5, 3)] == {'value':1440, 'cash':300}
    assert result[date(2020, 5, 4)] == {'value':1340, 'cash':200}


def test_idle_cash_is_not_automatically_invested_with_a_deposit():
    events = [e('2024-01-02', 'deposit', 1000), e('2024-01-02', 'buy', 100)]
    result, issues = trade_matched_spy(events, {d(1):100, d(2):100, d(3):200})
    assert not issues
    assert result[d(3)] == {'value':1100, 'cash':900}


def test_original_income_and_reinvestment_are_not_added_on_top_of_spy_total_return():
    events = [e('2024-01-02', 'deposit', 100), e('2024-01-02', 'buy', 80), e('2024-01-03', 'income', 10), e('2024-01-03', 'reinvest', 10), e('2024-01-03', 'fee', 2)]
    result, issues = trade_matched_spy(events, {d(1):100, d(2):100, d(3):110})
    assert not issues
    assert result[d(3)] == {'value':106, 'cash':18}


def test_option_premiums_are_dollar_amounts_and_expiry_does_not_zero_spy_exposure():
    events = [e('2024-01-02', 'deposit', 1000), e('2024-01-02', 'buy', 700, 100), e('2024-01-03', 'expiry', 0, 100)]
    result, issues = trade_matched_spy(events, {d(1):100, d(2):100, d(3):110})
    assert not issues
    assert result[d(3)] == {'value':1070, 'cash':300}


def test_nontrading_day_activity_uses_next_session_and_same_day_roundtrip_is_flat():
    events = [e('2024-01-06', 'buy', 100), e('2024-01-06', 'deposit', 100), e('2024-01-07', 'sell', 100)]
    result, issues = trade_matched_spy(events, {d(5):100, d(8):120, d(9):140})
    assert not issues
    assert result[d(8)] == result[d(9)] == {'value':100, 'cash':100}


@pytest.mark.parametrize('event,code', [('sell','spy_trade_sale'), ('buy','spy_trade_cash')])
def test_impossible_trade_stops_series_without_inventing_shorting_or_funding(event, code):
    events = [e('2024-01-02', 'deposit', 100), e('2024-01-02', 'buy', 100), e('2024-01-03', event, 200), e('2024-01-04', 'deposit', 1000)]
    result, issues = trade_matched_spy(events, {d(1):100, d(2):100, d(3):100, d(4):120})
    assert issues[0]['code'] == code
    assert result[d(2)]['value'] == 100
    assert result[d(3)] == result[d(4)] == {'value':None, 'cash':None}


def test_persisted_trade_account_uses_own_scope_and_encryption(scoped):
    scope, factory, dek = scoped
    other = UserScope(scope.db, 2)
    token = crypto.CURRENT_DEK.set(crypto.generate_dek())
    other.add(PortfolioTradeBenchmark(date=d(1), total_value=9876, cash=500))
    scope.db.commit()
    before = scope.db.execute(text('SELECT * FROM portfolio_trade_benchmark WHERE user_id=2')).all()
    crypto.CURRENT_DEK.reset(token)
    seed(scope)
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['tradeBenchmarkIssues'] == []
    assert result['snapshots'][-1]['spyTradeValue'] == pytest.approx(500 + 500 * 105 / 102)
    assert result['snapshots'][-1]['spyTradeCash'] == 500
    assert scope.query(PortfolioTradeBenchmark).count() == 5
    assert before == scope.db.execute(text('SELECT * FROM portfolio_trade_benchmark WHERE user_id=2')).all()
    raw = scope.db.execute(text('SELECT total_value FROM portfolio_trade_benchmark WHERE user_id=1')).scalars().all()
    assert all(crypto.unwrap(dek, value) for value in raw)


def test_unavailable_trade_benchmark_does_not_hide_valid_portfolio_or_buy_hold(scoped):
    scope, factory, dek = scoped
    seed(scope)
    # $500 original position gains enough to sell for $1,000. SPY did not.
    scope.add(Transaction(date=datetime(2024, 1, 4), ticker='AAA', action='SELL', quantity=5, totalCost=1000, price=200, assetType='Equity'))
    scope.db.commit()
    history.build_history(1, dek, factory)
    scope.db.expire_all()
    result = history.read_history(scope)
    assert result['status'] == 'ready'
    assert result['snapshots'][-1]['value'] == 1500
    assert result['snapshots'][-1]['spyTradeValue'] is None
    assert result['snapshots'][-1]['spyTotalReturnIndex'] == 105
    assert result['tradeBenchmarkIssues'][0]['code'] == 'spy_trade_sale'


def test_additive_trade_table_migration_handles_both_creation_orders(tmp_path):
    spec = importlib.util.spec_from_file_location('trade_migration', 'backend/migrations/versions/c0926f46b738_add_spy_trade_benchmark.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    engine = create_engine(f'sqlite:///{tmp_path}/trade_migration.db')
    with engine.begin() as conn:
        module.op = Operations(MigrationContext.configure(conn))
        module.upgrade(); module.upgrade()
        assert inspect(conn).get_table_names() == ['portfolio_trade_benchmark']
        module.downgrade()
        assert not inspect(conn).get_table_names()
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        module.op = Operations(MigrationContext.configure(conn))
        module.upgrade()
    engine.dispose()
