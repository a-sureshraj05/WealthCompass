"""Demo performance is a staging-only presentation feature, never data seeding."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import auth
from backend.app.core.database import get_db
from backend.app.core.runtime_features import performance_demo_enabled, performance_demo_for_user, STAGING_RENDER_SERVICE_ID


@pytest.fixture(autouse=True)
def clear_render_identity(monkeypatch):
    for key in ["RENDER", "RENDER_SERVICE_ID", "RENDER_GIT_BRANCH"]:
        monkeypatch.delenv(key, raising=False)


@pytest.mark.parametrize("environment,flag,enabled", [
    (None, None, False), (None, "true", False), ("production", "true", False),
    ("staging", None, False), ("staging", "false", False), ("staging", "1", False),
    ("staging", "true", True), (" STAGING ", " TRUE ", True),
])
def test_performance_demo_requires_both_staging_and_explicit_opt_in(monkeypatch, environment, flag, enabled):
    for key, value in [("WC_APP_ENV", environment), ("WC_PERFORMANCE_DEMO", flag)]:
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    assert performance_demo_enabled() is enabled


def test_instance_status_exposes_only_the_feature_boolean_without_reading_portfolio_data(monkeypatch):
    monkeypatch.setenv("WC_APP_ENV", "staging")
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")

    class StatusDatabase:
        def query(self, model):
            assert model is auth.User
            return self

        def first(self):
            return None

    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")
    app.dependency_overrides[get_db] = lambda: StatusDatabase()
    with TestClient(app) as client:
        response = client.get("/api/v1/auth/status")
    assert response.status_code == 200
    assert response.json()["performance_demo"] is False
    assert response.json()["performance_demo_available"] is True
    assert set(response.json()) == {"registered", "registration_open", "demo", "performance_demo", "performance_demo_available"}


def test_known_staging_render_service_defaults_on_but_explicit_disable_and_production_win(monkeypatch):
    monkeypatch.delenv("WC_APP_ENV", raising=False)
    monkeypatch.delenv("WC_PERFORMANCE_DEMO", raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_ID", STAGING_RENDER_SERVICE_ID)
    monkeypatch.setenv("RENDER_GIT_BRANCH", "staging")
    assert performance_demo_enabled() is True
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "false")
    assert performance_demo_enabled() is False
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")
    monkeypatch.setenv("WC_APP_ENV", "production")
    assert performance_demo_enabled() is False


@pytest.mark.parametrize("service_id,branch", [("different-service", "staging"), (STAGING_RENDER_SERVICE_ID, "main"), (STAGING_RENDER_SERVICE_ID, "feature/preview")])
def test_other_render_services_and_branches_do_not_inherit_demo_defaults(monkeypatch, service_id, branch):
    monkeypatch.delenv("WC_APP_ENV", raising=False)
    monkeypatch.delenv("WC_PERFORMANCE_DEMO", raising=False)
    monkeypatch.setenv("RENDER", "true")
    monkeypatch.setenv("RENDER_SERVICE_ID", service_id)
    monkeypatch.setenv("RENDER_GIT_BRANCH", branch)
    assert performance_demo_enabled() is False


@pytest.mark.parametrize("email,expected", [("demouser@gmail.com", True), ("DemoUser@gmail.com", True), ("sureshraj.cts@gmail.com", False), ("another@example.test", False), ("demouser@gmail.com.attacker.test", False)])
def test_feature_belongs_only_to_the_authenticated_demo_user(monkeypatch, email, expected):
    monkeypatch.setenv("WC_APP_ENV", "staging")
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")
    user = auth.User(id=42, email=email, hashed_password="not-used")
    assert performance_demo_for_user(user) is expected


def test_current_user_endpoint_uses_the_session_principal_not_a_supplied_email(monkeypatch):
    monkeypatch.setenv("WC_APP_ENV", "staging")
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")
    app.dependency_overrides[auth.get_current_user] = lambda: auth.User(id=9, email="another@example.test", hashed_password="not-used")
    with TestClient(app) as client:
        response = client.get("/api/v1/auth/me?email=demouser@gmail.com")
        assert response.status_code == 200
        assert response.json() == {"email": "another@example.test", "performance_demo": False}
        app.dependency_overrides[auth.get_current_user] = lambda: auth.User(id=42, email="demouser@gmail.com", hashed_password="not-used")
        assert client.get("/api/v1/auth/me").json()["performance_demo"] is True


def test_personal_owner_keeps_real_performance_state_even_on_the_staging_service(monkeypatch):
    monkeypatch.setenv("WC_APP_ENV", "staging")
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")
    user = auth.User(id=1, email="sureshraj.cts@gmail.com", hashed_password="not-used")
    assert auth.me(user)["performance_demo"] is False


def test_demo_enabled_does_not_allow_anonymous_access_to_current_user(monkeypatch):
    monkeypatch.setenv("WC_APP_ENV", "staging")
    monkeypatch.setenv("WC_PERFORMANCE_DEMO", "true")
    app = FastAPI()
    app.include_router(auth.router, prefix="/api/v1")
    with TestClient(app) as client:
        assert client.get("/api/v1/auth/me").status_code == 401
