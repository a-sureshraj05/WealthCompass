"""A user row created before Phase 2 shipped (`wrapped_dek IS NULL`) must be
transparently upgraded on next login: a DEK is minted, their plaintext
ledger is re-encrypted in place, and their derived tables (holdings,
unrealized_gains) come out encrypted too via the normal rebuild pipeline —
with no numeric drift versus what was there before the upgrade.
"""

import os
import tempfile
from datetime import datetime

import pytest
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.app.api import auth
from backend.app.core import crypto, process, session_store
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, Holding, Transaction, User


@pytest.fixture()
def db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()

    monkeypatch.setattr(
        "backend.app.core.table_loader.unrealized_gain_loader.get_stock_quote",
        lambda symbol: (100.0, 99.0),
    )
    monkeypatch.setattr(process, "_load_tracked_tickers", lambda: None)

    yield session
    session.close()
    os.unlink(path)


def _seed_legacy_user_with_plaintext_ledger(db):
    """Simulates a pre-Phase-2 database: a User row with no encryption
    columns set, and a Transaction row inserted via raw SQL so it is genuine
    plaintext on disk — not something the ORM's TypeDecorator ever touched."""
    user = User(email="ida@example.test", hashed_password=auth.hash_password("legacy-password"))
    db.add(user)
    db.commit()

    db.execute(
        text(
            "INSERT INTO transactions "
            "(user_id, brokerage, account_id, date, ticker, name, action, "
            " quantity, price, costPerShare, totalCost, assetType, source, "
            " is_deleted, is_override, is_duplicate, is_backend_verified) "
            "VALUES (:user_id, 'Robinhood', NULL, :date, 'AAPL', 'AAPL', 'BUY', "
            " 10.0, 200.0, 200.0, 2000.0, 'Equity', 'manual', 0, 0, 0, 0)"
        ),
        {"user_id": user.id, "date": datetime(2024, 1, 15)},
    )
    db.commit()
    return user


def test_legacy_login_upgrades_and_reencrypts(db):
    user = _seed_legacy_user_with_plaintext_ledger(db)
    assert user.wrapped_dek is None

    # Sanity: it really was plaintext before login.
    raw_before = db.execute(
        text("SELECT quantity, totalCost FROM transactions WHERE user_id = :uid"),
        {"uid": user.id},
    ).fetchone()
    assert raw_before.quantity == "10.0" or raw_before.quantity == 10.0

    resp = auth.login(
        OAuth2PasswordRequestForm(username="ida@example.test", password="legacy-password", scope=""),
        db=db,
    )
    assert resp["recovery_key"]  # upgrade path issues one, same as register()

    db.refresh(user)
    assert user.wrapped_dek is not None

    # The ledger row is now ciphertext — not the plaintext numeric string.
    raw_after = db.execute(
        text("SELECT quantity, totalCost FROM transactions WHERE user_id = :uid"),
        {"uid": user.id},
    ).fetchone()
    assert raw_after.quantity not in ("10.0", 10.0)
    with pytest.raises(ValueError):
        float(raw_after.quantity)

    # The derived holdings row, rebuilt by the upgrade's process_transactions
    # call, is ciphertext too.
    raw_holding = db.execute(
        text("SELECT quantity, totalCost FROM holdings WHERE user_id = :uid"),
        {"uid": user.id},
    ).fetchone()
    assert raw_holding is not None
    with pytest.raises(ValueError):
        float(raw_holding.quantity)

    # And reading everything back through the ORM, with this session's DEK
    # bound, reproduces the original numbers exactly — no drift across the
    # re-encrypt-then-reprocess step.
    import jose.jwt as jwt_lib
    payload = jwt_lib.decode(resp["access_token"], auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    dek = session_store.get_dek(payload["sid"])

    bound = crypto.CURRENT_DEK.set(dek)
    try:
        scope = UserScope(db, user.id)
        txn = scope.query(Transaction).filter_by(ticker="AAPL").first()
        assert txn.quantity == 10.0
        assert txn.totalCost == 2000.0

        holding = scope.query(Holding).filter_by(ticker="AAPL").first()
        assert holding.quantity == 10.0
        assert holding.totalCost == 2000.0
    finally:
        crypto.CURRENT_DEK.reset(bound)
