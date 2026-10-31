"""Proves the actual property Phase 2 exists to deliver: a raw SQL read of
the database — bypassing the ORM's TypeDecorator entirely — returns
ciphertext for sensitive columns, not plaintext. Reading via the ORM (with a
DEK bound) must still return the original values.

Registration and login are exercised through the real `auth.register`/
`auth.login` functions, not stand-ins — calling them directly with an
explicit `db=` argument bypasses FastAPI's dependency injection the same way
test_user_isolation.py's fixtures bypass it for process_transactions.
"""

import os
import tempfile

import pytest
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.api import auth
from backend.app.core import crypto
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, Transaction


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


def _login_form(email, password):
    return OAuth2PasswordRequestForm(username=email, password=password, scope="")


def test_register_and_login_roundtrip(db):
    resp = auth.register(auth.RegisterRequest(email="alice@example.test", password="correct-horse"), db=db)
    assert resp["recovery_key"]  # issued exactly once, here

    resp2 = auth.login(_login_form("alice@example.test", "correct-horse"), db=db)
    assert "recovery_key" not in resp2 or resp2.get("recovery_key") is None


def test_wrong_password_rejected(db):
    auth.register(auth.RegisterRequest(email="bob@example.test", password="right-password"), db=db)
    with pytest.raises(Exception):
        auth.login(_login_form("bob@example.test", "wrong-password"), db=db)


def test_sensitive_column_is_ciphertext_on_disk_not_plaintext(db):
    resp = auth.register(auth.RegisterRequest(email="carol@example.test", password="pw12345"), db=db)
    token = resp["access_token"]

    import jose.jwt as jwt_lib
    payload = jwt_lib.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    sid = payload["sid"]
    from backend.app.core import session_store
    dek = session_store.get_dek(sid)
    assert dek is not None

    user = db.query(__import__("backend.app.db.schema", fromlist=["User"]).User).filter_by(
        email="carol@example.test"
    ).first()

    bound = crypto.CURRENT_DEK.set(dek)
    try:
        scope = UserScope(db, user.id)
        txn = scope.add(Transaction(
            brokerage="Robinhood", ticker="AAPL", name="AAPL", action="BUY",
            quantity=7.0, price=190.12, costPerShare=190.12, totalCost=1330.84,
            assetType="Equity", source="manual",
        ))
        db.commit()
        txn_id = txn.id
    finally:
        crypto.CURRENT_DEK.reset(bound)

    # Raw SQL, bypassing the ORM's TypeDecorator entirely — this is what an
    # operator with direct database access, or a stolen backup, would see.
    raw = db.execute(
        text("SELECT quantity, price, totalCost FROM transactions WHERE id = :id"),
        {"id": txn_id},
    ).fetchone()
    assert raw.quantity != "7.0"
    assert raw.price != "190.12"
    assert raw.totalCost != "1330.84"
    # Not even numerically parseable as the plaintext value.
    with pytest.raises(ValueError):
        float(raw.quantity)

    # Re-read through the ORM with the DEK bound — must match the original.
    bound = crypto.CURRENT_DEK.set(dek)
    try:
        scope = UserScope(db, user.id)
        reread = scope.query(Transaction).filter_by(id=txn_id).first()
        assert reread.quantity == 7.0
        assert reread.price == 190.12
        assert reread.totalCost == 1330.84
    finally:
        crypto.CURRENT_DEK.reset(bound)


def test_reading_encrypted_column_without_dek_fails_closed(db):
    resp = auth.register(auth.RegisterRequest(email="dave@example.test", password="pw12345"), db=db)
    token = resp["access_token"]
    import jose.jwt as jwt_lib
    from backend.app.core import session_store
    payload = jwt_lib.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    dek = session_store.get_dek(payload["sid"])

    from backend.app.db.schema import User
    user = db.query(User).filter_by(email="dave@example.test").first()

    bound = crypto.CURRENT_DEK.set(dek)
    try:
        scope = UserScope(db, user.id)
        scope.add(Transaction(
            brokerage="Robinhood", ticker="AAPL", name="AAPL", action="BUY",
            quantity=1.0, price=1.0, costPerShare=1.0, totalCost=1.0,
            assetType="Equity", source="manual",
        ))
        db.commit()
    finally:
        crypto.CURRENT_DEK.reset(bound)

    db.expire_all()  # force a re-fetch from the DB, not from the session cache
    assert crypto.CURRENT_DEK.get() is None
    with pytest.raises(crypto.DekNotBoundError):
        UserScope(db, user.id).query(Transaction).first().quantity
