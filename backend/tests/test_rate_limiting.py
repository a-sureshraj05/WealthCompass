"""Rate limiting on /auth/login and /auth/register.

Two independent dimensions, tested separately per conftest.py's note on why:
per-IP is a real decorator exercised through the actual HTTP path (TestClient
shares one client IP across requests, so it's the right tool for this one);
per-account is a direct call to `_enforce_account_limit`, since TestClient
can't spoof distinct source IPs to isolate it the other way.

`conftest.py`'s `_reset_rate_limiting` fixture disables the limiter by
default for every other test (most call `auth.register`/`login` directly,
bypassing FastAPI's DI, which slowapi's decorator can't tolerate). Both
tests here explicitly re-enable it for their own duration.
"""

import pytest

from backend.app.api import auth


@pytest.fixture()
def rate_limiting_enabled():
    auth.limiter.enabled = True
    auth.limiter.limiter.storage.reset()
    yield
    auth.limiter.enabled = False


def test_per_ip_login_limit_returns_429(rate_limiting_enabled, tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/rate_limit.db")

    import backend.app.core.database as database_module
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    test_engine = create_engine(
        f"sqlite:///{tmp_path}/rate_limit.db", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(database_module, "engine", test_engine)
    monkeypatch.setattr(database_module, "SessionLocal", sessionmaker(bind=test_engine))

    from fastapi.testclient import TestClient

    from backend.app import main as main_module
    from backend.app.main import app

    monkeypatch.setattr(main_module, "engine", test_engine)

    # A different email per request, so the separate per-account limit
    # (5/minute, tested on its own below) never fires here — this isolates
    # the per-IP dimension, which is what 11 requests from one TestClient
    # (one shared "IP") is actually able to exercise.
    with TestClient(app) as c:
        responses = [
            c.post(
                "/api/v1/auth/login",
                data={"username": f"nobody-{i}@example.test", "password": "wrong"},
            )
            for i in range(11)
        ]

    statuses = [r.status_code for r in responses]
    assert statuses[:10] == [401] * 10, "the first 10 attempts should fail on bad creds, not be blocked early"
    assert statuses[10] == 429, "the 11th attempt within the window should be rate-limited"


def test_per_account_limit_is_independent_per_email(rate_limiting_enabled):
    hit = auth.limiter.limiter.hit
    for _ in range(5):
        assert hit(auth._ACCOUNT_LOGIN_LIMIT, "login", "a@example.test") is True
    # The 6th hit for the SAME account should be denied...
    assert hit(auth._ACCOUNT_LOGIN_LIMIT, "login", "a@example.test") is False
    # ...but a DIFFERENT account's budget is untouched.
    assert hit(auth._ACCOUNT_LOGIN_LIMIT, "login", "b@example.test") is True


def test_enforce_account_limit_raises_429_once_exhausted():
    from fastapi import HTTPException

    auth.limiter.enabled = True
    auth.limiter.limiter.storage.reset()
    try:
        for _ in range(5):
            auth._enforce_account_limit("register", "c@example.test", auth._ACCOUNT_REGISTER_LIMIT)
        with pytest.raises(HTTPException) as exc:
            auth._enforce_account_limit("register", "c@example.test", auth._ACCOUNT_REGISTER_LIMIT)
        assert exc.value.status_code == 429
    finally:
        auth.limiter.enabled = False
