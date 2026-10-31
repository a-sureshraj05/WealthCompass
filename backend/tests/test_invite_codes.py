"""Invite-gated registration.

The load-bearing property is atomicity: `_claim_invite_code` must make it
impossible for two concurrent registrations to both succeed with the same
code. A plain SELECT-then-UPDATE has a TOCTOU gap; the single atomic UPDATE
used here closes it (see its own docstring in auth.py for why).
"""

import os
import tempfile
import threading

import pytest
from fastapi import Response
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.api import auth
from backend.app.db.schema import Base, InviteCode, User
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


def _seed_code(db, code="WELCOME-123"):
    db.add(InviteCode(code=code, created_at=datetime.utcnow()))
    db.commit()
    return code


def test_claim_succeeds_once_and_fails_the_second_time(db):
    code = _seed_code(db)
    db.add(User(email="first@example.test", hashed_password="x"))
    db.commit()
    user = db.query(User).filter_by(email="first@example.test").first()

    assert auth._claim_invite_code(db, code, user.id) is True
    db.commit()

    row = db.query(InviteCode).filter_by(code=code).first()
    assert row.used_by_user_id == user.id
    assert row.used_at is not None

    # Second claim attempt, different user, same code — must fail.
    db.add(User(email="second@example.test", hashed_password="x"))
    db.commit()
    other = db.query(User).filter_by(email="second@example.test").first()
    assert auth._claim_invite_code(db, code, other.id) is False


def test_claim_rejects_an_unknown_code(db):
    db.add(User(email="nobody@example.test", hashed_password="x"))
    db.commit()
    user = db.query(User).filter_by(email="nobody@example.test").first()
    assert auth._claim_invite_code(db, "NOT-A-REAL-CODE", user.id) is False


def test_register_end_to_end_with_invite_code(db):
    code = _seed_code(db, "END-TO-END-1")
    response = Response()
    resp = auth.register(
        None,
        response,
        auth.RegisterRequest(email="newuser@example.test", password="pw123456", invite_code=code),
        db=db,
    )
    assert response.headers.get("set-cookie", "").startswith(f"{auth.COOKIE_NAME}=")
    assert "recovery_key" in resp

    row = db.query(InviteCode).filter_by(code=code).first()
    user = db.query(User).filter_by(email="newuser@example.test").first()
    assert row.used_by_user_id == user.id


def test_register_rejects_reused_code(db):
    code = _seed_code(db, "ONLY-ONCE")
    auth.register(
        None,
        Response(),
        auth.RegisterRequest(email="first@example.test", password="pw123456", invite_code=code),
        db=db,
    )
    with pytest.raises(Exception) as exc_info:
        auth.register(
            None,
            Response(),
            auth.RegisterRequest(email="second@example.test", password="pw123456", invite_code=code),
            db=db,
        )
    assert getattr(exc_info.value, "status_code", None) == 403

    # The second (rejected) user must not have been left behind.
    assert db.query(User).filter_by(email="second@example.test").first() is None


def test_register_rejects_bogus_code(db):
    with pytest.raises(Exception) as exc_info:
        auth.register(
            None,
            Response(),
            auth.RegisterRequest(email="x@example.test", password="pw123456", invite_code="BOGUS"),
            db=db,
        )
    assert getattr(exc_info.value, "status_code", None) == 403


@pytest.mark.skipif(
    not os.getenv("DATABASE_URL", "").startswith("postgresql"),
    reason="SQLite's locking differs enough from Postgres's row-level MVCC that this race is best "
           "proven against the real thing",
)
def test_claim_is_atomic_under_concurrent_attempts():
    """Two threads race to claim the SAME code — exactly one must win."""
    database_url = os.getenv("DATABASE_URL")
    engine = create_engine(database_url)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)

    setup_db = SessionLocal()
    # Suffixed with a timestamp, not just the invite code — this test runs
    # against a real, persistent Postgres instance (no throwaway tmp file
    # like the SQLite tests get), so a hardcoded email collides with
    # leftover rows the very next time this test runs against the same DB.
    unique = datetime.utcnow().timestamp()
    code = f"RACE-{unique}"
    email_a, email_b = f"racer-a-{unique}@example.test", f"racer-b-{unique}@example.test"
    setup_db.add(InviteCode(code=code, created_at=datetime.utcnow()))
    setup_db.add_all([
        User(email=email_a, hashed_password="x"),
        User(email=email_b, hashed_password="x"),
    ])
    setup_db.commit()
    user_a = setup_db.query(User).filter_by(email=email_a).first()
    user_b = setup_db.query(User).filter_by(email=email_b).first()
    user_a_id, user_b_id = user_a.id, user_b.id
    setup_db.close()

    results = {}

    def attempt(key, user_id):
        thread_db = SessionLocal()
        try:
            results[key] = auth._claim_invite_code(thread_db, code, user_id)
            thread_db.commit()
        finally:
            thread_db.close()

    t1 = threading.Thread(target=attempt, args=("a", user_a_id))
    t2 = threading.Thread(target=attempt, args=("b", user_b_id))
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    assert sorted(results.values()) == [False, True], "exactly one of the two concurrent claims must win"
