"""AI portfolio insights routes.

Two endpoints, deliberately split:

- `GET /insights/cached` is free and instant — it reads whatever was last
  generated. The dashboard calls this on mount.
- `POST /insights/generate` is the one that spends money, and only runs on an
  explicit click.

That split is the cost control. An endpoint that generated on every page load
would bill per visitor; this bills per click, and the stored result serves
everyone until the data changes.
"""

import json
import logging
import os
import threading
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.deps import get_user_scope
from backend.app.core import insights as insights_core
from backend.app.core.scoping import UserScope
from backend.app.db.schema import Holding, PortfolioSummary, RealizedGain

logger = logging.getLogger(__name__)
router = APIRouter()

# Minimum seconds between generations for one user. The demo publishes its
# credentials, so without this a visitor could hold down the button and spend the
# operator's API credit at whatever rate the network allows. Per-user rather than
# global so one busy demo account cannot starve another.
#
# In-process and therefore per-worker: fine while the app runs a single uvicorn
# worker (prices.py already requires that), but it would need to move into the
# database alongside a real rate limiter before running more than one.
COOLDOWN_SECONDS = int(os.getenv("WC_INSIGHTS_COOLDOWN_SECONDS", "60"))
_last_generated: dict[int, float] = {}
_cooldown_lock = threading.Lock()


class InsightsResponse(BaseModel):
    text: Optional[str] = None
    generated_at: Optional[float] = None
    available: bool = True
    # Populated instead of `text` when generation is impossible — no API key
    # configured, nothing to analyse. The UI shows this rather than an error.
    reason: Optional[str] = None


def _read_cache(scope: UserScope) -> Optional[dict]:
    summary = scope.query(PortfolioSummary).first()
    if not summary or not summary.insights_json:
        return None
    try:
        return json.loads(summary.insights_json)
    except (ValueError, TypeError):
        return None


def _write_cache(scope: UserScope, payload: dict) -> None:
    summary = scope.query(PortfolioSummary).first()
    if summary is None:
        summary = PortfolioSummary()
        scope.add(summary)
    summary.insights_json = json.dumps(payload)
    scope.db.commit()


@router.get("/insights/cached", response_model=InsightsResponse)
def get_insights_cached(scope: UserScope = Depends(get_user_scope)):
    """Last generated insights, or an empty response. Never calls the AI service."""
    cached = _read_cache(scope)
    if cached:
        return InsightsResponse(
            text=cached.get("text"),
            generated_at=cached.get("generated_at"),
        )
    return InsightsResponse(text=None)


@router.post("/insights/generate", response_model=InsightsResponse)
def generate_insights(scope: UserScope = Depends(get_user_scope)):
    """Build a scaled digest of this user's portfolio and have Claude interpret it."""
    now = time.time()
    with _cooldown_lock:
        last = _last_generated.get(scope.user_id, 0.0)
        remaining = COOLDOWN_SECONDS - (now - last)
        if remaining > 0:
            # 429 rather than a silent cached response, so the UI can say why
            # nothing changed instead of looking broken.
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {int(remaining) + 1}s before regenerating.",
            )
        # Claimed before the call, not after: two clicks that arrive together
        # would otherwise both see an expired cooldown and both spend money.
        _last_generated[scope.user_id] = now

    holdings = scope.query(Holding).all()
    if not holdings:
        return InsightsResponse(
            available=False,
            reason="Add holdings to generate AI insights.",
        )

    summary = scope.query(PortfolioSummary).first()
    sectors = insights_core._sector_map(summary.analyst_json if summary else None)
    realized = scope.query(RealizedGain).all()

    digest = insights_core.build_digest(holdings, sectors=sectors, realized=realized)
    if digest is None:
        return InsightsResponse(
            available=False,
            reason="No priced positions to analyse yet — refresh prices and try again.",
        )

    try:
        text = insights_core.generate(digest)
    except insights_core.InsightsUnavailable as exc:
        # Expected, user-facing conditions (no key, refusal, provider down).
        # Released so a misconfiguration isn't also rate-limited into confusion.
        with _cooldown_lock:
            _last_generated.pop(scope.user_id, None)
        logger.warning("[insights] unavailable for user %s: %s", scope.user_id, exc)
        return InsightsResponse(available=False, reason=str(exc))
    except Exception:
        with _cooldown_lock:
            _last_generated.pop(scope.user_id, None)
        logger.exception("[insights] unexpected failure for user %s", scope.user_id)
        return InsightsResponse(
            available=False,
            reason="Insights could not be generated. Please try again.",
        )

    payload = {"text": text, "generated_at": now}
    _write_cache(scope, payload)
    return InsightsResponse(text=text, generated_at=now)
