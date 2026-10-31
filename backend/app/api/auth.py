import json
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core import crypto, session_store
from backend.app.core.crypto_migrate import enable_encryption_for_user
from backend.app.core.database import get_db
from backend.app.db.schema import User

router = APIRouter()

SECRET_KEY = os.getenv("JWT_SECRET") or secrets.token_hex(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

# Open locally so a first account can be created; closed in demo mode, where the
# only accounts are the seeded ones.
_demo = os.getenv("WC_DEMO_MODE", "").lower() == "true"
ALLOW_REGISTRATION = (not _demo) and os.getenv("WC_ALLOW_REGISTRATION", "true").lower() == "true"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class RegisterRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
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


async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
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
        headers={"WWW-Authenticate": "Bearer"},
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
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_var = crypto.CURRENT_DEK.set(dek)
    try:
        yield user
    finally:
        crypto.CURRENT_DEK.reset(token_var)


@router.post("/auth/register", response_model=TokenResponse)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    # The app is no longer single-user, so registration is gated by policy
    # rather than by "a user already exists". Default-closed on a hosted
    # instance: an open signup form on someone's portfolio tracker is an
    # invitation, so ALLOW_REGISTRATION must be set deliberately.
    if not ALLOW_REGISTRATION:
        raise HTTPException(status_code=403, detail="Registration is closed on this instance.")
    if db.query(User).filter(User.email == request.email).first():
        raise HTTPException(status_code=400, detail="An account with that email already exists.")

    user = User(email=request.email, hashed_password=hash_password(request.password))

    # --- Encryption setup (T2) ------------------------------------------------
    dek = crypto.generate_dek()
    recovery_key = crypto.generate_recovery_key()

    dek_salt = crypto.generate_salt()
    kek = crypto.derive_kek(request.password, dek_salt, crypto.DEFAULT_KEK_PARAMS)
    user.dek_salt = dek_salt.hex()
    user.wrapped_dek = crypto.wrap(kek, dek)
    user.kek_params_json = json.dumps(crypto.DEFAULT_KEK_PARAMS)

    recovery_salt = crypto.generate_salt()
    recovery_kek = crypto.derive_recovery_kek(recovery_key, recovery_salt)
    user.recovery_salt = recovery_salt.hex()
    user.recovery_wrapped_dek = crypto.wrap(recovery_kek, dek)

    db.add(user)
    db.commit()

    token = _issue_session(user, dek)
    return {"access_token": token, "token_type": "bearer", "recovery_key": recovery_key}


@router.post("/auth/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
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
        return {"access_token": token, "token_type": "bearer", "recovery_key": recovery_key}

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
    return {"access_token": token, "token_type": "bearer"}


@router.post("/auth/logout")
def logout(token: str = Depends(oauth2_scheme)):
    """Explicitly end a session, dropping its DEK before the JWT's natural
    expiry. The token itself is not revoked (that needs a server-side
    blocklist, which is Phase 3 — see docs/ARCHITECTURE.md §11.5) but without
    a live session its `sid` resolves to nothing, so get_current_user treats
    it as expired regardless of the JWT's own exp claim."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return {"ok": True}
    sid = payload.get("sid")
    if sid:
        session_store.drop_session(sid)
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
