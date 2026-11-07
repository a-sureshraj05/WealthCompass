"""In-memory DEK session store.

Deliberately a Phase-2-only, single-process design: a plain dict keyed by
session id, holding each logged-in user's unwrapped DEK for the lifetime of
their session. It does not survive a server restart (sessions just expire —
the user logs in again, no data lost) and does not work across multiple
worker processes or containers.

That second limitation is not a bug to fix here. Phase 3's hosting hardening
already calls for moving sessions to shared storage (Redis) once the app runs
under more than one worker/instance, as part of the same work that replaces
the JWT-in-localStorage pattern with server-revocable cookie sessions — this
file is superseded by that change, not patched around it.
"""

import time
from typing import Optional

import secrets

_SESSION_ID_BYTES = 32

# session_id -> (dek, expires_at_epoch_seconds)
_sessions: dict = {}


def create_session(dek: bytes, ttl_seconds: int) -> str:
    session_id = secrets.token_hex(_SESSION_ID_BYTES)
    _sessions[session_id] = (dek, time.time() + ttl_seconds)
    return session_id


def get_dek(session_id: str) -> Optional[bytes]:
    entry = _sessions.get(session_id)
    if entry is None:
        return None
    dek, expires_at = entry
    if time.time() >= expires_at:
        _sessions.pop(session_id, None)
        return None
    return dek


def drop_session(session_id: str) -> None:
    _sessions.pop(session_id, None)
