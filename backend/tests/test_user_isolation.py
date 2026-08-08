"""Cross-tenant isolation tests.

The dangerous failure in this codebase is not a read that returns too much — it
is a *rebuild*. Every loader clears a table before repopulating it, so if one
user's recompute is unscoped it silently deletes everyone else's holdings and
gains. Nothing raises; the numbers are simply gone, and the next person to look
sees an empty portfolio with no error to explain it.

So the load-bearing assertion here is not "B cannot see A's rows". It is
"processing B leaves A's rows byte-identical".
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core import process
from backend.app.core.scoping import UserScope
from backend.app.db.schema import (Base, Holding, RealizedGain, Transaction,
                                   UnrealizedGain, User)

USER_A = 1
USER_B = 2


@pytest.fixture()
def db(monkeypatch):
    """A throwaway database with two users, prices stubbed, allowlist off."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()

    # No network in tests: a fixed quote keeps the pipeline deterministic.
    monkeypatch.setattr(
        "backend.app.core.table_loader.unrealized_gain_loader.get_stock_quote",
        lambda symbol: (100.0, 99.0),
    )
    # config/tickers.yml is a local allowlist; it must not filter fixtures.
    monkeypatch.setattr(process, "_load_tracked_tickers", lambda: None)

    session.add_all([
        User(id=USER_A, email="a@example.test", hashed_password="x"),
        User(id=USER_B, email="b@example.test", hashed_password="x"),
    ])
    session.commit()
    yield session
    session.close()
    os.unlink(path)


def _buy(scope, ticker, qty, total, date):
    from datetime import datetime
    scope.add(Transaction(
        brokerage="Robinhood", date=datetime.fromisoformat(date), ticker=ticker,
        name=ticker, action="BUY", quantity=qty, price=total / qty,
        costPerShare=total / qty, totalCost=total, assetType="Equity",
        source="manual",
    ))


def test_scope_refuses_to_build_without_a_user(db):
    """The unscoped path should not be reachable by accident."""
    with pytest.raises(ValueError):
        UserScope(db, None)
    with pytest.raises(ValueError):
        UserScope(db, 0)


def test_user_b_cannot_see_user_a_rows(db):
    a = UserScope(db, USER_A)
    _buy(a, "AAA", 10, 1000.0, "2024-01-15")
    db.commit()
    process.process_transactions(db, USER_A)

    b = UserScope(db, USER_B)
    assert b.query(Transaction).count() == 0
    assert b.query(Holding).count() == 0
    assert b.query(UnrealizedGain).count() == 0
    # ...while A still has theirs
    assert a.query(Holding).count() == 1


def test_processing_one_user_does_not_wipe_another(db):
    """The real test. B's rebuild clears B's derived tables — not A's."""
    a, b = UserScope(db, USER_A), UserScope(db, USER_B)

    _buy(a, "AAA", 10, 1000.0, "2024-01-15")
    _buy(b, "BBB", 5, 250.0, "2024-02-20")
    db.commit()

    process.process_transactions(db, USER_A)
    a_before = {(h.ticker, h.quantity, h.totalCost) for h in a.query(Holding).all()}
    a_lots_before = a.query(UnrealizedGain).count()
    assert a_before, "fixture produced no holdings for A"

    # Rebuilding B must not touch A. Unscoped, the loaders' delete-then-insert
    # would empty A's holdings here and the assertion below would find nothing.
    process.process_transactions(db, USER_B)

    a_after = {(h.ticker, h.quantity, h.totalCost) for h in a.query(Holding).all()}
    assert a_after == a_before
    assert a.query(UnrealizedGain).count() == a_lots_before
    assert {h.ticker for h in b.query(Holding).all()} == {"BBB"}


def test_every_written_row_carries_its_owner(db):
    """A row with the wrong user_id is invisible to its owner and visible to
    someone else — so check the stamp directly rather than trusting the filter."""
    a = UserScope(db, USER_A)
    _buy(a, "AAA", 10, 1000.0, "2024-01-15")
    db.commit()
    process.process_transactions(db, USER_A)

    for model in (Transaction, Holding, UnrealizedGain, RealizedGain):
        rows = db.query(model).all()  # deliberately unscoped: inspect everything
        assert all(r.user_id == USER_A for r in rows), f"{model.__name__} has stray user_id"


def test_cash_balance_is_per_user(db):
    from datetime import datetime
    from backend.app.db.schema import PortfolioSummary

    a, b = UserScope(db, USER_A), UserScope(db, USER_B)
    for scope, amount in ((a, 2534.67), (b, 100.0)):
        scope.add(Transaction(
            brokerage="Robinhood", date=datetime(2024, 3, 1), ticker="CASH",
            name="Cash", action="BUY", quantity=1, price=amount,
            costPerShare=amount, totalCost=amount, assetType="Cash", source="manual",
        ))
    db.commit()

    process.process_transactions(db, USER_A)
    process.process_transactions(db, USER_B)

    assert a.query(PortfolioSummary).first().cash_balance == 2534.67
    assert b.query(PortfolioSummary).first().cash_balance == 100.0
