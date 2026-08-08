import os

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api import snaptrade
from backend.app.api.auth import get_current_user
from backend.app.core import process
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.db.schema import BrokerageAccount, User

router = APIRouter()

PROVIDER = os.getenv("BROKERAGE_PROVIDER", "snaptrade")

# SnapTrade is reached with ONE set of credentials (SNAPTRADE_USER_ID /
# SNAPTRADE_USER_SECRET), so every live call returns the same person's accounts
# regardless of who is logged in. Scoping the local tables does not change that
# — the leak would be upstream of the database.
#
# Until credentials are per-user (Stage 3), the honest behaviour is to let only
# the credential owner reach the provider at all, and tell everyone else plainly
# that it is not connected for their account. Fail closed: an unset value means
# nobody, rather than everybody.
_owner = os.getenv("SNAPTRADE_OWNER_USER_ID")
SNAPTRADE_OWNER_USER_ID = int(_owner) if _owner and _owner.isdigit() else None
DEMO_MODE = os.getenv("WC_DEMO_MODE", "").lower() == "true"


class ConnectRequest(BaseModel):
    brokerage: str


class AccountRenameRequest(BaseModel):
    name: str


def require_provider_access(user: User) -> None:
    """Guard every route that talks to SnapTrade.

    Three independent gates, in order of how much they can be trusted. The flag
    is checked first because it is the only one carried by the data itself —
    config can be missing or wrong on a machine nobody thought about.
    """
    if getattr(user, "is_test_user", False):
        raise HTTPException(
            status_code=503,
            detail="This is a test account. Brokerage sync is disabled for it.",
        )
    if PROVIDER != "snaptrade":
        raise HTTPException(status_code=400, detail=f"Unknown provider: {PROVIDER}")
    if DEMO_MODE:
        raise HTTPException(
            status_code=503,
            detail="Brokerage connections are disabled in demo mode.",
        )
    if SNAPTRADE_OWNER_USER_ID is None or user.id != SNAPTRADE_OWNER_USER_ID:
        raise HTTPException(
            status_code=503,
            detail="No brokerage connection is configured for this account.",
        )


@router.get("/connect-url")
def get_connect_url(brokerage: str, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Return the URL to open for connecting a brokerage account."""
    require_provider_access(current_user)
    try:
        return {"url": snaptrade.get_connect_url(brokerage)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/connections")
def get_connections(db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """Return list of connected brokerages for the signed-in user."""
    require_provider_access(current_user)
    return snaptrade.get_connections(UserScope(db, current_user.id))


@router.get("/accounts")
def get_accounts(db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """Return the signed-in user's brokerage accounts from the local table.

    Unlike the routes above this reads only local rows, so it stays available to
    every user — it simply returns nothing for an account with no connections.
    """
    scope = UserScope(db, current_user.id)
    return (scope.query(BrokerageAccount)
            .order_by(BrokerageAccount.brokerage, BrokerageAccount.name)
            .all())


@router.patch("/accounts/{account_id}")
def rename_account(account_id: int, req: AccountRenameRequest,
                   db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Rename a brokerage account. Reflects everywhere without re-processing."""
    scope = UserScope(db, current_user.id)
    # Scoped lookup: another user's account id resolves to 404, not to their row.
    acct = scope.query(BrokerageAccount).filter(BrokerageAccount.id == account_id).first()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")
    acct.name = req.name.strip()
    db.commit()
    return acct


@router.delete("/accounts/{snaptrade_account_id}/ignore")
def ignore_account(snaptrade_account_id: str, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    """Hide an account from WealthCompass (does not affect SnapTrade connection)."""
    require_provider_access(current_user)
    try:
        snaptrade.ignore_account(snaptrade_account_id, UserScope(db, current_user.id))
        return {"message": "Account hidden."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/connections/{authorization_id}")
def delete_connection(authorization_id: str, db: Session = Depends(get_db),
                      current_user: User = Depends(get_current_user)):
    """Delete a brokerage connection from provider and local DB."""
    require_provider_access(current_user)
    try:
        snaptrade.delete_connection(authorization_id, UserScope(db, current_user.id))
        return {"message": "Connection removed."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/backfill-account-ids")
def backfill_account_ids(db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    """One-time: read SnapTrade, set account_id on is_backend_verified transactions, then re-process."""
    require_provider_access(current_user)
    try:
        scope = UserScope(db, current_user.id)
        updated = snaptrade.backfill_verified_account_ids(scope)
        process.process_transactions(db, current_user.id)
        return {"message": f"Updated account_id on {updated} verified transaction(s) and re-processed."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync")
def sync(
    start_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    account_ids: Optional[List[str]] = Query(None, description="Account IDs to sync"),
    tickers: Optional[List[str]] = Query(None, description="Only import transactions for these tickers"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sync transactions from connected brokerages, optionally filtered by date range, account IDs, and tickers."""
    require_provider_access(current_user)
    scope = UserScope(db, current_user.id)
    total = snaptrade.sync(scope, start_date=start_date, end_date=end_date,
                           account_ids=account_ids, tickers=tickers)
    if total > 0:
        process.process_transactions(db, current_user.id)
    return {"message": f"Synced {total} new transactions."}
