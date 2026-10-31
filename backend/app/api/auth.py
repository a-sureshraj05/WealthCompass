import json
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from limits import parse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.app.core import crypto, session_store
from backend.app.core.crypto_migrate import enable_encryption_for_user
from backend.app.core.database import get_db
from backend.app.db.schema import InviteCode, User

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET") or secrets.token_hex(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

# Open locally so a first account can be created; closed in demo mode, where the
# only accounts are the seeded ones.
_demo = os.getenv("WC_DEMO_MODE", "").lower() == "true"
ALLOW_REGISTRATION = (not _demo) and os.getenv("WC_ALLOW_REGISTRATION", "true").lower() == "true"

# --- Session cookie ----------------------------------------------------------
# HttpOnly: client-side JS can never read this value, even via an XSS bug —
# that's the whole point of moving off a JWT the frontend used to read out of
# localStorage. The browser attaches it automatically; nothing in the frontend
# needs a credentials:'include' fetch option, since every request this app
# ever makes is same-origin (no CORSMiddleware anywhere in main.py, and the
# Vite dev proxy makes it look that way locally too).
COOKIE_NAME = "wc_session"
# Defaults true, same pattern as WC_ALLOW_REGISTRATION. Chrome/Firefox treat
# http://localhost as trustworthy and store/send Secure cookies there despite
# no TLS, so this doesn't break local dev. It WOULD break reaching the dev
# server over plain HTTP via its Tailscale hostname (vite.config.ts's
# allowedHosts: ['.ts.net', ...] is a real access pattern here) — that's what
# this escape hatch is for.
COOKIE_SECURE = os.getenv("WC_COOKIE_SECURE", "true").lower() != "false"


def _get_token_from_cookie(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME, token,
        httponly=True, secure=COOKIE_SECURE, samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/",
    )

# --- Rate limiting ----------------------------------------------------------
# In-memory, single-process — same precedent/caveat as session_store.py: fine
# today, needs shared storage (Redis) once this runs on more than one worker.
#
# get_remote_address reads request.client.host directly. There is no
# ProxyHeadersMiddleware/X-Forwarded-For handling anywhere in this app yet, so
# behind a future reverse proxy every request would appear to come from the
# proxy's own IP, collapsing per-IP limiting to one global bucket. Fixing that
# is a hosting-deploy-time concern for whenever a proxy actually exists, not a
# code concern today.
limiter = Limiter(key_func=get_remote_address)

# Per-account limits, enforced separately from the per-IP ones below — a
# slowapi key_func runs synchronously and can't parse a request body, so this
# can't be a second @limiter.limit(key_func=...) decorator. Call
# _enforce_account_limit() directly instead, after the email is already a
# plain Python string.
_ACCOUNT_LOGIN_LIMIT = parse("5/minute")
_ACCOUNT_REGISTER_LIMIT = parse("5/minute")


def _enforce_account_limit(scope: str, email: str, limit) -> None:
    if not limiter.limiter.hit(limit, scope, email.strip().lower()):
        raise HTTPException(
            status_code=429,
            detail="Too many attempts for this account. Try again shortly.",
        )


class RegisterRequest(BaseModel):
    email: str
    password: str
    # Required, no separate feature flag gating whether this check runs —
    # an empty invite_codes table already blocks all registration regardless,
    # and a second boolean is one more thing to misconfigure later (operator
    # reopens WC_ALLOW_REGISTRATION, forgets this exists, ships an
    # accidentally-open instance). Mint codes via
    # backend/scripts/create_invite_codes.py.
    invite_code: str


def _claim_invite_code(db: Session, code: str, user_id: int) -> bool:
    """Atomically claim an invite code for `user_id`.

    A plain SELECT then conditional UPDATE has a TOCTOU gap two concurrent
    registrations could both slip through. This single UPDATE with the
    unclaimed check in its own WHERE closes it: under MVCC, the first
    concurrent call takes a row lock; the second blocks until the first
    commits, re-evaluates its WHERE against the now-committed row, sees
    used_by_user_id is no longer NULL, and affects 0 rows. No
    SELECT ... FOR UPDATE needed.
    """
    stmt = (
        update(InviteCode)
        .where(InviteCode.code == code, InviteCode.used_by_user_id.is_(None))
        .values(used_by_user_id=user_id, used_at=datetime.utcnow())
    )
    return db.execute(stmt).rowcount == 1


class TokenResponse(BaseModel):
    # The session token itself lives only in the HttpOnly cookie now — never
    # in a JSON body a script could read. This model exists purely to carry
    # the recovery key.
    #
    # Present ONLY in the register() response, and only once ever — this is
    # the user's one chance to save it. Never stored in plaintext, never
    # logged, never returned again by any other endpoint.
    recovery_key: Optional[str] = None


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def _issue_session(user: User, dek: bytes) -> str:
    """Create a DEK session and return a signed access token carrying its id.

    The DEK itself never goes in the token — only an opaque session id
    (`sid`) that looks it up in session_store. A JWT is attacker-readable the
    moment it leaves the server (it is just signed, not encrypted), so the
    key must live server-side, keyed by something that reveals nothing if
    the token itself leaks.
    """
    sid = session_store.create_session(dek, ttl_seconds=ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    return create_access_token({"sub": user.email, "sid": sid})


async def get_current_user(token: str = Depends(_get_token_from_cookie), db: Session = Depends(get_db)) -> User:
    """Resolve the caller, and bind their DEK to this request.

    A `yield`-based dependency (like get_db) so the DEK binding is guaranteed
    to clear after the request regardless of how the handler exits. Every
    non-auth router is already registered with
    `dependencies=[Depends(get_current_user)]` (see main.py), so this one
    function is what makes encrypted columns transparent everywhere else in
    the app — no other route file needs to change for Phase 2.

    Deliberately `async def`, not plain `def`, even though nothing inside
    awaits anything. FastAPI runs every sync dependency AND the sync
    endpoint itself in its OWN separate threadpool dispatch, each taking an
    independent copy of the current context — so a `contextvars.ContextVar`
    set inside a *sync* dependency never reaches the endpoint; the mutation
    is thrown away when that thread's call returns. An async dependency runs
    inline on the event loop instead, mutating the request's shared context
    before the endpoint's threadpool copy is taken, which is what makes the
    `crypto.CURRENT_DEK.set()` below actually visible when the endpoint
    later reads an encrypted column. The cost is a brief synchronous DB
    query running on the event loop rather than a worker thread — acceptable
    at today's traffic; revisit if request volume ever makes it matter.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        sid: str = payload.get("sid")
        if not email or not sid:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise credentials_exception

    dek = session_store.get_dek(sid)
    if dek is None:
        # Session expired or the server restarted (the store is in-memory —
        # see session_store.py's docstring). Same remedy either way: log in
        # again. A user with no encrypted data yet (shouldn't happen post-
        # Phase-2, but covers a not-yet-upgraded legacy row mid-request) is
        # not blocked by this — DekNotBoundError only fires if an encrypted
        # column is actually touched.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired, please log in again",
        )

    token_var = crypto.CURRENT_DEK.set(dek)
    try:
        yield user
    finally:
        crypto.CURRENT_DEK.reset(token_var)


@router.post("/auth/register", response_model=TokenResponse)
@limiter.limit("10/minute")
def register(request: Request, response: Response, body: RegisterRequest, db: Session = Depends(get_db)):
    # Per-account limit first — cheap, and stops a single targeted account
    # from being hammered even if the per-IP bucket (the decorator above)
    # isn't exhausted yet (e.g. an attacker spread across many IPs).
    _enforce_account_limit("register", body.email, _ACCOUNT_REGISTER_LIMIT)

    # The app is no longer single-user, so registration is gated by policy
    # rather than by "a user already exists". Default-closed on a hosted
    # instance: an open signup form on someone's portfolio tracker is an
    # invitation, so ALLOW_REGISTRATION must be set deliberately.
    if not ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="Registration is closed on this instance.")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="An account with that email already exists.")

    user = User(email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    db.flush()  # assigns user.id without committing — _claim_invite_code needs it

    if not _claim_invite_code(db, body.invite_code, user.id):
        db.rollback()
        raise HTTPException(status_code=403, detail="Invalid or already-used invite code.")

    # --- Encryption setup (T2) ------------------------------------------------
    dek = crypto.generate_dek()
    recovery_key = crypto.generate_recovery_key()

    dek_salt = crypto.generate_salt()
    kek = crypto.derive_kek(body.password, dek_salt, crypto.DEFAULT_KEK_PARAMS)
    user.dek_salt = dek_salt.hex()
    user.wrapped_dek = crypto.wrap(kek, dek)
    user.kek_params_json = json.dumps(crypto.DEFAULT_KEK_PARAMS)

    recovery_salt = crypto.generate_salt()
    recovery_kek = crypto.derive_recovery_kek(recovery_key, recovery_salt)
    user.recovery_salt = recovery_salt.hex()
    user.recovery_wrapped_dek = crypto.wrap(recovery_kek, dek)

    # user was already added+flushed above (before the invite-code claim,
    # which needs user.id) — this commit covers both it and the claim in one
    # transaction, so a failure anywhere in between rolls back together.
    db.commit()

    token = _issue_session(user, dek)
    _set_session_cookie(response, token)
    return {"recovery_key": recovery_key}


@router.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    _enforce_account_limit("login", form_data.username, _ACCOUNT_LOGIN_LIMIT)

    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    if user.wrapped_dek is None:
        # Legacy account, created before Phase 2 shipped: no DEK exists yet.
        # Mint one now and re-encrypt their existing plaintext data in place,
        # rather than leaving it permanently unreadable through the now-
        # encrypting ORM layer.
        dek = crypto.generate_dek()
        recovery_key = crypto.generate_recovery_key()

        dek_salt = crypto.generate_salt()
        kek = crypto.derive_kek(form_data.password, dek_salt, crypto.DEFAULT_KEK_PARAMS)
        user.dek_salt = dek_salt.hex()
        user.wrapped_dek = crypto.wrap(kek, dek)
        user.kek_params_json = json.dumps(crypto.DEFAULT_KEK_PARAMS)

        recovery_salt = crypto.generate_salt()
        recovery_kek = crypto.derive_recovery_kek(recovery_key, recovery_salt)
        user.recovery_salt = recovery_salt.hex()
        user.recovery_wrapped_dek = crypto.wrap(recovery_kek, dek)
        db.commit()

        enable_encryption_for_user(db, user, dek)

        token = _issue_session(user, dek)
        _set_session_cookie(response, token)
        return {"recovery_key": recovery_key}

    params = json.loads(user.kek_params_json) if user.kek_params_json else crypto.DEFAULT_KEK_PARAMS
    kek = crypto.derive_kek(form_data.password, bytes.fromhex(user.dek_salt), params)
    try:
        dek = crypto.unwrap(kek, user.wrapped_dek)
    except Exception:
        # Password already verified via bcrypt above, so this should not
        # happen in practice — but fail the same way a wrong password would
        # rather than leaking which check failed.
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = _issue_session(user, dek)
    _set_session_cookie(response, token)
    return {}


@router.post("/auth/logout")
def logout(request: Request, response: Response):
    """Explicitly end a session, dropping its DEK before the JWT's natural
    expiry. The token itself is not revoked (that needs a server-side
    blocklist, which is Phase 3 — see docs/ARCHITECTURE.md §11.5) but without
    a live session its `sid` resolves to nothing, so get_current_user treats
    it as expired regardless of the JWT's own exp claim."""
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            sid = payload.get("sid")
            if sid:
                session_store.drop_session(sid)
        except JWTError:
            pass
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/auth/confirm-recovery-key")
def confirm_recovery_key(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Record that the frontend confirmed the user saved their recovery key.

    Informational only today — nothing gates on `recovery_key_confirmed_at`
    yet. Exists so the frontend has somewhere to report that confirmation
    instead of just trusting a client-side checkbox with no server record.
    """
    current_user.recovery_key_confirmed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/auth/change-password")
def change_password(
    request: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Re-wrap the DEK under a new password-derived KEK.

    Per docs/ARCHITECTURE.md §11.4: the DEK itself never changes, so no data
    is re-encrypted here — only its wrapping. `get_current_user` already
    unwrapped the DEK for this session (that's what `CURRENT_DEK` holds); this
    endpoint re-wraps that same value, it does not derive it again from the
    old password. The old-password check below exists to prove the caller
    actually knows it, not to re-derive the key.
    """
    if not verify_password(request.old_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect current password")

    dek = crypto.CURRENT_DEK.get()
    if dek is None:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")

    new_salt = crypto.generate_salt()
    new_kek = crypto.derive_kek(request.new_password, new_salt, crypto.DEFAULT_KEK_PARAMS)
    current_user.dek_salt = new_salt.hex()
    current_user.wrapped_dek = crypto.wrap(new_kek, dek)
    current_user.kek_params_json = json.dumps(crypto.DEFAULT_KEK_PARAMS)
    current_user.hashed_password = hash_password(request.new_password)
    db.commit()
    return {"ok": True}


@router.get("/auth/me")
def me(current_user: User = Depends(get_current_user)):
    return {"email": current_user.email}


@router.get("/auth/status")
def auth_status(db: Session = Depends(get_db)):
    """Unauthenticated instance description, read by the login page.

    Its live consumer is the registration policy: the signup toggle follows
    `registration_open`, because offering a link the server answers with 403 is
    worse than offering none.

    This used to return the demo account list and password so the login page
    could publish them. That was removed along with the banner — the login page
    now carries no demo labelling, and an endpoint that advertised the
    credentials anyway would simply relocate what was deliberately taken off the
    page. The `demo` flag stays: it is a property of the instance, not a
    credential, and /healthz reports it too.
    """
    has_user = db.query(User).first() is not None
    return {
        "registered": has_user,
        "registration_open": ALLOW_REGISTRATION,
        "demo": _demo,
    }
