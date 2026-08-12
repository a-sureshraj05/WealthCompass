"""Seed a demo database with two users and fabricated portfolios.

Rows are written through UserScope and then handed to the real
`process_transactions()` pipeline, so holdings, tax lots, and gains are produced
by the app rather than hand-built. Anything the pipeline cannot derive from
these rows is a bug worth finding, which is the point of seeding this way.

SAFETY — this truncates every data table. It refuses to run unless all three
hold, so it cannot be pointed at the real database by accident:

  1. WC_DEMO_MODE=true
  2. the target URL is not the live database filename
  3. --yes is passed

Usage:
    WC_DEMO_MODE=true DATABASE_URL=sqlite:///./db/demo.db \
        python3 -m backend.scripts.seed_demo --yes

Between them the two portfolios exercise: two brokerages, an ACATS transfer, a
pre-split lot, options and equity on the same underlying, long-term and
short-term lots of the same stock, a dividend reinvestment, realized gains of
both tax characters, and a positive non-round cash balance. All values invented.
"""

import argparse
import os
import sys
from datetime import datetime

# Addresses rather than bare usernames: the login form is type="email",
# so the browser rejects anything without an @ before the request is sent.
DEMO_EMAIL = "demouser@gmail.com"
TEST_EMAIL = "testuser@gmail.com"
DEMO_PASSWORD = "welcome"

# --- demouser: the full-coverage portfolio -----------------------------------
# Quantities are deliberately small so the total stays far below $25,000 even if
# live prices run well above where they sat when this was written.

DEMO_CASH = [
    # (brokerage, date, action, amount)   BUY = deposit, SELL = withdrawal
    ("Robinhood", "2024-03-01", "BUY", 5000.00),
    ("Schwab", "2025-01-10", "BUY", 3500.00),
    ("Robinhood", "2025-06-20", "SELL", 4300.00),
    ("Robinhood", "2026-02-05", "BUY", 1200.00),
    ("Schwab", "2026-05-28", "SELL", 2865.33),
    # 9,700.00 - 7,165.33 = 2,534.67
]

# (brokerage, date, ticker, name, action, qty, total, current_brokerage)
DEMO_EQUITY = [
    # AAPL — long-term lot, short-term lot, and a partial sale between them.
    # FIFO takes the 2024 lot, so the realized gain is long-term.
    ("Robinhood", "2024-03-12", "AAPL", "Apple Inc.", "BUY", 6, 1070.52, None),
    ("Robinhood", "2026-02-18", "AAPL", "Apple Inc.", "BUY", 4, 907.40, None),
    ("Robinhood", "2026-05-06", "AAPL", "Apple Inc.", "SELL", 3, 723.90, None),

    # NVDA — bought before the 10:1 split of 2024-06-10, so the pipeline
    # split-adjusts 2 shares at 902.15 into 20 shares at ~90.22.
    ("Schwab", "2024-04-08", "NVDA", "NVIDIA Corporation", "BUY", 2, 1804.30, None),

    # MSFT — bought at Schwab, moved to Robinhood by ACATS. current_brokerage
    # carries the lot to the destination while preserving the original basis.
    ("Schwab", "2024-09-17", "MSFT", "Microsoft Corporation", "BUY", 4, 1610.64, "Robinhood"),

    # KO — a slower name, plus a dividend reinvestment (REI counts as a buy).
    ("Robinhood", "2025-01-14", "KO", "Coca-Cola Company", "BUY", 25, 1531.00, None),
    ("Robinhood", "2026-04-02", "KO", "Coca-Cola Company", "REI", 0.4127, 27.57, None),

    # TSLA — recent buy and a partial sale, giving a short-term realized gain.
    ("Robinhood", "2026-01-22", "TSLA", "Tesla Inc.", "BUY", 5, 1342.00, None),
    ("Robinhood", "2026-06-30", "TSLA", "Tesla Inc.", "SELL", 2, 604.30, None),

    # AMD — the position the demo import CSV backfills. Its date is the start of
    # "API coverage"; the CSV rows are older, which is the condition
    # manual_import requires before a CSV row may enter the ledger.
    ("Schwab", "2026-03-02", "AMD", "Advanced Micro Devices", "BUY", 8, 1218.40, None),
]

# Options are priced per underlying share; the loaders apply the 100x multiplier.
# (brokerage, date, underlying, action, contracts, premium_per_share)
DEMO_OPTIONS = [
    ("Robinhood", "2026-06-24", "AAPL", "BUY", 1, 7.42),
]

# Everything above is seeded as SnapTrade-sourced rather than manual, for two
# reasons. It matches how the app is designed to be used — the API owns recent
# history and a CSV backfills what came before it — and it means importing a
# statement *adds* to the demo instead of destroying it: manual_import clears
# existing manual rows for the brokerage it is given, which would otherwise wipe
# the split lot and the transfer the demo exists to show.

# --- testuser: a small throwaway portfolio, visibly different -----------------

TEST_CASH = [
    ("Fidelity", "2025-08-04", "BUY", 800.00),
    ("Fidelity", "2026-03-19", "SELL", 382.75),
    # 417.25
]

TEST_EQUITY = [
    ("Fidelity", "2025-09-08", "VTI", "Vanguard Total Stock Market ETF", "BUY", 3, 868.65, None),
    ("Fidelity", "2026-01-30", "JNJ", "Johnson & Johnson", "BUY", 6, 949.20, None),
    ("Fidelity", "2026-07-02", "JNJ", "Johnson & Johnson", "SELL", 2, 332.80, None),
]


def _d(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%d")


def _guard(engine, assume_yes: bool) -> None:
    """Fail closed. A destructive script that *cannot* reach the live database
    is worth more than one that merely doesn't."""
    url = str(engine.url)

    if os.getenv("WC_DEMO_MODE", "").lower() != "true":
        sys.exit(f"REFUSED: WC_DEMO_MODE=true is required.\n         target was: {url}")

    if "wealthcompass.db" in url:
        sys.exit("REFUSED: that is the live database.\n"
                 f"         {url}\n"
                 "         Point DATABASE_URL elsewhere, e.g. sqlite:///./db/demo.db")

    if not assume_yes:
        sys.exit(f"REFUSED: pass --yes to confirm truncation.\n         target was: {url}")

    print(f"[seed] target: {url}")


def _pick_option_symbol(underlying: str, fallback: str) -> str:
    """Choose a currently-listed OCC contract so the demo option actually prices.

    A strike hardcoded today may not exist by the time this runs, and the
    unrealized loader drops lots it cannot price — the option would silently
    vanish from the demo.
    """
    try:
        import yfinance as yf

        tk = yf.Ticker(underlying)
        spot = float(tk.fast_info["last_price"])
        expiries = list(tk.options or [])
        if not spot or not expiries:
            return fallback

        today = datetime.now().date()
        target = next(
            (e for e in expiries
             if (datetime.strptime(e, "%Y-%m-%d").date() - today).days >= 90),
            expiries[-1],
        )
        strikes = tk.option_chain(target).calls["strike"].tolist()
        strike = min(strikes, key=lambda s: abs(s - spot * 1.10))  # slightly OTM

        yy, mm, dd = target.split("-")
        occ = f"{underlying}{yy[2:]}{mm}{dd}C{int(round(strike * 1000)):08d}"
        print(f"[seed] option: {occ}  (spot ~{spot:.2f}, strike {strike})")
        return occ
    except Exception as exc:
        print(f"[seed] option lookup failed ({exc}); using {fallback}")
        return fallback


def seed(assume_yes: bool = False) -> None:
    """Truncate and re-seed the demo database.

    Split out of `main()` so the hosted instance can call it directly for the
    periodic reset (see backend/app/core/demo_reset.py) instead of shelling out.
    The guards in `_guard` run identically on both paths — the in-process caller
    gets no exemption from them, which is the whole point of them being here.
    """
    from backend.app.api.auth import hash_password
    from backend.app.core import process
    from backend.app.core.database import SessionLocal, engine
    from backend.app.core.scoping import UserScope
    from backend.app.db.schema import (Base, BrokerageAccount, Holding,
                                       LotAssignment, ManualRawTransaction,
                                       OptionsRetain, PortfolioSummary,
                                       RealizedGain, SnaptradeConnection,
                                       SnaptradeIgnoredAccount, SnaptradeTransaction,
                                       StockSplit, TickerReference, Transaction,
                                       TransactionSplitConfig, UnrealizedGain, User)
    from backend.app.core.stock_split_seeds import SEED_SPLITS

    _guard(engine, assume_yes)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        for model in (Holding, RealizedGain, UnrealizedGain, TickerReference,
                      LotAssignment, TransactionSplitConfig, OptionsRetain,
                      Transaction, ManualRawTransaction, SnaptradeTransaction,
                      SnaptradeConnection, SnaptradeIgnoredAccount,
                      BrokerageAccount, PortfolioSummary, User):
            db.query(model).delete()
        db.commit()
        print("[seed] cleared existing rows")

        # Both are fixtures: is_test_user blocks brokerage sync for them even if
        # this database is later started without WC_DEMO_MODE.
        demo = User(email=DEMO_EMAIL, hashed_password=hash_password(DEMO_PASSWORD),
                    is_test_user=True)
        test = User(email=TEST_EMAIL, hashed_password=hash_password(DEMO_PASSWORD),
                    is_test_user=True)
        db.add_all([demo, test])
        db.flush()

        # Splits are global reference data — seeded once, shared by both users.
        for s in SEED_SPLITS:
            if not db.query(StockSplit).filter_by(ticker=s["ticker"],
                                                  split_date=s["split_date"]).first():
                db.add(StockSplit(**s))
        db.commit()

        def seed_user(user, brokerages, cash, equity, options=()):
            scope = UserScope(db, user.id)

            accounts = {}
            for brokerage, name in brokerages:
                acct = BrokerageAccount(
                    snaptrade_account_id=f"demo-{user.id}-{brokerage.lower()}",
                    brokerage=brokerage, name=name)
                scope.add(acct)
                db.flush()
                accounts[brokerage] = acct.id

            def add(brokerage, date, ticker, name, action, qty, total, asset_type,
                    current_brokerage=None, option_symbol=None, price=None):
                """Raw SnapTrade row + ledger row, as a sync would produce."""
                per_unit = price if price is not None else (total / qty if qty else 0.0)
                raw = SnaptradeTransaction(
                    authorization_id=f"demo-auth-{user.id}", brokerage=brokerage,
                    account_id=accounts.get(brokerage), date=date, ticker=ticker,
                    name=name, action=action, quantity=qty, price=per_unit,
                    amount=total, currency="USD", assetType=asset_type,
                    option_symbol=option_symbol,
                    snaptrade_transaction_id=f"demo-{user.id}-{ticker}-{date:%Y%m%d}-{action}-{qty}")
                scope.add(raw)
                db.flush()
                scope.add(Transaction(
                    brokerage=brokerage, account_id=accounts.get(brokerage), date=date,
                    ticker=ticker, name=name, action=action, quantity=qty,
                    price=per_unit, costPerShare=per_unit, totalCost=total,
                    assetType=asset_type, source="snaptrade", raw_id=raw.id,
                    current_brokerage=current_brokerage, option_symbol=option_symbol))

            for brokerage, date, action, amount in cash:
                add(brokerage, _d(date), "CASH", "Cash", action, 1, amount, "Cash")

            for brokerage, date, ticker, name, action, qty, total, cur_b in equity:
                add(brokerage, _d(date), ticker, name, action, qty, total, "Equity",
                    current_brokerage=cur_b)

            # ticker holds the OCC symbol (underlying_ticker() parses it back
            # out); price is per underlying share, totalCost the premium paid.
            for brokerage, date, underlying, action, contracts, premium in options:
                occ = _pick_option_symbol(underlying, "AAPL261218C00280000")
                add(brokerage, _d(date), occ, f"{underlying} Call", action, contracts,
                    premium * 100 * contracts, "Options", option_symbol=occ, price=premium)

            db.commit()

        seed_user(demo,
                  [("Robinhood", "Individual"), ("Schwab", "Brokerage")],
                  DEMO_CASH, DEMO_EQUITY, DEMO_OPTIONS)
        seed_user(test, [("Fidelity", "Roth IRA")], TEST_CASH, TEST_EQUITY)

        # config/tickers.yml is a local allowlist that would filter the demo set.
        # Neutralised for this process only, rather than editing the file.
        process._load_tracked_tickers = lambda: None
        for user in (demo, test):
            process.process_transactions(db, user.id)

        # --- report ---------------------------------------------------------
        print()
        for user in (demo, test):
            scope = UserScope(db, user.id)
            holdings = scope.query(Holding).all()
            mv = sum(h.marketValue or 0 for h in holdings)
            summary = scope.query(PortfolioSummary).first()
            cash = summary.cash_balance if summary else 0.0

            print("=" * 70)
            print(f"{user.email}  (user_id={user.id})   password: {DEMO_PASSWORD}")
            print("-" * 70)
            print(f"{'POSITION':<24}{'BROKER':<13}{'QTY':>10}{'VALUE':>15}")
            for h in sorted(holdings, key=lambda x: -(x.marketValue or 0)):
                print(f"{h.ticker:<24}{h.brokerage:<13}{h.quantity:>10.4f}{h.marketValue or 0:>15,.2f}")
            print("-" * 70)
            print(f"{'Market value':<47}{mv:>23,.2f}")
            print(f"{'Cash':<47}{cash:>23,.2f}")
            print(f"{'TOTAL':<47}{mv + cash:>23,.2f}")
            print(f"realized gains: {scope.query(RealizedGain).count()}   "
                  f"open lots: {scope.query(UnrealizedGain).count()}   "
                  f"ledger rows: {scope.query(Transaction).count()}")
            if mv + cash > 25000:
                print("!! over $25,000 — trim quantities in DEMO_EQUITY")
            print()
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed the demo database.")
    ap.add_argument("--yes", action="store_true", help="confirm truncation")
    args = ap.parse_args()
    seed(assume_yes=args.yes)


if __name__ == "__main__":
    main()
