"""Postgres advisory lock replacing prices.py's process-local threading.Lock.

Can't run against the SQLite-backed suite — SQLite has no pg_advisory_lock at
all, and there's no Postgres test infrastructure in CI yet. Skipped unless
DATABASE_URL is explicitly pointed at a real Postgres (e.g. the local Docker
instance already used to verify Phase 3 Slice 1/2's other Postgres work).

What this proves: a session-level pg_advisory_lock held on one connection
blocks a second connection's attempt to acquire the SAME key, and releases on
pg_advisory_unlock — the exact primitive backend/app/api/prices.py relies on.
It does not re-test the price-refresh endpoint itself (that's an integration
concern, covered by the manual two-concurrent-curl check in the plan), just
the locking primitive in isolation.
"""

import os
import threading
import time

import pytest
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL.startswith("postgresql"),
    reason="requires a real Postgres DATABASE_URL (e.g. the local Docker instance)",
)


def test_advisory_lock_blocks_a_second_holder_until_released():
    engine = create_engine(DATABASE_URL)
    lock_key = 999999001  # arbitrary, unlikely to collide with a real user_id

    conn_a = engine.connect()
    conn_b = engine.connect()
    try:
        conn_a.execute(text("SELECT pg_advisory_lock(:k)"), {"k": lock_key})

        acquired_at = {}

        def try_acquire_b():
            conn_b.execute(text("SELECT pg_advisory_lock(:k)"), {"k": lock_key})
            acquired_at["b"] = time.monotonic()

        t = threading.Thread(target=try_acquire_b)
        start = time.monotonic()
        t.start()

        time.sleep(0.3)
        assert "b" not in acquired_at, "B acquired the lock while A still held it"

        conn_a.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": lock_key})
        t.join(timeout=5)

        assert "b" in acquired_at, "B never acquired the lock after A released it"
        assert acquired_at["b"] - start >= 0.3, "B acquired suspiciously fast — did A's lock ever take?"
    finally:
        conn_b.execute(text("SELECT pg_advisory_unlock_all()"))
        conn_a.execute(text("SELECT pg_advisory_unlock_all()"))
        conn_a.close()
        conn_b.close()
        engine.dispose()


def test_advisory_lock_is_keyed_independently():
    """Two different keys never contend — this is what makes the per-user
    design in prices.py an improvement over the old global lock."""
    engine = create_engine(DATABASE_URL)
    conn_a = engine.connect()
    conn_b = engine.connect()
    try:
        conn_a.execute(text("SELECT pg_advisory_lock(:k)"), {"k": 999999002})
        # A different key must acquire immediately, no blocking.
        start = time.monotonic()
        conn_b.execute(text("SELECT pg_advisory_lock(:k)"), {"k": 999999003})
        elapsed = time.monotonic() - start
        assert elapsed < 0.2, "a different lock key should never block on an unrelated one"
    finally:
        conn_a.execute(text("SELECT pg_advisory_unlock_all()"))
        conn_b.execute(text("SELECT pg_advisory_unlock_all()"))
        conn_a.close()
        conn_b.close()
        engine.dispose()
