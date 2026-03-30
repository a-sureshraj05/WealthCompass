from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.schema import LotAssignment, RealizedGain, Transaction as DBTransaction
from backend.app.core.utils.ticker import underlying_ticker
from backend.app.core.transaction_actions import BUY_ACTIONS, SELL_ACTIONS, OPTION_EXPIRY_ACTIONS, OPTION_EXERCISE_ACTIONS


def delete(db: Session, brokerage_name: str = None):
    if brokerage_name:
        db.query(RealizedGain).filter(RealizedGain.brokerage == brokerage_name).delete()
    else:
        db.query(RealizedGain).delete()
    db.commit()


def load(db: Session, brokerage_name: str = None) -> Dict[str, List[Dict[str, Any]]]:
    delete(db, brokerage_name)

    # Fetch all non-soft-deleted transactions, ordered by date
    q = db.query(DBTransaction).filter(DBTransaction.is_deleted == False)
    if brokerage_name:
        q = q.filter(DBTransaction.brokerage == brokerage_name)
    transactions = q.order_by(DBTransaction.date).all()

    # Load explicit lot assignments: sell_transaction_id → [LotAssignment]
    sell_ids = [t.id for t in transactions if t.action.upper() in SELL_ACTIONS]
    all_assignments: Dict[int, List[LotAssignment]] = {}
    if sell_ids:
        for a in db.query(LotAssignment).filter(LotAssignment.sell_transaction_id.in_(sell_ids)).all():
            all_assignments.setdefault(a.sell_transaction_id, []).append(a)

    realized_gains_list = []
    open_lots_by_ticker: Dict[str, List[Dict[str, Any]]] = {}

    # Group by (brokerage, ticker, option_symbol) so equity and each unique option
    # contract are matched separately. Equity transactions have option_symbol = None/"".
    ticker_groups: Dict[tuple, List[DBTransaction]] = {}
    for t in transactions:
        key = (t.brokerage, t.ticker, getattr(t, "option_symbol", None) or "")
        ticker_groups.setdefault(key, []).append(t)

    # Pre-pass: compute premium-per-share adjustments from exercised options.
    # When an option is exercised, the premium paid becomes part of the equity
    # cost basis. Key: (brokerage, underlying_ticker, exercise_date) → $/share to add.
    exercise_cost_adjustments: Dict[tuple, float] = {}
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
                    extra = premium / (t.quantity * 100)  # premium per underlying share
                    exercise_cost_adjustments[key] = exercise_cost_adjustments.get(key, 0.0) + extra

    for (brokerage, ticker, option_symbol), ticker_transactions in ticker_groups.items():
        # Skip Cash asset types
        if ticker_transactions and ticker_transactions[0].assetType == "Cash":
            continue

        sorted_transactions = sorted(ticker_transactions, key=lambda x: (x.date, x.id))

        # Each lot tracks its transaction_id so explicit assignments can find it
        buy_lots_queue: List[Dict[str, Any]] = []

        def _record_gain(lot, sell_txn, qty):
            is_long_term = (sell_txn.date - lot["date"]).days > 365
            # Use cost_per_unit derived from the source totalCost — this already reflects
            # the options multiplier (100 shares/contract) as reported by the brokerage.
            buy_cost_per_unit = lot["cost_per_unit"]
            sell_cost_per_unit = sell_txn.totalCost / sell_txn.quantity if sell_txn.quantity else sell_txn.price
            realized_gains_list.append(RealizedGain(
                brokerage=sell_txn.brokerage,
                ticker=underlying_ticker(ticker),
                buyDate=lot["date"],
                sellDate=sell_txn.date,
                quantity=qty,
                buyPrice=lot["price"],
                sellPrice=sell_txn.price,
                gain=qty * (sell_cost_per_unit - buy_cost_per_unit),
                isLongTerm=is_long_term,
                assetType=lot.get("assetType"),
            ))

        for t in sorted_transactions:
            if t.action.upper() in BUY_ACTIONS:
                # cost_per_unit = actual dollars paid per contract/share from source
                # REI = dividend reinvestment — treated as a buy lot
                cost_per_unit = (t.totalCost / t.quantity) if (t.quantity and t.totalCost) else t.price
                # If this equity BUY is from an option exercise, add the premium
                # per share so the cost basis reflects strike + premium.
                if not option_symbol:
                    ex_key = (t.brokerage, t.ticker, t.date.date())
                    cost_per_unit += exercise_cost_adjustments.get(ex_key, 0.0)
                buy_lots_queue.append({
                    "transaction_id": t.id,
                    "date": t.date,
                    "quantity": t.quantity,
                    "price": t.price,
                    "cost_per_unit": cost_per_unit,
                    "brokerage": t.brokerage,
                    "ticker": t.ticker,
                    "assetType": t.assetType,
                    "option_symbol": getattr(t, "option_symbol", None),
                })

            elif t.action.upper() in OPTION_EXPIRY_ACTIONS:
                # Option expired worthless — close all open lots as a realized loss.
                # Sell price is $0; the full premium paid becomes the loss.
                while buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = lot["quantity"]
                    is_long_term = (t.date - lot["date"]).days > 365
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

            elif t.action.upper() in SELL_ACTIONS:
                remaining = t.quantity

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
                    qty = min(assignment.quantity, lot["quantity"], remaining)
                    _record_gain(lot, t, qty)
                    lot["quantity"] -= qty
                    remaining -= qty
                    if lot["quantity"] <= 0:
                        buy_lots_queue.remove(lot)

                # Step 2: FIFO for any remaining unassigned quantity
                while remaining > 0 and buy_lots_queue:
                    lot = buy_lots_queue[0]
                    qty = min(remaining, lot["quantity"])
                    _record_gain(lot, t, qty)
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

    db.add_all(realized_gains_list)
    db.commit()

    print(f"[realized_gain_loader] Returning open_lots_by_ticker: {open_lots_by_ticker}")
    return open_lots_by_ticker
