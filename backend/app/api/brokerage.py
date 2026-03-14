import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core import process
from backend.app.api import snaptrade

router = APIRouter()

PROVIDER = os.getenv("BROKERAGE_PROVIDER", "snaptrade")


class ConnectRequest(BaseModel):
    brokerage: str


@router.get("/connect-url")
def get_connect_url(brokerage: str, db: Session = Depends(get_db)):
    """Return the URL to open for connecting a brokerage account."""
    if PROVIDER == "snaptrade":
        try:
            url = snaptrade.get_connect_url(brokerage)
            return {"url": url}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=400, detail=f"Unknown provider: {PROVIDER}")


@router.get("/connections")
def get_connections(db: Session = Depends(get_db)):
    """Return list of connected brokerages."""
    if PROVIDER == "snaptrade":
        return snaptrade.get_connections(db)
    raise HTTPException(status_code=400, detail=f"Unknown provider: {PROVIDER}")


@router.delete("/connections/{authorization_id}")
def delete_connection(authorization_id: str, db: Session = Depends(get_db)):
    """Delete a brokerage connection from provider and local DB."""
    if PROVIDER == "snaptrade":
        try:
            snaptrade.delete_connection(authorization_id, db)
            return {"message": "Connection removed."}
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=400, detail=f"Unknown provider: {PROVIDER}")


@router.post("/sync")
def sync(db: Session = Depends(get_db)):
    """Sync latest transactions from all connected brokerages."""
    if PROVIDER == "snaptrade":
        total = snaptrade.sync(db)
        if total > 0:
            process.process_transactions(db)
        return {"message": f"Synced {total} new transactions."}
    raise HTTPException(status_code=400, detail=f"Unknown provider: {PROVIDER}")
