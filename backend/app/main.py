import os

from dotenv import load_dotenv

# Load env vars BEFORE any module that reads them at import time
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".gemini", ".env"))
load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))

from fastapi import FastAPI

from backend.app.core.database import engine
from backend.app.db.schema import Base

from .api import manual_import, transactions, brokerage, analyst

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


app.include_router(transactions.router, prefix="/api/v1")
app.include_router(manual_import.router, prefix="/api/v1")
app.include_router(brokerage.router, prefix="/api/v1/brokerage")
app.include_router(analyst.router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"Hello": "World"}
