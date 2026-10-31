"""Changing a password must re-wrap the DEK, not change it, and must not lose
any previously-written encrypted data.
"""

import os
import tempfile

import pytest
from fastapi import Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api import auth
from backend.app.core import crypto, session_store
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, InviteCode, Transaction, User
from datetime import datetime


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


def _dek_from_token(token):
    import jose.jwt as jwt_lib
    payload = jwt_lib.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    return session_store.get_dek(payload["sid"])


def _extract_session_token(response) -> str:
    """register()/login() are cookie-only now — nothing in their JSON body
    carries the token, so pull it out of the throwaway Response instead."""
    raw = response.headers.get("set-cookie", "")
    prefix = f"{auth.COOKIE_NAME}="
    assert raw.startswith(prefix), f"expected a {auth.COOKIE_NAME} cookie, got: {raw!r}"
    return raw[len(prefix):].split(";", 1)[0]


def _register(db, email, password):
    code = f"invite-{email}"
    db.add(InviteCode(code=code, created_at=datetime.utcnow()))
    db.commit()
    response = Response()
    resp = auth.register(None, response, auth.RegisterRequest(email=email, password=password, invite_code=code), db=db)
    resp["access_token"] = _extract_session_token(response)
    return resp


def _login(db, email, password):
    response = Response()
    form = OAuth2PasswordRequestForm(username=email, password=password, scope="")
    resp = auth.login(None, response, form, db=db)
    resp["access_token"] = _extract_session_token(response)
    return resp


def test_password_change_rewraps_same_dek_and_preserves_data(db):
    resp = _register(db, "erin@example.test", "old-password")
    dek_before = _dek_from_token(resp["access_token"])
    user = db.query(User).filter_by(email="erin@example.test").first()

    bound = crypto.CURRENT_DEK.set(dek_before)
    try:
        scope = UserScope(db, user.id)
        scope.add(Transaction(
            brokerage="Robinhood", ticker="MSFT", name="MSFT", action="BUY",
            quantity=3.0, price=410.0, costPerShare=410.0, totalCost=1230.0,
            assetType="Equity", source="manual",
        ))
        db.commit()

        auth.change_password(
            auth.ChangePasswordRequest(old_password="old-password", new_password="new-password"),
            current_user=user,
            db=db,
        )
    finally:
        crypto.CURRENT_DEK.reset(bound)

    # Old password no longer works.
    with pytest.raises(Exception):
        _login(db, "erin@example.test", "old-password")

    # New password works and unwraps to the IDENTICAL dek bytes.
    resp2 = _login(db, "erin@example.test", "new-password")
    dek_after = _dek_from_token(resp2["access_token"])
    assert dek_after == dek_before

    # Previously-written data is still readable under the new login.
    bound = crypto.CURRENT_DEK.set(dek_after)
    try:
        scope = UserScope(db, user.id)
        row = scope.query(Transaction).filter_by(ticker="MSFT").first()
        assert row.quantity == 3.0
        assert row.totalCost == 1230.0
    finally:
        crypto.CURRENT_DEK.reset(bound)
