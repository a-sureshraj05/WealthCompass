import os
from typing import Optional, Set

import yaml
from sqlalchemy.orm import Session

from backend.app.core.scoping import UserScope
from backend.app.core.table_loader.holding_loader import load as holding_load
from backend.app.core.table_loader.realized_gain_loader import load as realized_gain_load
from backend.app.core.table_loader.unrealized_gain_loader import load as unrealized_gain_load
from backend.app.db.schema import PortfolioSummary, Transaction as DBTransaction

_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "config", "tickers.yml",
)


def _load_tracked_tickers() -> Optional[Set[str]]:
    """Return the set of tickers from config/tickers.yml, or None if file missing.

    Ignored in demo mode. The allowlist is a personal filter listing one
    person's holdings; applied to seeded demo data it silently drops every
    position that is not on it, leaving a portfolio with missing rows and no
    indication why. The cloud image ships without the file at all — this makes
    a local `./server.sh demo` behave the same way.
    """
    if os.getenv("WC_DEMO_MODE", "").lower() == "true":
        return None
    if not os.path.exists(_CONFIG_PATH):
        return None
    with open(_CONFIG_PATH) as f:
        data = yaml.safe_load(f)
    tickers = data.get("tickers") if data else None
    return set(tickers) if tickers else None


def process_transactions(db: Session, user_id: int, brokerage_name: str = None):
    """Rebuild one user's derived tables from their ledger.

    `user_id` is required and positional. Every loader below clears a table
    before repopulating it, so an unscoped run would delete other users' gains
    and holdings — UserScope refuses to construct without a user rather than
    leaving that to a filter someone might forget.
    """
    scope = UserScope(db, user_id)
    print(f"Processing transactions for user {user_id}, "
          f"brokerage: {brokerage_name if brokerage_name else 'All'}...")

    tracked_tickers = _load_tracked_tickers()
    if tracked_tickers:
        print(f"  Ticker filter active: {sorted(tracked_tickers)}")

    open_lots = realized_gain_load(scope, brokerage_name, tracked_tickers=tracked_tickers)
    prev_close_cache = unrealized_gain_load(scope, open_lots, brokerage_name)
    holding_load(scope, brokerage_name, prev_close_cache)

    # Recompute cash balance only on full reprocess (not per-brokerage partial runs)
    if not brokerage_name:
        cash_txns = scope.query(DBTransaction).filter(
            DBTransaction.assetType == "Cash",
            DBTransaction.is_deleted == False,
        ).all()
        balance = sum(
            t.totalCost if t.action.upper() == "BUY" else -t.totalCost
            for t in cash_txns
        )
        summary = scope.query(PortfolioSummary).first()
        if summary:
            summary.cash_balance = round(balance, 2)
        else:
            scope.add(PortfolioSummary(cash_balance=round(balance, 2)))
        db.commit()

    print(f"Finished processing for user {user_id}, "
          f"brokerage: {brokerage_name if brokerage_name else 'All'}.")
