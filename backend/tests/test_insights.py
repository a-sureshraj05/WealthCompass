"""AI insights: digest scaling and the controls that bound what it can spend.

Two things are worth testing here, and neither is "does the model give a good
answer".

**The digest must not carry dollar amounts.** That is the whole privacy design —
percentages go out, the UI re-expands locally. A regression would be silent: the
feature keeps working and simply starts disclosing net worth.

**The cost controls must hold.** Generation is the only route in the app that
spends money per call, and the instance publishes its credentials. If the
cooldown stops firing, or a cache read starts triggering generation, nothing
breaks visibly — the bill just grows. Every test below counts actual calls to the
generator rather than trusting the response, because the response looks identical
either way.

The generator itself is stubbed throughout: these tests never reach the network.
"""

import os
import tempfile

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core import insights
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Base, Holding, RealizedGain, User


def _holding(user_id, ticker, brokerage, market_value, total_cost, asset_type="Equity"):
    return Holding(
        user_id=user_id, ticker=ticker, brokerage=brokerage, quantity=1.0,
        averageCostPerShare=total_cost, totalCost=total_cost,
        currentPrice=market_value, previousClose=market_value,
        marketValue=market_value, assetType=asset_type,
    )


@pytest.fixture()
def scope():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine)()
    session.add(User(id=1, email="a@example.com", hashed_password="x"))
    session.add_all([
        _holding(1, "AAPL", "Robinhood", 5000.0, 2500.0),
        _holding(1, "NVDA", "Schwab", 3000.0, 1000.0),
        _holding(1, "KO", "Robinhood", 2000.0, 2500.0),
    ])
    session.commit()
    yield UserScope(session, 1)
    session.close()
    os.unlink(path)


# --- digest ---------------------------------------------------------------

def test_digest_is_percentages_not_dollars(scope):
    """No figure in the digest may reveal the portfolio's size."""
    digest = insights.build_digest(scope.query(Holding).all())

    # The three holdings above total $10,000 with a $6,000 basis. If any of
    # those numbers appear anywhere in the payload, scaling has regressed.
    flat = repr(digest)
    for dollar_figure in ("10000", "5000", "3000", "2500", "6000"):
        assert dollar_figure not in flat, f"{dollar_figure} leaked into the digest"

    assert round(sum(p["portfolio_pct"] for p in digest["positions"]), 1) == 100.0
    assert digest["largest_position_pct"] == 50.0          # 5000 / 10000
    assert digest["overall_gain_pct"] == 66.7              # (10000-6000)/6000
    assert digest["by_brokerage_pct"] == {"Robinhood": 70.0, "Schwab": 30.0}


def test_digest_omits_gain_when_basis_is_missing(scope):
    """A transferred-in lot with no basis must not read as a flat position."""
    scope.add(_holding(1, "MSFT", "Schwab", 1000.0, 0.0))
    scope.db.commit()

    digest = insights.build_digest(scope.query(Holding).all())
    msft = next(p for p in digest["positions"] if p["ticker"] == "MSFT")
    assert msft["gain_pct"] is None, "no basis should mean no gain, not 0%"


def test_digest_skips_unpriced_positions(scope):
    """An unpriced holding would otherwise divide the percentages by a wrong total."""
    scope.add(_holding(1, "DEAD", "Schwab", 0.0, 500.0))
    scope.db.commit()

    digest = insights.build_digest(scope.query(Holding).all())
    assert {p["ticker"] for p in digest["positions"]} == {"AAPL", "NVDA", "KO"}
    assert round(sum(p["portfolio_pct"] for p in digest["positions"]), 1) == 100.0


def test_digest_is_none_when_nothing_to_analyse():
    assert insights.build_digest([]) is None


def test_realized_history_is_counts_and_ratios_only(scope):
    """Closed lots may inform the analysis, but never by their amounts."""
    realized = [
        RealizedGain(user_id=1, ticker="AAPL", gain=1234.56, isLongTerm=True),
        RealizedGain(user_id=1, ticker="NVDA", gain=-99.99, isLongTerm=False),
    ]
    digest = insights.build_digest(scope.query(Holding).all(), realized=realized)

    assert digest["realized"] == {
        "closed_lot_count": 2,
        "long_term_pct": 50.0,
        "profitable_pct": 50.0,
    }
    assert "1234" not in repr(digest) and "99.99" not in repr(digest)


# --- cost controls --------------------------------------------------------

@pytest.fixture()
def client(monkeypatch, tmp_path):
    """A demo-mode app with the generator stubbed and call counting enabled."""
    monkeypatch.setenv("WC_DEMO_MODE", "true")
    monkeypatch.setenv("WC_DEMO_RESET_MINUTES", "0")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path}/insights.db")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    from fastapi.testclient import TestClient

    from backend.app.api import insights as insights_api
    from backend.app.main import app

    calls = {"n": 0}

    def fake_generate(digest):
        calls["n"] += 1
        return "One observation.\nAnother observation."

    monkeypatch.setattr(insights_api.insights_core, "generate", fake_generate)
    # Leaks across tests otherwise — the counter is module-level by design.
    insights_api._last_generated.clear()

    with TestClient(app) as c:
        yield c, calls


def _auth(client, email="demouser@gmail.com"):
    token = client.post(
        "/api/v1/auth/login",
        data={"username": email, "password": "welcome"},
    ).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_cached_read_never_generates(client):
    """The dashboard calls this on every mount; it must be free."""
    c, calls = client
    headers = _auth(c)

    for _ in range(3):
        assert c.get("/api/v1/insights/cached", headers=headers).status_code == 200

    assert calls["n"] == 0, "a cache read triggered a paid generation"


def test_cooldown_blocks_the_second_spend(client):
    """Holding down the button must not bill per click."""
    c, calls = client
    headers = _auth(c)

    assert c.post("/api/v1/insights/generate", headers=headers).status_code == 200
    assert calls["n"] == 1

    second = c.post("/api/v1/insights/generate", headers=headers)
    assert second.status_code == 429
    assert calls["n"] == 1, "the cooldown returned 429 but still called the model"


def test_generated_text_is_cached_and_served_free(client):
    c, calls = client
    headers = _auth(c)

    generated = c.post("/api/v1/insights/generate", headers=headers).json()["text"]
    cached = c.get("/api/v1/insights/cached", headers=headers).json()["text"]

    assert cached == generated
    assert calls["n"] == 1


def test_one_users_insights_are_not_visible_to_another(client):
    c, _ = client
    c.post("/api/v1/insights/generate", headers=_auth(c, "demouser@gmail.com"))

    other = c.get("/api/v1/insights/cached", headers=_auth(c, "testuser@gmail.com"))
    assert other.json()["text"] is None


def test_missing_api_key_reports_unavailable_without_locking_the_user_out(client, monkeypatch):
    """A misconfiguration must not also be rate-limited into looking like a bug."""
    c, _ = client
    from backend.app.api import insights as insights_api

    def unavailable(digest):
        raise insights_api.insights_core.InsightsUnavailable("not configured")

    monkeypatch.setattr(insights_api.insights_core, "generate", unavailable)
    headers = _auth(c)

    first = c.post("/api/v1/insights/generate", headers=headers)
    assert first.status_code == 200
    assert first.json()["available"] is False

    # Immediately retryable: the cooldown is released when nothing was spent.
    assert c.post("/api/v1/insights/generate", headers=headers).status_code == 200
