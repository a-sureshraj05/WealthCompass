import os

from dotenv import load_dotenv

# Load env vars BEFORE any module that reads them at import time
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".gemini", ".env"))
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))

from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.app.core.database import engine
from backend.app.db.schema import Base

DEMO_MODE = os.getenv("WC_DEMO_MODE", "").lower() == "true"

from .api import manual_import, transactions, brokerage, analyst, auth, lot_assignments, options, splits, prices, preferences, insights
from .api.auth import get_current_user

app = FastAPI()


def _assert_schema_current():
    """Refuse to serve a database whose tables predate this build.

    `create_all()` only creates *missing tables* — it never adds a column to an
    existing one. So a database written before a new column was introduced opens
    without complaint and then fails on the first query that mentions it, which
    surfaces as 500s behind a working login page rather than as a schema problem.

    Checking up front turns that into one legible message. It is deliberately
    generic: it compares every model column against the live table, so a column
    added later is caught without anyone remembering to update this function.
    """
    from sqlalchemy import inspect

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    drift = []
    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing:
            continue  # create_all() just made it — nothing to compare against
        actual = {col["name"] for col in inspector.get_columns(table_name)}
        missing = [c.name for c in table.columns if c.name not in actual]
        if missing:
            drift.append((table_name, missing))

    if not drift:
        return

    detail = "\n".join(f"    {t} is missing: {', '.join(cols)}" for t, cols in drift)
    raise SystemExit(
        "\nREFUSED TO START: this database predates the current schema.\n\n"
        f"  database: {engine.url}\n{detail}\n\n"
        "  Nothing was modified. Choose one:\n\n"
        "    ./server.sh demo        run against db/demo.db instead\n"
        "    git checkout main       run the build this database was written for\n\n"
        "  To migrate this database, run the migration explicitly — it is never\n"
        "  applied as a side effect of starting the server.\n"
    )


@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    # Migration: add is_deleted column to transactions if it doesn't exist
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("transactions")]
    if "is_deleted" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
    if "is_override" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN is_override BOOLEAN NOT NULL DEFAULT 0"))
            conn.commit()
    if "original_values" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN original_values TEXT"))
            conn.commit()
    if "raw_id" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN raw_id INTEGER"))
            conn.commit()
    if "option_symbol" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN option_symbol TEXT"))
            conn.commit()

    # Migration: create lot_assignments table if it doesn't exist
    if "lot_assignments" not in inspector.get_table_names():
        with engine.connect() as conn:
            conn.execute(text(
                "CREATE TABLE lot_assignments ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "sell_transaction_id INTEGER NOT NULL, "
                "buy_transaction_id INTEGER NOT NULL, "
                "quantity REAL NOT NULL)"
            ))
            conn.commit()

    # Migration: create options_retain table if it doesn't exist
    if "options_retain" not in inspector.get_table_names():
        with engine.connect() as conn:
            conn.execute(text(
                "CREATE TABLE options_retain ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "brokerage TEXT NOT NULL, "
                "ticker TEXT NOT NULL, "
                "buy_date DATETIME NOT NULL, "
                "retain_quantity REAL NOT NULL DEFAULT 0, "
                "UNIQUE(brokerage, ticker, buy_date))"
            ))
            conn.commit()

    # Migration: add previousClose to holdings if it doesn't exist
    if "holdings" in inspector.get_table_names():
        holding_columns = [col["name"] for col in inspector.get_columns("holdings")]
        if "previousClose" not in holding_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE holdings ADD COLUMN previousClose REAL DEFAULT 0.0"))
                conn.commit()

    # Migration: add option_symbol to snaptrade_transactions if it doesn't exist
    if "snaptrade_transactions" in inspector.get_table_names():
        st_columns = [col["name"] for col in inspector.get_columns("snaptrade_transactions")]
        if "option_symbol" not in st_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE snaptrade_transactions ADD COLUMN option_symbol TEXT"))
                conn.commit()

    # Migration: wash sale columns on realized_gains
    if "realized_gains" in inspector.get_table_names():
        rg_columns = [col["name"] for col in inspector.get_columns("realized_gains")]
        if "is_wash_sale" not in rg_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE realized_gains ADD COLUMN is_wash_sale BOOLEAN NOT NULL DEFAULT 0"))
                conn.commit()
        if "wash_sale_disallowed_amount" not in rg_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE realized_gains ADD COLUMN wash_sale_disallowed_amount REAL NOT NULL DEFAULT 0"))
                conn.commit()

    # Migration: wash sale columns on unrealized_gains
    if "unrealized_gains" in inspector.get_table_names():
        ug_columns = [col["name"] for col in inspector.get_columns("unrealized_gains")]
        if "wash_sale_adjustment" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN wash_sale_adjustment REAL NOT NULL DEFAULT 0"))
                conn.commit()
        if "wash_sale_clear_date" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN wash_sale_clear_date DATE"))
                conn.commit()
        if "wash_sale_at_risk" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN wash_sale_at_risk BOOLEAN NOT NULL DEFAULT 0"))
                conn.commit()
        if "wash_sale_risk_trigger_date" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN wash_sale_risk_trigger_date DATE"))
                conn.commit()

    # Migration: account_id column linking to brokerage_accounts reference table
    if "account_id" not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN account_id INTEGER"))
            conn.commit()
    if "holdings" in inspector.get_table_names():
        holding_columns = [col["name"] for col in inspector.get_columns("holdings")]
        if "account_id" not in holding_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE holdings ADD COLUMN account_id INTEGER"))
                conn.commit()
    if "unrealized_gains" in inspector.get_table_names():
        ug_columns = [col["name"] for col in inspector.get_columns("unrealized_gains")]
        if "account_id" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN account_id INTEGER"))
                conn.commit()
    if "snaptrade_transactions" in inspector.get_table_names():
        st_columns = [col["name"] for col in inspector.get_columns("snaptrade_transactions")]
        if "account_id" not in st_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE snaptrade_transactions ADD COLUMN account_id INTEGER"))
                conn.commit()

    if "unrealized_gains" in inspector.get_table_names():
        ug_columns = [col["name"] for col in inspector.get_columns("unrealized_gains")]
        if "option_symbol" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN option_symbol TEXT"))
                conn.commit()
        if "prevClose" not in ug_columns:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE unrealized_gains ADD COLUMN prevClose REAL"))
                conn.commit()

    # Migration: buying_power_json and analyst_json columns on portfolio_summary
    if "portfolio_summary" in inspector.get_table_names():
        ps_cols = [col["name"] for col in inspector.get_columns("portfolio_summary")]
        if "buying_power_json" not in ps_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE portfolio_summary ADD COLUMN buying_power_json TEXT"))
                conn.commit()
        if "analyst_json" not in ps_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE portfolio_summary ADD COLUMN analyst_json TEXT"))
                conn.commit()
        if "ui_prefs_json" not in ps_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE portfolio_summary ADD COLUMN ui_prefs_json TEXT"))
                conn.commit()
        if "insights_json" not in ps_cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE portfolio_summary ADD COLUMN insights_json TEXT"))
                conn.commit()

    # portfolio_summary is no longer a singleton pinned at id=1 — it is one row
    # per user, created by process_transactions() the first time that user's
    # data is processed. Bootstrapping a row here would have to invent a
    # user_id, and inventing one is exactly the fail-open write the NOT NULL
    # constraint exists to prevent.

    # Seed stock_splits with well-known historical splits (safe to run every startup — skips duplicates)
    from backend.app.core.stock_split_seeds import SEED_SPLITS
    from backend.app.db.schema import StockSplit
    from backend.app.core.database import SessionLocal
    _seed_db = SessionLocal()
    try:
        for s in SEED_SPLITS:
            exists = _seed_db.query(StockSplit).filter_by(ticker=s["ticker"], split_date=s["split_date"]).first()
            if not exists:
                _seed_db.add(StockSplit(**s))
        _seed_db.commit()
    finally:
        _seed_db.close()

    # Last: the legacy ALTER blocks above are allowed to bring an older SQLite
    # file up to date first, so this only fires on drift they do not cover.
    _assert_schema_current()

    # Demo instance only — both are no-ops unless WC_DEMO_MODE=true.
    from backend.app.core.demo_reset import seed_if_empty, start_reset_loop

    seed_if_empty()
    start_reset_loop()


app.include_router(auth.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(manual_import.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(brokerage.router, prefix="/api/v1/brokerage", dependencies=[Depends(get_current_user)])
app.include_router(analyst.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(lot_assignments.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(options.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(splits.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(prices.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(preferences.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(insights.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])


@app.get("/healthz")
def healthz():
    """Liveness for the platform health check.

    Deliberately touches the database. A health check that only proves the
    process is accepting sockets reports green while every real request 500s on
    a broken connection, which is the failure mode worth catching.
    """
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}")
    return {"status": "ok", "demo": DEMO_MODE}


# ── Static SPA ────────────────────────────────────────────────────────────
# Registered LAST, after every router, because the catch-all below matches any
# path — mounted earlier it would swallow /api/v1/*.
#
# Only wired up when a build exists. Locally there is no frontend/dist: Vite
# serves the app on :5173 and proxies the API here, so the mount must not be a
# hard requirement or `./server.sh start` would break.
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if _DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # The app has no client-side router, so every non-API path resolves to
        # the same document. Real files under /assets are already handled above.
        candidate = _DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")

else:
    @app.get("/")
    def read_root():
        return {"Hello": "World", "spa": "not built — run `npm run build` in frontend/"}
