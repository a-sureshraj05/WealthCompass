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
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.api.deps import get_user_scope
from backend.app.core import insights as insights_core
from backend.app.core.scoping import UserScope
from backend.app.db.schema import (Holding, PortfolioSummary, RealizedGain,
                                   UnrealizedGain)

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

# Chat cannot use the trick that makes insights cheap. Insights are identical for
# every visitor, so one generation serves everyone until the data changes; a
# question is unique to whoever asked it, so every message is a paid call with
# nothing to reuse. The controls are therefore quantity-based instead:
#
#   messages/hour  bounds how much one visitor can spend
#   history turns  bounds the input tokens each of those messages costs
#   message length bounds a single oversized paste
#
# Without the history cap in particular, a long conversation re-sends everything
# said so far on every turn, so cost per message grows with conversation length.
CHAT_MAX_PER_HOUR = int(os.getenv("WC_CHAT_MAX_PER_HOUR", "20"))
CHAT_MAX_HISTORY = int(os.getenv("WC_CHAT_MAX_HISTORY", "12"))
CHAT_MAX_MESSAGE_CHARS = int(os.getenv("WC_CHAT_MAX_MESSAGE_CHARS", "2000"))
_chat_calls: dict[int, list[float]] = {}
_chat_lock = threading.Lock()


class InsightsResponse(BaseModel):
    text: Optional[str] = None
    generated_at: Optional[float] = None
    available: bool = True
    # True when the portfolio has changed since this text was written, so the UI
    # can refresh it once rather than showing an answer about a portfolio that no
    # longer exists. Also true when nothing is cached at all.
    stale: bool = False
    # Populated instead of `text` when generation is impossible — no API key
    # configured, nothing to analyse. The UI shows this rather than an error.
    reason: Optional[str] = None


def _build_digest(scope: UserScope):
    """The digest for this user, or None when there is nothing to analyse."""
    holdings = scope.query(Holding).all()
    if not holdings:
        return None
    summary = scope.query(PortfolioSummary).first()
    return insights_core.build_digest(
        holdings,
        sectors=insights_core._sector_map(summary.analyst_json if summary else None),
        realized=scope.query(RealizedGain).all(),
        open_lots=scope.query(UnrealizedGain).all(),
    )


def _fingerprint(scope: UserScope) -> Optional[str]:
    """Identity of the current portfolio, for detecting a stale cached insight."""
    holdings = scope.query(Holding).all()
    if not holdings:
        return None
    return insights_core.fingerprint(
        holdings,
        realized_count=scope.query(RealizedGain).count(),
        long_term_lots=scope.query(UnrealizedGain).filter(
            UnrealizedGain.isLongTerm == True).count(),  # noqa: E712
    )


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
    if not cached:
        return InsightsResponse(text=None, stale=True)

    # Three cheap counting queries — no digest build, no network, no model call.
    current = _fingerprint(scope)
    stale = bool(current) and cached.get("fingerprint") != current

    return InsightsResponse(
        text=cached.get("text"),
        generated_at=cached.get("generated_at"),
        stale=stale,
    )


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

    digest = _build_digest(scope)
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

    payload = {
        "text": text,
        "generated_at": now,
        "fingerprint": _fingerprint(scope),
    }
    _write_cache(scope, payload)
    return InsightsResponse(text=text, generated_at=now, stale=False)


# --- chat -----------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: Optional[str] = None
    available: bool = True
    reason: Optional[str] = None
    # Messages left this hour, so the UI can warn before the limit rather than
    # only when it is hit.
    remaining: Optional[int] = None


def _claim_chat_slot(user_id: int) -> int:
    """Reserve one message against the hourly budget. Returns remaining after it.

    Raises HTTPException(429) when the budget is exhausted. The slot is taken
    before the paid call, so simultaneous requests cannot both pass the check.
    """
    now = time.time()
    with _chat_lock:
        recent = [t for t in _chat_calls.get(user_id, []) if now - t < 3600]
        if len(recent) >= CHAT_MAX_PER_HOUR:
            oldest = min(recent)
            wait_minutes = int((3600 - (now - oldest)) / 60) + 1
            raise HTTPException(
                status_code=429,
                detail=(f"Message limit reached ({CHAT_MAX_PER_HOUR}/hour). "
                        f"Try again in about {wait_minutes} minute(s)."),
            )
        recent.append(now)
        _chat_calls[user_id] = recent
        return CHAT_MAX_PER_HOUR - len(recent)


def _release_chat_slot(user_id: int) -> None:
    """Hand back the most recent slot when nothing was actually spent."""
    with _chat_lock:
        if _chat_calls.get(user_id):
            _chat_calls[user_id].pop()


@router.post("/insights/chat", response_model=ChatResponse)
def chat(request: ChatRequest, scope: UserScope = Depends(get_user_scope)):
    """Answer a question about the signed-in user's portfolio."""
    if not request.messages:
        raise HTTPException(status_code=400, detail="No message provided.")

    # Trust nothing about the client's history: it round-trips through the
    # browser, so roles and length are validated here rather than assumed.
    for m in request.messages:
        if m.role not in ("user", "assistant"):
            raise HTTPException(status_code=400, detail=f"Invalid role: {m.role}")
        if len(m.content) > CHAT_MAX_MESSAGE_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"Message too long (limit {CHAT_MAX_MESSAGE_CHARS} characters).",
            )
    if request.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="The last message must be from the user.")

    holdings = scope.query(Holding).all()
    if not holdings:
        return ChatResponse(available=False, reason="Add holdings before using AI chat.")

    digest = _build_digest(scope)
    if digest is None:
        return ChatResponse(
            available=False,
            reason="No priced positions to discuss yet — refresh prices and try again.",
        )

    remaining = _claim_chat_slot(scope.user_id)

    # Keep the most recent turns. Trimming from the front preserves the current
    # question; trimming from the back would drop it.
    history = [m.model_dump() for m in request.messages][-CHAT_MAX_HISTORY:]

    try:
        reply = insights_core.chat(digest, history)
    except insights_core.InsightsUnavailable as exc:
        _release_chat_slot(scope.user_id)
        logger.warning("[chat] unavailable for user %s: %s", scope.user_id, exc)
        return ChatResponse(available=False, reason=str(exc))
    except Exception:
        _release_chat_slot(scope.user_id)
        logger.exception("[chat] unexpected failure for user %s", scope.user_id)
        return ChatResponse(
            available=False,
            reason="That message could not be answered. Please try again.",
        )

    return ChatResponse(reply=reply, remaining=remaining)
