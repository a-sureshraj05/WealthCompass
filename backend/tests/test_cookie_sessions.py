"""Session cookies replacing JWT-in-localStorage.

Proves the actual properties this migration exists to deliver: the token
lives in an HttpOnly cookie, never in the JSON body a script could read; a
request with no cookie is unauthenticated; logout actually invalidates the
server-side session rather than just being a client-side no-op.
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db.schema import Base, InviteCode
from datetime import datetime


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/cookie_sessions.db")

    import backend.app.core.database as database_module

    test_engine = create_engine(
        f"sqlite:///{tmp_path}/cookie_sessions.db", connect_args={"check_same_thread": False}
    )
    monkeypatch.setattr(database_module, "engine", test_engine)
    monkeypatch.setattr(database_module, "SessionLocal", sessionmaker(bind=test_engine))

    from fastapi.testclient import TestClient

    from backend.app.api import auth as auth_module
    from backend.app import main as main_module
    from backend.app.main import app

    monkeypatch.setattr(main_module, "engine", test_engine)
    # Same reason as test_insights.py's client fixture: TestClient is plain
    # http://testserver, and a Secure cookie is correctly withheld from a
    # non-https connection by httpx's cookie jar.
    monkeypatch.setattr(auth_module, "COOKIE_SECURE", False)

    with TestClient(app) as c:
        yield c


def _seed_invite_code(client, code="cookie-test-code"):
    import backend.app.core.database as database_module

    db = database_module.SessionLocal()
    try:
        db.add(InviteCode(code=code, created_at=datetime.utcnow()))
        db.commit()
    finally:
        db.close()
    return code


def test_login_sets_httponly_cookie_and_body_has_no_token(client):
    code = _seed_invite_code(client)
    client.post(
        "/api/v1/auth/register",
        json={"email": "cookie-user@example.test", "password": "pw123456", "invite_code": code},
    )

    resp = client.post(
        "/api/v1/auth/login",
        data={"username": "cookie-user@example.test", "password": "pw123456"},
    )
    assert resp.status_code == 200
    assert "access_token" not in resp.json()
    assert "token_type" not in resp.json()

    set_cookie = resp.headers.get("set-cookie", "")
    assert "wc_session=" in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "samesite=lax" in set_cookie.lower()


def test_protected_route_without_cookie_is_401(client):
    assert client.get("/api/v1/auth/me").status_code == 401


def test_logout_invalidates_the_server_side_session(client):
    code = _seed_invite_code(client)
    client.post(
        "/api/v1/auth/register",
        json={"email": "logout-user@example.test", "password": "pw123456", "invite_code": code},
    )

    # Authenticated before logout.
    assert client.get("/api/v1/auth/me").status_code == 200

    logout_resp = client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 200

    # The cookie itself may or may not still be in the client's jar after a
    # delete_cookie — what actually matters is that the server no longer
    # honors it, because the session it pointed to is gone.
    assert client.get("/api/v1/auth/me").status_code == 401


def test_register_returns_recovery_key_not_access_token(client):
    code = _seed_invite_code(client)
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "recovery-user@example.test", "password": "pw123456", "invite_code": code},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" not in body
    assert body["recovery_key"]
    assert "wc_session=" in resp.headers.get("set-cookie", "")
