"""Demo performance is a staging-only presentation feature, never data seeding."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.api import auth
from backend.app.core.database import get_db
from backend.app.core.runtime_features import performance_demo_enabled


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
    assert response.json()["performance_demo"] is True
    assert set(response.json()) == {"registered", "registration_open", "demo", "performance_demo"}
