"""Rollouts identify the running Git source without exposing environment secrets."""
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine

from backend.app import main


@pytest.fixture
def isolated_health(monkeypatch):
    engine = create_engine('sqlite:///:memory:')
    monkeypatch.setattr(main, 'engine', engine)
    monkeypatch.setattr(main, 'DEMO_MODE', False)
    yield
    engine.dispose()


def test_render_health_exposes_only_git_identifiers(isolated_health, monkeypatch):
    monkeypatch.setenv('RENDER', 'true')
    monkeypatch.setenv('RENDER_GIT_BRANCH', 'main')
    monkeypatch.setenv('RENDER_GIT_COMMIT', 'a' * 40)
    monkeypatch.setenv('RENDER_API_KEY', 'must-never-be-returned')
    monkeypatch.setenv('DATABASE_URL', 'must-never-be-returned')
    assert main.healthz() == {
        'status': 'ok', 'demo': False,
        'release': {'branch': 'main', 'commit': 'a' * 40},
    }


def test_local_health_retains_existing_shape(isolated_health, monkeypatch):
    monkeypatch.delenv('RENDER', raising=False)
    monkeypatch.setenv('RENDER_GIT_BRANCH', 'local')
    assert main.healthz() == {'status': 'ok', 'demo': False}


def test_release_metadata_does_not_hide_database_failure(monkeypatch):
    class Offline:
        def connect(self):
            raise RuntimeError('test database offline')
    monkeypatch.setattr(main, 'engine', Offline())
    monkeypatch.setenv('RENDER', 'true')
    with pytest.raises(HTTPException) as error:
        main.healthz()
    assert error.value.status_code == 503
