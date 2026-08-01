import os

from dotenv import load_dotenv

# Load env vars BEFORE any module that reads them at import time
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".gemini", ".env"))
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))

from fastapi import FastAPI, Depends

from backend.app.core.database import engine
from backend.app.db.schema import Base

from .api import manual_import, transactions, brokerage, analyst, auth, lot_assignments, options, splits, prices
from .api.auth import get_current_user

app = FastAPI()


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

    # Bootstrap portfolio_summary if empty (first run after adding the table)
    from backend.app.core.database import SessionLocal
    from backend.app.db.schema import PortfolioSummary, Transaction as _DBTxn
    _sum_db = SessionLocal()
    try:
        if not _sum_db.query(PortfolioSummary).first():
            cash_txns = _sum_db.query(_DBTxn).filter(_DBTxn.assetType == "Cash", _DBTxn.is_deleted == False).all()
            balance = sum(t.totalCost if t.action.upper() == "BUY" else -t.totalCost for t in cash_txns)
            _sum_db.add(PortfolioSummary(id=1, cash_balance=round(balance, 2)))
            _sum_db.commit()
    finally:
        _sum_db.close()

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


app.include_router(auth.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(manual_import.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(brokerage.router, prefix="/api/v1/brokerage", dependencies=[Depends(get_current_user)])
app.include_router(analyst.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(lot_assignments.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(options.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(splits.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])
app.include_router(prices.router, prefix="/api/v1", dependencies=[Depends(get_current_user)])


@app.get("/")
def read_root():
    return {"Hello": "World"}
