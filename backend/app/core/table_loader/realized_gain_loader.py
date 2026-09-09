import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from sqlalchemy.orm import Session
from backend.app.db.schema import LotAssignment, RealizedGain, Transaction as DBTransaction
from backend.app.core.utils.ticker import underlying_ticker
from backend.app.core.transaction_actions import BUY_ACTIONS, SELL_ACTIONS, OPTION_EXPIRY_ACTIONS, OPTION_EXERCISE_ACTIONS, TRANSFER_OUT_ACTIONS
from backend.app.core.scoping import UserScope
from backend.app.core.stock_split_utils import build_split_map, apply_splits_to_lot


def is_long_term_holding(buy_date, sell_date, is_short_position: bool) -> bool:
    """Long-term capital gain eligibility.

    Equities and *long* (bought-to-open) options qualify as long-term when held
    more than 365 days. *Short* (sold-to-open / written) options are always
    short-term regardless of holding period, per IRS rules. `is_short_position`
    is only ever True for written options; it is False for all equity lots.
    """
    if is_short_position:
        return False
    return (sell_date - buy_date).days > 365


def delete(scope: UserScope, brokerage_name: str = None):
    # Scoped delete — unscoped, this clears every user's realized gains.
    scope.delete_all(RealizedGain, brokerage=brokerage_name)
    scope.db.commit()


def load(scope: UserScope, brokerage_name: str = None, tracked_tickers: Optional[Set[str]] = None) -> Dict[str, List[Dict[str, Any]]]:
    db = scope.db
    delete(scope, brokerage_name)

    # Fetch all active transactions — exclude soft-deleted and flagged duplicates
    q = scope.query(DBTransaction).filter(
        DBTransaction.is_deleted == False,
        DBTransaction.is_duplicate == False,
    )
    if brokerage_name:
        q = q.filter(DBTransaction.brokerage == brokerage_name)
    if tracked_tickers:
        q = q.filter(DBTransaction.ticker.in_(tracked_tickers))
    transactions = q.order_by(DBTransaction.date).all()

    # Load explicit lot assignments: sell_transaction_id → [LotAssignment]
    sell_ids = [t.id for t in transactions if t.action.upper() in SELL_ACTIONS]
    all_assignments: Dict[int, List[LotAssignment]] = {}
    if sell_ids:
        for a in scope.query(LotAssignment).filter(LotAssignment.sell_transaction_id.in_(sell_ids)).all():
            all_assignments.setdefault(a.sell_transaction_id, []).append(a)

    realized_gains_list = []
    open_lots_by_ticker: Dict[str, List[Dict[str, Any]]] = {}

    # Pre-fetch split data for all equity tickers (options are not split-adjusted)
    equity_tickers = list({t.ticker for t in transactions if not getattr(t, "option_symbol", None)})
    split_map = build_split_map(db, equity_tickers)

    # Group by (effective_brokerage, ticker, option_symbol).
    # current_brokerage overrides brokerage when set — this is how transferred lots
    # follow the shares to the destination brokerage while preserving original cost basis.
    ticker_groups: Dict[tuple, List[DBTransaction]] = {}
    for t in transactions:
        effective_brokerage = t.current_brokerage or t.brokerage
        key = (effective_brokerage, t.ticker, getattr(t, "option_symbol", None) or "")
        ticker_groups.setdefault(key, []).append(t)

    # Pre-pass: compute premium-per-share adjustments from exercised options.
    # When an option is exercised, the premium paid becomes part of the equity cost basis.
    # Key: (brokerage, underlying_ticker, exercise_date)
    # Value: {per_share: float, shares_remaining: float}
    # shares_remaining lets us FIFO-consume only the exercise-acquired shares —
    # open-market buys on the same day are left unadjusted once the exercise qty is exhausted.
    exercise_cost_adjustments: Dict[tuple, Dict[str, float]] = {}
    for (brokerage, ticker, option_symbol), ticker_transactions in ticker_groups.items():
        if not option_symbol:
            continue  # equity groups handled in main pass
        temp_queue: List[Dict[str, Any]] = []
        for t in sorted(ticker_transactions, key=lambda x: (x.date, x.id)):
            if t.action.upper() in BUY_ACTIONS:
                cpu = (t.totalCost / t.quantity) if t.quantity else t.price
                temp_queue.append({"quantity": t.quantity, "cost_per_unit": cpu})
            elif t.action.upper() in SELL_ACTIONS:
                rem = t.quantity
                while rem > 0 and temp_queue:
                    lot = temp_queue[0]
                    q = min(rem, lot["quantity"])
                    lot["quantity"] -= q
                    rem -= q
                    if lot["quantity"] <= 0:
                        temp_queue.pop(0)
            elif t.action.upper() in OPTION_EXPIRY_ACTIONS:
                # All lots expire worthless — drain the temp queue (no cost adjustment)
                temp_queue.clear()
            elif t.action.upper() in OPTION_EXERCISE_ACTIONS:
                rem = t.quantity
                premium = 0.0
                while rem > 0 and temp_queue:
                    lot = temp_queue[0]
                    q = min(rem, lot["quantity"])
                    premium += q * lot["cost_per_unit"]
                    lot["quantity"] -= q
                    rem -= q
                    if lot["quantity"] <= 0:
                        temp_queue.pop(0)
                if t.quantity > 0 and premium > 0:
                    underlying = underlying_ticker(option_symbol)
                    key = (brokerage, underlying, t.date.date())
                    exercise_shares = t.quantity * 100  # 1 contract = 100 shares
                    per_share = premium / exercise_shares
                    if key in exercise_cost_adjustments:
                        # Multiple exercises on same day — merge into weighted average
                        existing = exercise_cost_adjustments[key]
                        total_premium = existing["per_share"] * existing["shares_remaining"] + premium
                        total_shares = existing["shares_remaining"] + exercise_shares
                        exercise_cost_adjustments[key] = {
                            "per_share": total_premium / total_shares,
                            "shares_remaining": total_shares,
                        }
                    else:
                        exercise_cost_adjustments[key] = {
                            "per_share": per_share,
                            "shares_remaining": exercise_shares,
                        }

    for (brokerage, ticker, option_symbol), ticker_transactions in ticker_groups.items():
        # Skip Cash asset types
        if ticker_transactions and ticker_transactions[0].assetType == "Cash":
            continue

        sorted_transactions = sorted(ticker_transactions, key=lambda x: (x.date, x.id))

        # An option position is "short" (written) if the opening transaction for the
        # contract is a sell-to-open. Short options are always short-term for tax
        # purposes; long (bought-to-open) options follow the >365-day rule. Equities
        # are never short here.
        is_short_position = bool(option_symbol) and sorted_transactions[0].action.upper() in SELL_ACTIONS

        # Each lot tracks its transaction_id so explicit assignments can find it
        buy_lots_queue: List[Dict[str, Any]] = []

        def _record_gain(lot, sell_txn, qty, adj_sell_cpu=None, adj_sell_price=None):
            is_long_term = is_long_term_holding(
                lot["date"], sell_txn.date, lot.get("is_short_position", False)
            )
            # Use cost_per_unit derived from the source totalCost — this already reflects
            # the options multiplier (100 shares/contract) as reported by the brokerage.
            buy_cost_per_unit = lot["cost_per_unit"]
            sell_cost_per_unit = adj_sell_cpu if adj_sell_cpu is not None else (
                sell_txn.totalCost / sell_txn.quantity if sell_txn.quantity else sell_txn.price
            )
            display_sell_price = adj_sell_price if adj_sell_price is not None else sell_txn.price
            realized_gains_list.append(RealizedGain(
                brokerage=sell_txn.brokerage,
                ticker=underlying_ticker(ticker),
                buyDate=lot["date"],
                sellDate=sell_txn.date,
                quantity=qty,
                buyPrice=lot["price"],
                sellPrice=display_sell_price,
                gain=qty * (sell_cost_per_unit - buy_cost_per_unit),
                isLongTerm=is_long_term,
                assetType=lot.get("assetType"),
            ))

        for t in sorted_transactions:
            if t.action.upper() in BUY_ACTIONS:
                # cost_per_unit = actual dollars paid per contract/share from source
                # REI = dividend reinvestment — treated as a buy lot
                cost_per_unit = (t.totalCost / t.quantity) if (t.quantity and t.totalCost) else t.price
                # If this equity BUY is from an option exercise, add the premium per share.
                # Each exercised contract produces exactly 100 shares as a separate BUY
                # transaction. FIFO: consume exercise shares one full transaction at a time.
                # Once shares_remaining is exhausted, remaining BUYs are open-market — no premium.
                if not option_symbol:
                    ex_key = (t.brokerage, t.ticker, t.date.date())
                    adj = exercise_cost_adjustments.get(ex_key)
                    if adj and adj["shares_remaining"] >= t.quantity:
                        cost_per_unit += adj["per_share"]
                        adj["shares_remaining"] -= t.quantity
                lot = {
                    "transaction_id": t.id,
                    "date": t.date,
                    "quantity": t.quantity,
                    "price": t.price,
                    "cost_per_unit": cost_per_unit,
                    "brokerage": t.current_brokerage or t.brokerage,
                    "account_id": getattr(t, "account_id", None),
                    "ticker": t.ticker,
                    "assetType": t.assetType,
                    "option_symbol": getattr(t, "option_symbol", None),
                    "is_short_position": is_short_position,
                }
                # Apply stock splits that occurred after this buy date (equity only).
                # EXTERNAL_ASSET_TRANSFER_IN lots already carry post-split cost basis
                # as recorded by the receiving brokerage — skip re-adjustment.
                if not option_symbol and t.ticker in split_map and t.action.upper() != "EXTERNAL_ASSET_TRANSFER_IN":
                    splits_after = [s for s in split_map[t.ticker] if s.split_date > t.date]
                    lot = apply_splits_to_lot(lot, splits_after)
                buy_lots_queue.append(lot)

            elif t.action.upper() in OPTION_EXPIRY_ACTIONS:
                # Option expired worthless — close all open lots as a realized loss.
                # Sell price is $0; the full premium paid becomes the loss.
                while buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = lot["quantity"]
                    # A long option that expires worthless is treated as sold for $0
                    # on the expiration date — long-term if it was held > 365 days.
                    is_long_term = is_long_term_holding(
                        lot["date"], t.date, lot.get("is_short_position", False)
                    )
                    realized_gains_list.append(RealizedGain(
                        brokerage=lot["brokerage"],
                        ticker=underlying_ticker(ticker),
                        buyDate=lot["date"],
                        sellDate=t.date,
                        quantity=qty,
                        buyPrice=lot["price"],
                        sellPrice=0.0,
                        gain=-(qty * lot["cost_per_unit"]),
                        isLongTerm=is_long_term,
                        assetType=lot.get("assetType"),
                    ))
                    buy_lots_queue.pop(0)

            elif t.action.upper() in OPTION_EXERCISE_ACTIONS:
                # Option was exercised — close the lot from the buy queue with no
                # separate gain/loss. The acquired equity shares are recorded as a
                # regular BUY transaction by the brokerage (already in the DB),
                # so the premium becomes part of the equity cost basis there.
                remaining = t.quantity
                while remaining > 0 and buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = min(remaining, lot["quantity"])
                    lot["quantity"] -= qty
                    remaining -= qty
                    if lot["quantity"] <= 0:
                        buy_lots_queue.pop(0)

            elif t.action.upper() in TRANSFER_OUT_ACTIONS:
                # Shares transferred to another brokerage — close lots silently.
                # No realized gain/loss; cost basis travels with the shares.
                # Apply split normalization in case the transfer predates a split.
                transfer_ratio = 1.0
                if not option_symbol and ticker in split_map:
                    for s in split_map[ticker]:
                        if s.split_date > t.date:
                            transfer_ratio *= s.numerator / s.denominator
                remaining = t.quantity * transfer_ratio
                while remaining > 0 and buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = min(remaining, lot["quantity"])
                    lot["quantity"] -= qty
                    remaining -= qty
                    if lot["quantity"] <= 0:
                        buy_lots_queue.pop(0)

            elif t.action.upper() in SELL_ACTIONS:
                # For equity, normalize the sell transaction to post-split terms.
                # Splits that occurred AFTER the sell date mean the sell was pre-split,
                # so divide price by the cumulative ratio and multiply quantity by it.
                sell_ratio = 1.0
                if not option_symbol and ticker in split_map:
                    for s in split_map[ticker]:
                        if s.split_date > t.date:
                            sell_ratio *= s.numerator / s.denominator

                raw_sell_qty = t.quantity
                adj_sell_qty = raw_sell_qty * sell_ratio
                raw_sell_cpu = (t.totalCost / t.quantity) if t.quantity else t.price
                adj_sell_cpu = raw_sell_cpu / sell_ratio if sell_ratio != 1.0 else None
                adj_sell_price = t.price / sell_ratio if sell_ratio != 1.0 else None

                remaining = adj_sell_qty

                # Step 1: consume explicit lot assignments first
                for assignment in all_assignments.get(t.id, []):
                    if remaining <= 0:
                        break
                    lot = next(
                        (l for l in buy_lots_queue if l["transaction_id"] == assignment.buy_transaction_id),
                        None,
                    )
                    if not lot:
                        print(f"[realized_gain_loader] WARNING: lot assignment references missing/depleted buy {assignment.buy_transaction_id} for sell {t.id}")
                        continue
                    # assignment.quantity is in original (pre-split) terms — scale it
                    adj_assignment_qty = assignment.quantity * sell_ratio
                    qty = min(adj_assignment_qty, lot["quantity"], remaining)
                    _record_gain(lot, t, qty, adj_sell_cpu=adj_sell_cpu, adj_sell_price=adj_sell_price)
                    lot["quantity"] -= qty
                    remaining -= qty
                    if lot["quantity"] <= 0:
                        buy_lots_queue.remove(lot)

                # Step 2: FIFO for any remaining unassigned quantity
                while remaining > 0 and buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = min(remaining, lot["quantity"])
                    _record_gain(lot, t, qty, adj_sell_cpu=adj_sell_cpu, adj_sell_price=adj_sell_price)
                    lot["quantity"] -= qty
                    remaining -= qty
                    if lot["quantity"] <= 0:
                        buy_lots_queue.pop(0)

        open = [l for l in buy_lots_queue if l["quantity"] > 0]
        if open:
            # Key for unrealized_gain_loader: use option_symbol as ticker for options
            # so each unique contract gets its own price lookup
            lot_key_ticker = option_symbol if option_symbol else ticker
            open_lots_by_ticker.setdefault((brokerage, lot_key_ticker), []).extend(open)

    _detect_wash_sales(transactions, realized_gains_list, open_lots_by_ticker)

    scope.add_all(realized_gains_list)  # stamps user_id
    db.commit()

    print(f"[realized_gain_loader] Returning open_lots_by_ticker: {open_lots_by_ticker}")
    return open_lots_by_ticker


def _option_type(symbol: str) -> Optional[str]:
    """Extract 'C' or 'P' from an OCC option symbol like MSFT250117C00400000."""
    m = re.search(r'\d{6}([CP])', symbol or "")
    return m.group(1) if m else None


def _detect_wash_sales(
    transactions: List,
    realized_gains_list: List,
    open_lots_by_ticker: Dict,
) -> None:
    """
    Detect wash sales per IRS Section 1091 and annotate lots in-place.

    Substantially identical rules:
      - Equity loss   → equity buy OR call option buy within ±30 days
      - Call loss     → equity buy OR call option buy within ±30 days
      - Put loss      → put option buy only within ±30 days
        (puts are not substantially identical to stock or calls)

    Type 1 — wash sale already triggered (replacement lot still open):
      Sets wash_sale_adjustment and wash_sale_clear_date on the replacement lot dict.
    Type 2 — at risk (open lot + qualifying recent buy exists within last 30 days):
      Sets wash_sale_recent_buy_date on the lot dict; unrealized_gain_loader
      only sets wash_sale_at_risk=True when unrealizedGain < 0.
    """
    WINDOW = timedelta(days=30)
    today = datetime.now()

    # Equity buy index: underlying ticker → [{date, transaction_id}]
    equity_buys: Dict[str, List[Dict]] = {}
    # Option buy index: underlying ticker → [{date, transaction_id, option_type}]
    option_buys: Dict[str, List[Dict]] = {}
    # Sell option type lookup: (underlying_ticker, sell_date) → 'C' or 'P'
    sell_option_type: Dict[tuple, str] = {}

    for t in transactions:
        sym = getattr(t, "option_symbol", None)
        if t.action.upper() in BUY_ACTIONS:
            if not sym:
                equity_buys.setdefault(t.ticker, []).append(
                    {"date": t.date, "transaction_id": t.id}
                )
            else:
                ot = _option_type(sym)
                option_buys.setdefault(t.ticker, []).append(
                    {"date": t.date, "transaction_id": t.id, "option_type": ot}
                )
        elif sym and t.action.upper() in SELL_ACTIONS:
            ot = _option_type(sym)
            if ot:
                sell_option_type[(t.ticker, t.date.date())] = ot

    # transaction_id → open lot for O(1) replacement-lot lookup
    txn_to_lot: Dict[int, Dict] = {}
    for lots in open_lots_by_ticker.values():
        for lot in lots:
            if lot.get("transaction_id"):
                txn_to_lot[lot["transaction_id"]] = lot

    def _first_in_window(ticker, sell_dt, *, equity_ok, call_ok, put_ok):
        """Return the first qualifying replacement buy within ±30 days of sell_dt."""
        if equity_ok:
            for buy in equity_buys.get(ticker, []):
                bd = buy["date"]
                if bd.date() != sell_dt.date() and sell_dt - WINDOW <= bd <= sell_dt + WINDOW:
                    return buy
        if call_ok:
            for buy in option_buys.get(ticker, []):
                if buy.get("option_type") == "C":
                    bd = buy["date"]
                    if bd.date() != sell_dt.date() and sell_dt - WINDOW <= bd <= sell_dt + WINDOW:
                        return buy
        if put_ok:
            for buy in option_buys.get(ticker, []):
                if buy.get("option_type") == "P":
                    bd = buy["date"]
                    if bd.date() != sell_dt.date() and sell_dt - WINDOW <= bd <= sell_dt + WINDOW:
                        return buy
        return None

    # Step 1: detect wash sales from realized losses
    for rg in realized_gains_list:
        if rg.gain >= 0:
            continue

        is_options_loss = (rg.assetType or "").lower() == "options"
        sell_dt = rg.sellDate
        ticker = rg.ticker  # always the underlying equity ticker

        if not is_options_loss:
            # Equity loss: substantially identical = equity buy OR call option buy
            repl = _first_in_window(ticker, sell_dt, equity_ok=True, call_ok=True, put_ok=False)
        else:
            otype = sell_option_type.get((ticker, sell_dt.date()))
            if otype == "C":
                # Call loss: equity buy OR call option buy
                repl = _first_in_window(ticker, sell_dt, equity_ok=True, call_ok=True, put_ok=False)
            elif otype == "P":
                # Put loss: only a put option buy qualifies
                repl = _first_in_window(ticker, sell_dt, equity_ok=False, call_ok=False, put_ok=True)
            else:
                # Unknown option type — conservative: check equity buys only
                repl = _first_in_window(ticker, sell_dt, equity_ok=True, call_ok=False, put_ok=False)

        if repl:
            rg.is_wash_sale = True
            rg.wash_sale_disallowed_amount = abs(rg.gain)
            lot = txn_to_lot.get(repl["transaction_id"])
            if lot:
                clear = max(sell_dt, repl["date"]) + WINDOW
                lot["wash_sale_adjustment"] = lot.get("wash_sale_adjustment", 0.0) + abs(rg.gain)
                existing = lot.get("wash_sale_clear_date")
                lot["wash_sale_clear_date"] = max(clear, existing) if existing else clear

    # Step 2: at-risk open lots (Type 2) — qualifying buy within last 30 days
    for lots in open_lots_by_ticker.values():
        for lot in lots:
            ws_clear = lot.get("wash_sale_clear_date")
            if ws_clear and ws_clear > today:
                continue  # Type 1 window still active — no need to double-flag

            underlying = lot.get("ticker") or ""
            lot_sym = lot.get("option_symbol")
            lot_is_options = (lot.get("assetType") or "").lower() == "options"

            if not lot_is_options:
                # Equity lot: at risk if equity buy OR call option buy in last 30 days
                recent = [b for b in equity_buys.get(underlying, []) if b["date"] >= today - WINDOW]
                if not recent:
                    recent = [b for b in option_buys.get(underlying, [])
                              if b.get("option_type") == "C" and b["date"] >= today - WINDOW]
            else:
                lot_otype = _option_type(lot_sym) if lot_sym else None
                if lot_otype == "C":
                    # Call lot: at risk if equity OR call option buy
                    recent = [b for b in equity_buys.get(underlying, []) if b["date"] >= today - WINDOW]
                    if not recent:
                        recent = [b for b in option_buys.get(underlying, [])
                                  if b.get("option_type") == "C" and b["date"] >= today - WINDOW]
                elif lot_otype == "P":
                    # Put lot: at risk only if put option buy
                    recent = [b for b in option_buys.get(underlying, [])
                              if b.get("option_type") == "P" and b["date"] >= today - WINDOW]
                else:
                    recent = []

            if recent:
                trigger = max(recent, key=lambda b: b["date"])
                lot["wash_sale_recent_buy_date"] = trigger["date"]
