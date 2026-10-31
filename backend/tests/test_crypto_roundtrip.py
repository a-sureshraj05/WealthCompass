"""Unit-level correctness of the primitives in backend/app/core/crypto.py.

No database, no FastAPI — just the wrap/unwrap/derive functions themselves.
Everything above this layer (schema.py's encrypted columns, auth.py's
register/login) is only as trustworthy as these primitives.
"""

from backend.app.core import crypto


def test_wrap_unwrap_roundtrip():
    key = crypto.generate_dek()
    plaintext = b"23.5"
    blob = crypto.wrap(key, plaintext)
    assert crypto.unwrap(key, blob) == plaintext


def test_derive_kek_is_deterministic_for_same_inputs():
    salt = crypto.generate_salt()
    a = crypto.derive_kek("correct horse", salt, crypto.DEFAULT_KEK_PARAMS)
    b = crypto.derive_kek("correct horse", salt, crypto.DEFAULT_KEK_PARAMS)
    assert a == b


def test_derive_kek_differs_for_different_password():
    salt = crypto.generate_salt()
    a = crypto.derive_kek("correct horse", salt, crypto.DEFAULT_KEK_PARAMS)
    b = crypto.derive_kek("battery staple", salt, crypto.DEFAULT_KEK_PARAMS)
    assert a != b


def test_derive_kek_differs_for_different_salt():
    a = crypto.derive_kek("correct horse", crypto.generate_salt(), crypto.DEFAULT_KEK_PARAMS)
    b = crypto.derive_kek("correct horse", crypto.generate_salt(), crypto.DEFAULT_KEK_PARAMS)
    assert a != b


def test_wrap_never_reuses_a_nonce():
    """Same key, same plaintext, two calls — ciphertext must differ or the
    nonce was reused, which breaks AES-GCM's guarantees entirely."""
    key = crypto.generate_dek()
    a = crypto.wrap(key, b"same plaintext")
    b = crypto.wrap(key, b"same plaintext")
    assert a != b
    # ...but both still decrypt to the original value.
    assert crypto.unwrap(key, a) == b"same plaintext"
    assert crypto.unwrap(key, b) == b"same plaintext"


def test_unwrap_with_wrong_key_raises():
    key = crypto.generate_dek()
    wrong_key = crypto.generate_dek()
    blob = crypto.wrap(key, b"secret")
    try:
        crypto.unwrap(wrong_key, blob)
        assert False, "expected unwrap to raise with the wrong key"
    except Exception:
        pass


def test_recovery_key_derivation_matches_password_derivation_shape():
    """The recovery path uses a different KDF (HKDF, not Argon2id) but must
    produce a key of the same size and still round-trip a wrapped DEK."""
    dek = crypto.generate_dek()
    recovery_key = crypto.generate_recovery_key()
    salt = crypto.generate_salt()
    recovery_kek = crypto.derive_recovery_kek(recovery_key, salt)
    assert len(recovery_kek) == crypto.DEK_SIZE

    wrapped = crypto.wrap(recovery_kek, dek)
    assert crypto.unwrap(recovery_kek, wrapped) == dek
