"""One-time "turn on encryption for this user" migration.

Used from two call sites:

1. `auth.login()` — lazily, the first time a legacy (pre-Phase-2) account logs
   in, since such a row has `wrapped_dek is None` and its ledger tables hold
   plaintext written before any of this existed.
2. Phase 3's real-data migration script, after the owner's local database has
   been copied (never the live file) and had `user_id` backfilled.

The key insight (from reading `process.py` and the four loaders): `holdings`,
`realized_gains`, `unrealized_gains`, and `ticker_references` are never
hand-edited — `process_transactions()` always rebuilds them from scratch by
delete-then-insert from the ledger tables. So this function only has to
re-encrypt the *source-of-truth* tables directly (via raw SQL, since at the
moment of migration those columns are still plaintext and the ORM's
TypeDecorator would try to decrypt them as if they were already ciphertext),
then let the existing pipeline regenerate everything else through the
now-encrypting ORM layer.
"""

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.core import crypto, process
from backend.app.db.schema import User


def enable_encryption_for_user(db: Session, user: User, dek: bytes) -> None:
    """Re-encrypt `user`'s plaintext ledger rows in place, then rebuild
    everything derived from them. Idempotent is NOT guaranteed if called
    twice on already-encrypted rows — callers must only call this once, when
    `user.wrapped_dek` was `None` going in.
    """
    token = crypto.CURRENT_DEK.set(dek)
    try:
        _reencrypt_ledger_tables(db, user.id, dek)
        process.process_transactions(db, user.id)
    finally:
        crypto.CURRENT_DEK.reset(token)


def _reencrypt_ledger_tables(db: Session, user_id: int, dek: bytes) -> None:
    conn = db.connection()

    for table, columns in (
        ("transactions", ("quantity", "price", "costPerShare", "totalCost")),
        ("manual_raw_transactions", ("quantity", "price", "costPerShare", "totalCost")),
        ("snaptrade_transactions", ("quantity", "price", "amount")),
    ):
        rows = conn.execute(
            text(f"SELECT id, {', '.join(columns)} FROM {table} WHERE user_id = :uid"),
            {"uid": user_id},
        ).fetchall()
        for row in rows:
            row_id = row[0]
            updates = {
                col: crypto.wrap(dek, str(float(value)).encode("utf-8"))
                for col, value in zip(columns, row[1:])
                if value is not None
            }
            if not updates:
                continue
            set_clause = ", ".join(f"{col} = :{col}" for col in updates)
            conn.execute(
                text(f"UPDATE {table} SET {set_clause} WHERE id = :id"),
                {**updates, "id": row_id},
            )

    # brokerage_accounts.name — a string column, not a float.
    accounts = conn.execute(
        text("SELECT id, name FROM brokerage_accounts WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchall()
    for row in accounts:
        if row[1] is None:
            continue
        conn.execute(
            text("UPDATE brokerage_accounts SET name = :name WHERE id = :id"),
            {"name": crypto.wrap(dek, str(row[1]).encode("utf-8")), "id": row[0]},
        )

    # portfolio_summary.cash_balance / buying_power_json — rebuilt wholesale by
    # process_transactions() below for cash_balance, but buying_power_json is a
    # cache populated by a separate sync call, not by the recompute pipeline,
    # so it needs re-encrypting here or it is simply lost (left as stale
    # plaintext that would fail to decrypt).
    summary = conn.execute(
        text("SELECT id, buying_power_json FROM portfolio_summary WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if summary and summary[1] is not None:
        conn.execute(
            text("UPDATE portfolio_summary SET buying_power_json = :bp WHERE id = :id"),
            {"bp": crypto.wrap(dek, summary[1].encode("utf-8")), "id": summary[0]},
        )

    db.commit()
