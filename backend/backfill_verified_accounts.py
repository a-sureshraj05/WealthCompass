"""
One-time script: sets account_id on is_backend_verified transactions from SnapTrade.
Only changes: account_id column on verified transactions. Nothing else.

Run from project root:
    python3 -m backend.backfill_verified_accounts

Delete after running.
"""
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.getcwd(), ".env"))
load_dotenv(os.path.join(os.getcwd(), ".gemini", ".env"))

from sqlalchemy import inspect, text
from backend.app.db.schema import Base
from backend.app.core.database import engine, SessionLocal

# ── Run pending migrations ────────────────────────────────────────────────────
print("Running schema migrations...")
Base.metadata.create_all(bind=engine)  # creates brokerage_accounts + any new tables

inspector = inspect(engine)
_txn_cols = [c["name"] for c in inspector.get_columns("transactions")]
_hld_cols  = [c["name"] for c in inspector.get_columns("holdings")]
_ug_cols   = [c["name"] for c in inspector.get_columns("unrealized_gains")]
_st_cols   = [c["name"] for c in inspector.get_columns("snaptrade_transactions")]

with engine.connect() as conn:
    if "account_id" not in _txn_cols:
        conn.execute(text("ALTER TABLE transactions ADD COLUMN account_id INTEGER"))
    if "account_id" not in _hld_cols:
        conn.execute(text("ALTER TABLE holdings ADD COLUMN account_id INTEGER"))
    if "account_id" not in _ug_cols:
        conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN account_id INTEGER"))
    if "account_id" not in _st_cols:
        conn.execute(text("ALTER TABLE snaptrade_transactions ADD COLUMN account_id INTEGER"))
    conn.commit()

print("Migrations done.")

# ── Backfill account_id on verified transactions ──────────────────────────────
from backend.app.api.snaptrade import backfill_verified_account_ids
from backend.app.core.process import process_transactions

db = SessionLocal()
try:
    print("Reading SnapTrade accounts and matching verified transactions...")
    updated = backfill_verified_account_ids(db)
    print(f"account_id set on {updated} verified transaction(s).")

    if updated > 0:
        print("Re-processing gains and holdings...")
        process_transactions(db)
        print("Done.")
    else:
        print("Nothing to update — all verified transactions already have account_id set.")
finally:
    db.close()
