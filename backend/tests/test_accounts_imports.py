"""Account sync contracts and validation before manual-history replacement."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from backend.app.api import brokerage, manual_import


class UntouchedDB:
    def __getattr__(self, name):
        raise AssertionError(f"Invalid statement must not access DB method {name}")


def test_provider_accounts_use_guard_then_current_user_scope(monkeypatch):
    events = []
    db = object()
    user = SimpleNamespace(id=91, is_test_user=False)
    scope = object()
    monkeypatch.setattr(brokerage, "require_provider_access", lambda u: events.append(("guard", u.id)))
    def make_scope(actual_db, user_id):
        assert actual_db is db
        events.append(("scope", user_id))
        return scope
    def provider_accounts(actual_scope):
        assert actual_scope is scope
        events.append(("provider",))
        return [{"id": "provider-uuid", "authorization_id": "auth-uuid"}]
    monkeypatch.setattr(brokerage, "UserScope", make_scope)
    monkeypatch.setattr(brokerage.snaptrade, "get_accounts", provider_accounts)
    assert brokerage.get_provider_accounts(db, user)[0]["id"] == "provider-uuid"
    assert events == [("guard", 91), ("scope", 91), ("provider",)]


def test_test_accounts_cannot_reach_provider_accounts(monkeypatch):
    def forbidden(*args):
        pytest.fail("Provider called for a shared test account")
    monkeypatch.setattr(brokerage.snaptrade, "get_accounts", forbidden)
    with pytest.raises(HTTPException) as error:
        brokerage.get_provider_accounts(UntouchedDB(), SimpleNamespace(id=91, is_test_user=True))
    assert error.value.status_code == 503


HEADER = "Date,Action,Symbol,Description,Quantity,Price,Commissions & Fees,Amount,Settlement Date"


@pytest.mark.parametrize("text,broker", [
    ("", "Schwab"),
    ("not,a,statement", "Schwab"),
    (HEADER, "Schwab"),
    (HEADER + "\nnot-a-date,Buy,AAPL,Apple,10,100,0,-1000,2026-01-02", "Schwab"),
    (HEADER + "\n2026-01-01,Buy,AAPL,Apple,10,nan,0,-1000,2026-01-02", "Schwab"),
    (HEADER, "Fidelity"),
])
def test_invalid_statement_never_deletes_existing_records(monkeypatch, text, broker):
    monkeypatch.setattr(manual_import, "DEMO_MODE", False)
    request = manual_import.StatementRequest(text=text, brokerageName=broker)
    with pytest.raises(HTTPException) as error:
        manual_import.parse_statement_import_endpoint(request, UntouchedDB(), SimpleNamespace(id=91, is_test_user=False))
    assert error.value.status_code == 400


def test_demo_import_guard_precedes_parsing(monkeypatch):
    def forbidden(*args):
        pytest.fail("Shared demo statements must not be parsed")
    monkeypatch.setattr(manual_import, "csv_data_parse", forbidden)
    with pytest.raises(HTTPException) as error:
        manual_import.parse_statement_import_endpoint(manual_import.StatementRequest(text=HEADER, brokerageName="Schwab"), UntouchedDB(), SimpleNamespace(id=91, is_test_user=True))
    assert error.value.status_code == 503


def test_valid_import_replaces_only_current_users_selected_brokerage(monkeypatch):
    """Exercise the successful write path using an isolated in-memory database."""
    from datetime import datetime
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from backend.app.core import crypto
    from backend.app.db.schema import Base, ManualRawTransaction, SnaptradeTransaction, Transaction

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    token = crypto.CURRENT_DEK.set(crypto.generate_dek())
    monkeypatch.setattr(manual_import, "DEMO_MODE", False)
    processed = []
    monkeypatch.setattr(manual_import.process, "process_transactions", lambda db, user, broker: processed.append((user, broker)))
    try:
        def row(model, user=91, broker="Schwab", **extra):
            return model(user_id=user, brokerage=broker, date=datetime(2026, 1, 1), ticker="AAPL", name="Apple", action="BUY", quantity=1, price=100, assetType="Equity", **extra)
        session.add_all([
            row(ManualRawTransaction, costPerShare=100, totalCost=100),
            row(ManualRawTransaction, user=92, costPerShare=100, totalCost=100),
            row(ManualRawTransaction, broker="Robinhood", costPerShare=100, totalCost=100),
            row(Transaction, source="manual", costPerShare=100, totalCost=100),
            row(Transaction, source="manual", costPerShare=100, totalCost=100, is_backend_verified=True),
            row(Transaction, source="snaptrade", costPerShare=100, totalCost=100),
            row(Transaction, user=92, source="manual", costPerShare=100, totalCost=100),
            SnaptradeTransaction(user_id=91, brokerage="Schwab", date=datetime(2026, 2, 1), ticker="AAPL", snaptrade_transaction_id="fictional-1"),
        ])
        session.commit()
        text = HEADER + "\n2026-01-10,Buy,AAPL,Apple,10,150,0,-1500,2026-01-11"
        result = manual_import.parse_statement_import_endpoint(
            manual_import.StatementRequest(text=text, brokerageName="Schwab"), session,
            SimpleNamespace(id=91, is_test_user=False),
        )
        manual = session.query(ManualRawTransaction).filter_by(user_id=91, brokerage="Schwab").all()
        assert len(manual) == 1 and manual[0].quantity == 10
        assert session.query(ManualRawTransaction).filter_by(user_id=92).count() == 1
        assert session.query(ManualRawTransaction).filter_by(user_id=91, brokerage="Robinhood").count() == 1
        assert session.query(Transaction).filter_by(user_id=91, source="snaptrade").count() == 1
        assert session.query(Transaction).filter_by(user_id=91, is_backend_verified=True).count() == 1
        assert session.query(Transaction).filter_by(user_id=92).count() == 1
        assert len(result["transactions"]) == 3
        assert processed == [(91, "Schwab")]
    finally:
        crypto.CURRENT_DEK.reset(token)
        session.close()
        engine.dispose()
