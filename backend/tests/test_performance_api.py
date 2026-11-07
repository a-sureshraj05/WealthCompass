"""Cookie authentication and a real encrypted background history build."""
from datetime import date
from jose import jwt

from backend.tests.test_cookie_sessions import client, _seed_invite_code
from backend.app.core import crypto, session_store, performance_history as history
from backend.app.core.scoping import UserScope
from backend.app.db.schema import User
from backend.tests.test_performance_history import seed, d, spy


def register(client, monkeypatch, email):
    monkeypatch.setenv('WC_APP_ENV', 'staging')
    monkeypatch.setenv('WC_PERFORMANCE_DEMO', 'true')
    invite = _seed_invite_code(client)
    response = client.post('/api/v1/auth/register', json={'email': email, 'password': 'test-pass-123', 'invite_code': invite})
    assert response.status_code == 200


def test_history_requires_cookie_and_demo_principal(client, monkeypatch):
    assert client.get('/api/v1/performance/history').status_code == 401
    assert client.post('/api/v1/performance/rebuild', json={}).status_code == 401
    register(client, monkeypatch, 'another@example.test')
    assert client.get('/api/v1/performance/history').status_code == 403
    assert client.post('/api/v1/performance/rebuild', json={'user_id': 1}).status_code == 403


def test_history_rebuild_uses_authenticated_dek_and_private_database_scope(client, monkeypatch):
    from backend.app.api import auth
    from backend.app.core import database
    register(client, monkeypatch, 'demouser@gmail.com')
    payload = jwt.decode(client.cookies.get('wc_session'), auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    dek = session_store.get_dek(payload['sid'])
    token = crypto.CURRENT_DEK.set(dek)
    db = database.SessionLocal()
    user = db.query(User).filter_by(email='demouser@gmail.com').one()
    seed(UserScope(db, user.id))
    db.close()
    crypto.CURRENT_DEK.reset(token)
    monkeypatch.setattr(history, 'valuation_cutoff', lambda: d(5))
    monkeypatch.setattr(history, 'fetch_spy', lambda *args: {day: {'close': value, 'adjusted': value, 'currency': 'USD'} for day, value in spy(1, 2, 3, 4, 5).items()})
    monkeypatch.setattr(history, 'fetch_instrument', lambda *args: {d(day): {'close': 100 + day, 'currency': 'USD'} for day in (2, 3, 4, 5)})
    assert client.get('/api/v1/performance/history').json()['status'] == 'needs_rebuild'
    assert client.post('/api/v1/performance/rebuild', json={'user_id': 999}).status_code == 202
    result = client.get('/api/v1/performance/history')
    assert result.status_code == 200
    assert result.json()['status'] == 'ready'
    assert result.json()['snapshots'][-1]['value'] == 1025
    assert crypto.CURRENT_DEK.get() is None
    assert client.post('/api/v1/performance/rebuild', json={'opening_cash': -1, 'set_opening_cash': True}).status_code == 422
    assert client.post('/api/v1/performance/rebuild', json={'opening_cash': 100, 'set_opening_cash': True}).status_code == 202
    assert client.get('/api/v1/performance/history').json()['openingCash'] == 100
    monkeypatch.setenv('WC_APP_ENV', 'production')
    assert client.get('/api/v1/performance/history').status_code == 403


def test_demo_sample_requires_authentication_and_shared_fixture_account(client, monkeypatch):
    assert client.post('/api/v1/performance/demo-sample').status_code == 401
    register(client, monkeypatch, 'demouser@gmail.com')
    assert client.post('/api/v1/performance/demo-sample').status_code == 403


def test_demo_sample_adds_fixed_rows_for_cookie_principal_only(client, monkeypatch):
    from backend.app.api import auth
    from backend.app.core import database
    from backend.tests.test_demo_performance_fixture import seed_original
    register(client, monkeypatch, 'demouser@gmail.com')
    payload = jwt.decode(client.cookies.get('wc_session'), auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
    token = crypto.CURRENT_DEK.set(session_store.get_dek(payload['sid']))
    db = database.SessionLocal()
    user = db.query(User).filter_by(email='demouser@gmail.com').one()
    user.is_test_user = True
    seed_original(UserScope(db, user.id))
    db.close()
    crypto.CURRENT_DEK.reset(token)
    response = client.post('/api/v1/performance/demo-sample', json={'user_id': 999, 'opening_cash': 999999999})
    assert response.status_code == 200
    assert response.json()['createdTransactions'] == 7
    assert response.json()['totalTransactions'] == 23
    assert client.post('/api/v1/performance/demo-sample').json()['createdTransactions'] == 0
    assert client.get('/api/v1/performance/history').json()['status'] == 'needs_rebuild'
