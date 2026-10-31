"""Per-user encryption — the single seam for every cryptographic operation.

Plays the same role for confidentiality that `scoping.py`'s `UserScope` plays
for tenancy: one seam, fail-closed, so "did we remember to encrypt this
column" stops being a per-call-site question.

Design (T2 tier, see docs/ARCHITECTURE.md §11): each user gets a random
32-byte DEK (data-encryption key) at registration. The DEK is wrapped
(encrypted) by a KEK (key-encryption key) derived from the user's password via
Argon2id, and a *second* copy is wrapped by a KEK derived from a one-time
recovery key. Only the wrapped blobs are stored — the DEK itself is held in
session memory only, for the lifetime of a login, and is never written to
disk. Sensitive columns (quantities, prices, dollar amounts) are encrypted
with the DEK via the EncryptedFloat/EncryptedString/EncryptedJSON column
types below; market data (ticker, live quotes) and structural columns (date,
action, flags) stay plaintext — see schema.py for exactly which.

The property this buys: a database dump, stolen backup, or compromised host
yields ciphertext for every sensitive column, for every user who is not
currently logged in. It does not stop a host that modifies its own server to
capture DEKs as users log in — that is T3 (end-to-end), a materially bigger
redesign, explicitly not what this builds.
"""

import base64
import contextvars
import json
import secrets
from typing import Any, Optional

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from sqlalchemy.types import TypeDecorator, Text

# The active request's unwrapped DEK. Set by auth.get_current_user for the
# lifetime of one request, reset in its `finally`. Never persisted.
CURRENT_DEK: "contextvars.ContextVar[Optional[bytes]]" = contextvars.ContextVar(
    "CURRENT_DEK", default=None
)

DEK_SIZE = 32          # AES-256
NONCE_SIZE = 12        # AES-GCM standard nonce size
RECOVERY_KEY_BYTES = 20  # 160 bits of entropy, Base32-encoded for legibility

# Argon2id defaults for new users. Stored per-user (kek_params_json) rather
# than hardcoded here, so a future user can be issued stronger parameters
# without invalidating everyone already registered under weaker ones.
DEFAULT_KEK_PARAMS = {"time_cost": 3, "memory_cost": 65536, "parallelism": 4}


class DekNotBoundError(RuntimeError):
    """Raised when an encrypted column is touched outside a bound request.

    Fail-closed, deliberately: the alternative (silently storing plaintext,
    or returning garbage) is exactly the bug this whole design exists to
    prevent. Mirrors UserScope's refusal to construct without a user_id.
    """


# --- key generation ----------------------------------------------------------

def generate_dek() -> bytes:
    return secrets.token_bytes(DEK_SIZE)


def generate_recovery_key() -> str:
    """A one-time recovery key, shown to the user exactly once at registration.

    Base32 (RFC 4648, no padding) grouped into dashed blocks of 4 so it is
    legible to copy down by hand: e.g. 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX'.
    """
    raw = secrets.token_bytes(RECOVERY_KEY_BYTES)
    b32 = base64.b32encode(raw).decode("ascii").rstrip("=")
    return "-".join(b32[i:i + 4] for i in range(0, len(b32), 4))


def generate_salt(size: int = 16) -> bytes:
    return secrets.token_bytes(size)


# --- key derivation ------------------------------------------------------------

def derive_kek(password: str, salt: bytes, params: Optional[dict] = None) -> bytes:
    """Argon2id-derive a key-encryption key from a password.

    `params` controls cost (time_cost/memory_cost/parallelism) and is read
    from the user's stored kek_params_json, not hardcoded, so cost can rise
    for new users without breaking existing ones' ability to log in.
    """
    p = params or DEFAULT_KEK_PARAMS
    return hash_secret_raw(
        secret=password.encode("utf-8"),
        salt=salt,
        time_cost=p["time_cost"],
        memory_cost=p["memory_cost"],
        parallelism=p["parallelism"],
        hash_len=DEK_SIZE,
        type=Type.ID,
    )


def derive_recovery_kek(recovery_key: str, salt: bytes) -> bytes:
    """HKDF-derive a key-encryption key from the recovery key.

    The recovery key already carries ~160 bits of entropy (it is random, not
    user-chosen), so a slow password KDF buys nothing here — HKDF-SHA256 is
    the right tool for "derive a key from an already-high-entropy secret".
    """
    hkdf = HKDF(algorithm=hashes.SHA256(), length=DEK_SIZE, salt=salt, info=b"wealthcompass-recovery-kek")
    return hkdf.derive(recovery_key.encode("utf-8"))


# --- wrap / unwrap (AES-256-GCM) ----------------------------------------------

def wrap(key: bytes, plaintext: bytes) -> str:
    """AEAD-encrypt `plaintext` under `key`. Returns base64(nonce || ciphertext).

    A fresh random nonce is drawn on every call — nonce reuse under the same
    key is the one thing that breaks AES-GCM's guarantees, so this never
    accepts or derives a nonce from the caller.
    """
    nonce = secrets.token_bytes(NONCE_SIZE)
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def unwrap(key: bytes, blob: str) -> bytes:
    """Inverse of wrap(). Raises (InvalidTag, via cryptography) on a wrong key
    or corrupted blob — callers treat that as 'wrong password', same UX as
    bcrypt's checkpw returning False today."""
    raw = base64.b64decode(blob)
    nonce, ciphertext = raw[:NONCE_SIZE], raw[NONCE_SIZE:]
    return AESGCM(key).decrypt(nonce, ciphertext, None)


# --- SQLAlchemy column types ---------------------------------------------------

class _EncryptedColumn(TypeDecorator):
    """Base for columns encrypted with the current request's DEK.

    Stores base64 text (`impl = Text`) — a plain string column, portable to
    Postgres unchanged when Phase 3 migrates the engine. NULL passes through
    without encryption (there is nothing to encrypt about "no value").
    """
    impl = Text
    cache_ok = True

    def _to_bytes(self, value: Any) -> bytes:
        raise NotImplementedError

    def _from_bytes(self, raw: bytes) -> Any:
        raise NotImplementedError

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        dek = CURRENT_DEK.get()
        if dek is None:
            raise DekNotBoundError(
                "no DEK bound to this request — an encrypted column was written "
                "outside a request that went through get_current_user. Refusing "
                "to store plaintext or fail open."
            )
        return wrap(dek, self._to_bytes(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        dek = CURRENT_DEK.get()
        if dek is None:
            raise DekNotBoundError(
                "no DEK bound to this request — an encrypted column was read "
                "outside a request that went through get_current_user."
            )
        return self._from_bytes(unwrap(dek, value))


class EncryptedFloat(_EncryptedColumn):
    def _to_bytes(self, value: Any) -> bytes:
        return str(float(value)).encode("utf-8")

    def _from_bytes(self, raw: bytes) -> Any:
        return float(raw.decode("utf-8"))


class EncryptedString(_EncryptedColumn):
    def _to_bytes(self, value: Any) -> bytes:
        return str(value).encode("utf-8")

    def _from_bytes(self, raw: bytes) -> Any:
        return raw.decode("utf-8")


class EncryptedJSON(_EncryptedColumn):
    def _to_bytes(self, value: Any) -> bytes:
        return json.dumps(value).encode("utf-8")

    def _from_bytes(self, raw: bytes) -> Any:
        return json.loads(raw.decode("utf-8"))
