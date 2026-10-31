"""The recovery key issued once at registration must independently unwrap
the same DEK the password path unwraps, and data written before a simulated
"forgot password" event must still be readable through it.
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api import auth
from backend.app.core import crypto, session_store
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, Transaction, User


@pytest.fixture()
def db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    os.unlink(path)


def test_recovery_key_unwraps_same_dek_as_password(db):
    resp = auth.register(auth.RegisterRequest(email="frank@example.test", password="correct-horse"), db=db)
    recovery_key = resp["recovery_key"]
    assert recovery_key

    import jose.jwt as jwt_lib
    payload = jwt_lib.decode(resp["access_token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    dek_via_password = session_store.get_dek(payload["sid"])

    user = db.query(User).filter_by(email="frank@example.test").first()

    # Write some data via the password-derived DEK.
    bound = crypto.CURRENT_DEK.set(dek_via_password)
    try:
        UserScope(db, user.id).add(Transaction(
            brokerage="Schwab", ticker="NVDA", name="NVDA", action="BUY",
            quantity=20.0, price=90.0, costPerShare=90.0, totalCost=1800.0,
            assetType="Equity", source="manual",
        ))
        db.commit()
    finally:
        crypto.CURRENT_DEK.reset(bound)

    # Simulate "forgot password": unwrap via the recovery path instead.
    recovery_kek = crypto.derive_recovery_kek(recovery_key, bytes.fromhex(user.recovery_salt))
    dek_via_recovery = crypto.unwrap(recovery_kek, user.recovery_wrapped_dek)

    assert dek_via_recovery == dek_via_password

    # And it reads the data written before the "forgotten password" event.
    bound = crypto.CURRENT_DEK.set(dek_via_recovery)
    try:
        row = UserScope(db, user.id).query(Transaction).filter_by(ticker="NVDA").first()
        assert row.quantity == 20.0
        assert row.totalCost == 1800.0
    finally:
        crypto.CURRENT_DEK.reset(bound)


def test_wrong_recovery_key_does_not_unwrap(db):
    resp = auth.register(auth.RegisterRequest(email="grace@example.test", password="pw"), db=db)
    user = db.query(User).filter_by(email="grace@example.test").first()

    wrong_recovery_key = crypto.generate_recovery_key()
    assert wrong_recovery_key != resp["recovery_key"]

    wrong_kek = crypto.derive_recovery_kek(wrong_recovery_key, bytes.fromhex(user.recovery_salt))
    with pytest.raises(Exception):
        crypto.unwrap(wrong_kek, user.recovery_wrapped_dek)
