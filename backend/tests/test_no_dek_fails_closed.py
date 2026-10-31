"""An encrypted column touched with no DEK bound must raise, never silently
store plaintext or return garbage. This is the fail-closed property that
makes the rest of the design trustworthy — mirrors UserScope's refusal to
construct without a user_id.
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core import crypto
from backend.app.db.schema import Base, Transaction, User


@pytest.fixture()
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    session.add(User(email="h@example.test", hashed_password="x"))
    session.commit()
    assert crypto.CURRENT_DEK.get() is None  # sanity: no leakage from another test
    yield session
    session.close()
    os.unlink(path)


def test_write_without_dek_raises(db):
    # SQLAlchemy wraps whatever a bind-param processor raises in its own
    # StatementError — assert the real cause is still DekNotBoundError
    # underneath, not just "something, somewhere, raised".
    with pytest.raises(Exception) as exc_info:
        db.add(Transaction(
            user_id=1, brokerage="Robinhood", ticker="AAPL", name="AAPL",
            action="BUY", quantity=1.0, price=1.0, costPerShare=1.0,
            totalCost=1.0, assetType="Equity", source="manual",
        ))
        db.commit()
    db.rollback()
    cause = getattr(exc_info.value, "orig", exc_info.value)
    assert isinstance(cause, crypto.DekNotBoundError)


def test_read_without_dek_raises(db):
    dek = crypto.generate_dek()
    bound = crypto.CURRENT_DEK.set(dek)
    try:
        db.add(Transaction(
            user_id=1, brokerage="Robinhood", ticker="AAPL", name="AAPL",
            action="BUY", quantity=1.0, price=1.0, costPerShare=1.0,
            totalCost=1.0, assetType="Equity", source="manual",
        ))
        db.commit()
    finally:
        crypto.CURRENT_DEK.reset(bound)

    db.expire_all()
    assert crypto.CURRENT_DEK.get() is None
    with pytest.raises(crypto.DekNotBoundError):
        db.query(Transaction).first().quantity


def test_none_values_pass_through_without_needing_a_dek():
    """NULL is not a secret — an encrypted column must not require a DEK just
    to store or read the absence of a value."""
    typ = crypto.EncryptedFloat()
    assert typ.process_bind_param(None, None) is None
    assert typ.process_result_value(None, None) is None
