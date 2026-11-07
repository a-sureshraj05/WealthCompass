"""A fixed, idempotent fixture completion cannot reset or mutate other accounts."""
from datetime import datetime, date

import pandas as pd
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.core import crypto
from backend.app.core.demo_performance_fixture import complete_demo_ledger, PREFIX
from backend.app.core.performance_ledger import ledger_events, reconstruct
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, ManualRawTransaction, PortfolioPerformanceState, Transaction, User
from backend.scripts.seed_demo import DEMO_CASH, DEMO_EQUITY, DEMO_OPTIONS


def seed_original(scope):
    for brokerage, day, action, amount in DEMO_CASH:
        scope.add(Transaction(brokerage=brokerage, date=datetime.fromisoformat(day), ticker='CASH', name='Cash', action=action, quantity=1, price=amount, totalCost=amount, assetType='Cash', source='snaptrade'))
    for brokerage, day, ticker, name, action, qty, amount, current in DEMO_EQUITY:
        scope.add(Transaction(brokerage=brokerage, date=datetime.fromisoformat(day), ticker=ticker, name=name, action=action, quantity=qty, price=amount/qty, totalCost=amount, assetType='Equity', source='snaptrade', current_brokerage=current))
    for brokerage, day, root, action, qty, premium in DEMO_OPTIONS:
        occ = root + '270219C00380000'
        scope.add(Transaction(brokerage=brokerage, date=datetime.fromisoformat(day), ticker=occ, name='Sample call', action=action, quantity=qty, price=premium, totalCost=qty*premium*100, assetType='Options', option_symbol=occ, source='snaptrade'))
    scope.db.commit()


@pytest.fixture
def sample(tmp_path, monkeypatch):
    engine = create_engine(f'sqlite:///{tmp_path}/sample.db')
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    token = crypto.CURRENT_DEK.set(crypto.generate_dek())
    monkeypatch.setenv('WC_APP_ENV', 'staging')
    monkeypatch.setenv('WC_PERFORMANCE_DEMO', 'true')
    user = User(id=1, email='demouser@gmail.com', hashed_password='x', is_test_user=True)
    db.add(user); db.add(User(id=2, email='other@example.test', hashed_password='x', is_test_user=True)); db.commit()
    scope = UserScope(db, 1)
    seed_original(scope)
    yield scope, user
    crypto.CURRENT_DEK.reset(token)
    db.close(); engine.dispose()


def test_additions_are_idempotent_and_leave_originals_and_other_user_byte_identical(sample):
    scope, user = sample
    other = UserScope(scope.db, 2)
    other.add(Transaction(date=datetime(2025, 1, 2), ticker='PRIVATE', quantity=3, totalCost=1234))
    scope.add(PortfolioPerformanceState(opening_cash=3000, fingerprint='old'))
    scope.db.commit()
    before = scope.db.execute(text('SELECT * FROM transactions ORDER BY id')).all()
    result = complete_demo_ledger(scope, user)
    assert result['createdTransactions'] == 7
    assert result['totalTransactions'] == 23
    assert scope.query(ManualRawTransaction).count() == 7
    assert scope.db.execute(text('SELECT * FROM transactions WHERE id <= 17 ORDER BY id')).all() == before
    assert scope.query(PortfolioPerformanceState).one().opening_cash is None
    assert all(row.is_backend_verified and row.raw_id for row in scope.query(Transaction).filter(Transaction.name.startswith(PREFIX)))
    assert complete_demo_ledger(scope, user)['createdTransactions'] == 0
    assert scope.query(Transaction).count() == 23
    assert scope.query(ManualRawTransaction).count() == 7
    raw = scope.db.execute(text("SELECT totalCost FROM transactions WHERE name LIKE 'Performance sample%'")).scalars().all()
    assert all(crypto.unwrap(crypto.CURRENT_DEK.get(), value) for value in raw)


@pytest.mark.parametrize('change', ['different_email', 'production', 'real_user', 'different_scope'])
def test_only_staging_shared_demo_is_eligible(sample, monkeypatch, change):
    scope, user = sample
    if change == 'different_email': user.email = 'different@example.test'
    if change == 'production': monkeypatch.setenv('WC_APP_ENV', 'production')
    if change == 'real_user': user.is_test_user = False
    if change == 'different_scope': scope = UserScope(scope.db, 2)
    with pytest.raises(PermissionError): complete_demo_ledger(scope, user)
    assert scope.db.query(Transaction).count() == 16


@pytest.mark.parametrize('change', ['extra_record', 'modified_record', 'deleted_record', 'duplicate_sample'])
def test_custom_or_changed_ledgers_are_never_overwritten(sample, change):
    scope, user = sample
    if change == 'extra_record': scope.add(Transaction(date=datetime(2026, 1, 2), ticker='PERSONAL', quantity=1, totalCost=10))
    if change == 'modified_record': scope.query(Transaction).first().totalCost = 123
    if change == 'deleted_record': scope.query(Transaction).first().is_deleted = True
    if change == 'duplicate_sample':
        complete_demo_ledger(scope, user)
        row = scope.query(Transaction).filter(Transaction.name.startswith(PREFIX)).first()
        scope.add(Transaction(name=row.name, brokerage=row.brokerage, date=row.date, ticker=row.ticker, action=row.action, quantity=row.quantity, totalCost=row.totalCost, assetType=row.assetType, is_backend_verified=True))
    scope.db.commit()
    before = scope.db.execute(text('SELECT * FROM transactions ORDER BY id')).all()
    with pytest.raises(ValueError): complete_demo_ledger(scope, user)
    scope.db.rollback()
    assert before == scope.db.execute(text('SELECT * FROM transactions ORDER BY id')).all()


def test_sample_funding_supports_entire_history_and_leaves_equities_and_etf_open(sample):
    scope, user = sample
    complete_demo_ledger(scope, user)
    transactions = scope.query(Transaction).all()
    events, issues = ledger_events(transactions)
    assert not issues
    sessions = [stamp.date() for stamp in pd.bdate_range('2019-12-31', '2026-11-06')]
    spy = {day: 100 + index / 10 for index, day in enumerate(sessions)}
    symbols = {event.symbol for event in events if event.multiplier == 1 and event.symbol != 'CASH'}
    market = {symbol: {day: {'close': 100, 'split': 10 if symbol == 'NVDA' and day == date(2024, 6, 10) else 1} for day in sessions} for symbol in symbols}
    rows, issues = reconstruct(events, market, spy)
    assert not issues  # No option quotes, forward fills or invented funding required.
    assert rows[-1]['date'] == date(2026, 11, 6)
    assert all(row['complete'] for row in rows)
    assert min(row['cash'] for row in rows) >= 0
    assert rows[-1]['holdings'] > 0
    assert min(event.day for event in events) == date(2020, 1, 2)
    assert sum(event.quantity * (1 if event.kind == 'buy' else -1) for event in events if event.symbol == 'VTI') == 11
    assert sum(event.quantity * (1 if event.kind == 'buy' else -1) for event in events if event.multiplier == 100) == 0


def test_normal_holdings_processing_keeps_seven_open_stock_and_etf_positions(sample, monkeypatch):
    from backend.app.core import process
    from backend.app.db.schema import Holding, StockSplit
    scope, user = sample
    scope.db.add(StockSplit(ticker="NVDA", split_date=datetime(2024, 6, 10), numerator=10, denominator=1))
    scope.db.commit()
    complete_demo_ledger(scope, user)
    monkeypatch.setattr(process, '_load_tracked_tickers', lambda: None)
    monkeypatch.setattr('backend.app.core.table_loader.unrealized_gain_loader.get_stock_quote', lambda symbol: (100.0, 99.0))
    process.process_transactions(scope.db, user.id)
    positions = {row.ticker: row.quantity for row in scope.query(Holding).all()}
    assert positions == {'AAPL': 9, 'NVDA': 20, 'MSFT': 4, 'KO': 25.4127, 'TSLA': 3, 'AMD': 8, 'VTI': 11}
    assert complete_demo_ledger(scope, user)['createdTransactions'] == 0
