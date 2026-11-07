"""Add a complete, explicitly fictional ledger to the existing shared demo.

This does not reset an account or seed prices/returns. Only the unmodified public
demo fixture is accepted, and every added transaction has a durable sample label.
"""
from collections import Counter
from datetime import datetime
import re

from backend.app.core.runtime_features import performance_demo_for_user
from backend.app.core.scoping import require_scope
from backend.app.db.schema import (
    ManualRawTransaction, PortfolioPerformanceState, Transaction, User,
)
from backend.scripts.seed_demo import DEMO_CASH, DEMO_EQUITY, DEMO_OPTIONS

PREFIX = "Performance sample · "


def _key(brokerage, day, symbol, action, quantity, amount, asset_type):
    if asset_type == "Options":
        match = re.fullmatch(r"([A-Z]{1,6})\d{6}[CP]\d{8}", symbol)
        if not match:
            raise ValueError("The sample option has an invalid contract identifier.")
        symbol = "OPTION:" + match[1]
    return (brokerage, str(day)[:10], symbol, action,
            round(float(quantity), 8), round(float(amount), 8), asset_type)


def _row_key(row):
    try:
        return _key(row.brokerage, row.date.date() if row.date else None,
                    row.option_symbol or row.ticker, row.action, row.quantity,
                    row.totalCost, row.assetType)
    except (TypeError, ValueError, AttributeError) as error:
        raise ValueError("The account contains a record outside the public demo fixture. No records were changed.") from error


def _base_keys():
    keys = [_key(b, day, "CASH", action, 1, amount, "Cash")
            for b, day, action, amount in DEMO_CASH]
    keys += [_key(b, day, ticker, action, qty, amount, "Equity")
             for b, day, ticker, _, action, qty, amount, _ in DEMO_EQUITY]
    keys += [_key(b, day, root + "261218C00280000", action, qty,
                  qty * premium * 100, "Options")
             for b, day, root, action, qty, premium in DEMO_OPTIONS]
    return Counter(keys)


def complete_demo_ledger(scope, user):
    require_scope(scope)
    if scope.user_id != user.id or not performance_demo_for_user(user) or not user.is_test_user:
        raise PermissionError("Sample completion is restricted to the enabled shared demo account.")
    # Serialize this one-time operation on Postgres. This never locks other users.
    scope.db.query(User).filter(User.id == user.id).with_for_update().one()
    rows = scope.query(Transaction).all()
    original = [row for row in rows if not (row.name or "").startswith(PREFIX)]
    if (any(row.is_deleted or row.is_duplicate for row in rows)
            or Counter(_row_key(row) for row in original) != _base_keys()):
        raise ValueError("The account no longer matches the public demo ledger. No records were changed.")
    option = next(row for row in original if row.assetType == "Options")
    accounts = {row.brokerage: row.account_id for row in original if row.account_id}
    # These are fabricated executions, not claims about historical market closes.
    # The history service independently fetches genuine closes and SPY prices.
    specs = [
        ("Schwab opening funding", "Schwab", "2020-01-02", "CASH", "BUY", 1, 10000, "Cash", None),
        ("Robinhood funding", "Robinhood", "2024-03-01", "CASH", "BUY", 1, 5000, "Cash", None),
        ("VTI opening lot", "Schwab", "2020-01-03", "VTI", "BUY", 10, 1645, "Equity", None),
        ("VTI partial sale", "Schwab", "2025-06-10", "VTI", "SELL", 3, 870, "Equity", None),
        ("VTI recent purchase", "Schwab", "2026-09-15", "VTI", "BUY", 4, 1320, "Equity", None),
        ("AAPL recent purchase", "Robinhood", "2026-10-15", "AAPL", "BUY", 2, 500, "Equity", None),
        # Close the option at its sample purchase cost on the purchase day.
        # No overnight option exposure means no unavailable option closes are needed.
        ("Completed option trade", option.brokerage, option.date.date().isoformat(),
         option.ticker, "SELL", option.quantity, option.totalCost, "Options",
         option.option_symbol or option.ticker),
    ]
    expected = {PREFIX + name: _key(b, day, occ or ticker, action, qty, amount, asset)
                for name, b, day, ticker, action, qty, amount, asset, occ in specs}
    existing = [row for row in rows if (row.name or "").startswith(PREFIX)]
    if (len({row.name for row in existing}) != len(existing)
            or any(row.name not in expected or _row_key(row) != expected[row.name]
                   or not row.is_backend_verified for row in existing)):
        raise ValueError("An existing performance sample was changed. No records were changed.")
    present = {row.name for row in existing}
    for name, brokerage, day, ticker, action, qty, amount, asset, occ in specs:
        label = PREFIX + name
        if label in present:
            continue
        unit_price = amount / qty / (100 if asset == "Options" else 1)
        fields = dict(brokerage=brokerage, date=datetime.fromisoformat(day),
                      ticker=ticker, name=label, action=action, quantity=qty,
                      price=unit_price, costPerShare=unit_price, totalCost=amount,
                      assetType=asset)
        raw = scope.add(ManualRawTransaction(**fields))
        scope.db.flush()
        scope.add(Transaction(**fields, account_id=accounts.get(brokerage),
                              option_symbol=occ, source="manual", raw_id=raw.id,
                              is_backend_verified=True))
    created = len(specs) - len(present)
    state = scope.query(PortfolioPerformanceState).first()
    if state and created:
        # Funding now exists explicitly in the sample ledger, so do not count
        # an earlier manual opening-cash estimate a second time.
        state.opening_cash = None
        state.fingerprint = None
    scope.db.commit()
    return {"createdTransactions": created, "totalTransactions": len(rows) + created,
            "message": "Sample funding, open stock/ETF lots and a completed option trade are recorded. Rebuild performance history to value them."}
