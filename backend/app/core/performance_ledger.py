"""Replay recorded activity into dated holdings and cash. No invented prices/funding."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite
import re


@dataclass(frozen=True)
class Event:
    id: int
    day: date
    symbol: str
    kind: str
    quantity: float
    amount: float
    multiplier: int = 1
    account: str = ""


def issue(code, message, day=None, symbol=None, transaction_id=None):
    result = {"code": code, "message": message}
    if day: result["date"] = str(day)
    if symbol: result["symbol"] = symbol
    if transaction_id: result["transactionId"] = transaction_id
    return result


def ledger_events(transactions, currencies=None):
    events, issues = [], []
    currencies = currencies or {}
    for row in transactions:
        day = row.date.date() if hasattr(row.date, "date") else row.date
        if not day:
            issues.append(issue("missing_date", "A transaction has no recorded date.", transaction_id=row.id)); continue
        action = (row.action or "").strip().upper()
        symbol = (row.option_symbol or row.ticker or "").replace(" ", "").upper()
        option = (row.assetType or "").lower() == "options"
        cash_asset = (row.assetType or "").lower() == "cash" or symbol == "CASH"
        quantity = abs(float(row.quantity or 0))
        multiplier = 100 if option else 1
        amount = abs(float(row.totalCost)) if row.totalCost is not None else abs(quantity * float(row.price or 0) * multiplier)
        if not all(isfinite(value) for value in (quantity, amount)):
            issues.append(issue("invalid_number", "A transaction has an invalid quantity or cash amount.", day, symbol, row.id)); continue
        if row.source == "snaptrade" and currencies.get(row.raw_id, "USD").upper() != "USD":
            issues.append(issue("currency", "Historical FX conversion is required for this non-USD activity.", day, symbol, row.id)); continue
        if option and not re.fullmatch(r"[A-Z]{1,6}\d{6}[CP]\d{8}", symbol):
            issues.append(issue("option_symbol", "An option transaction needs its exact contract symbol.", day, symbol, row.id)); continue
        kind = None
        if action in {"DIV", "DIVIDEND", "INTEREST", "INT", "DISTRIBUTION"}: kind = "income"
        elif action in {"DEPOSIT", "CONTRIBUTION", "WITHDRAWAL"}:
            if row.source == "snaptrade" and action == "DEPOSIT" and not row.is_override:
                issues.append(issue("ambiguous_income", "Review this imported DEPOSIT: the legacy importer also labelled dividends as deposits. Confirm its action in Transactions.", day, symbol, row.id)); continue
            kind = "withdrawal" if action == "WITHDRAWAL" else "deposit"
        elif action in {"FEE", "COMMISSION", "TAX"}: kind = "fee"
        elif action in {"BUY", "SELL"} and cash_asset:
            if symbol != "CASH":
                issues.append(issue("cash_sweep", "Classify this cash-instrument movement before reconstructing cash; it may be an internal sweep.", day, symbol, row.id)); continue
            kind = "deposit" if action == "BUY" else "withdrawal"
        elif action in {"BUY", "SELL", "SELL_SHORT", "BUY_TO_COVER", "SELL_TO_OPEN", "BUY_TO_CLOSE", "SELL_TO_CLOSE", "BUY_TO_OPEN"}:
            kind = "sell" if action.startswith("SELL") else "buy"
        elif action == "REI": kind = "reinvest"
        elif action == "OPTIONEXPIRATION": kind = "expiry"
        else:
            issues.append(issue("unsupported_action", f"Review action {action or '(empty)'}; transfers/exercises require explicit matching cash and security legs.", day, symbol, row.id)); continue
        if kind in {"buy", "sell", "reinvest", "expiry"} and (not symbol or quantity <= 0):
            issues.append(issue("invalid_trade", "A security movement needs a symbol and positive quantity.", day, symbol, row.id)); continue
        if kind in {"buy", "sell", "reinvest", "deposit", "withdrawal", "income", "fee"} and row.totalCost is None and row.price is None:
            issues.append(issue("missing_amount", "A transaction needs its recorded cash amount or execution price.", day, symbol, row.id)); continue
        events.append(Event(row.id, day, symbol, kind, quantity, amount, multiplier, str(getattr(row, "account_id", None) or getattr(row, "brokerage", "") or "")))
    return sorted(events, key=lambda event: (event.day, event.id)), issues


def holding_windows(events, splits, as_of):
    """Only request closes while exposed; full-sale day requires no closing quote."""
    by_day = defaultdict(list)
    for event in events: by_day[event.day].append(event)
    quantity, opened = 0.0, None
    windows = []
    days = sorted(set(by_day) | {day for day in splits if day <= as_of})
    for day in days:
        quantity *= splits.get(day, 1.0)
        for event in by_day.get(day, []):
            if event.kind in {"buy", "reinvest"}: quantity += event.quantity
            elif event.kind == "sell": quantity -= event.quantity
            elif event.kind == "expiry": quantity -= min(abs(quantity), event.quantity) * (1 if quantity >= 0 else -1)
        if abs(quantity) > 1e-8 and opened is None: opened = day
        elif abs(quantity) <= 1e-8 and opened is not None:
            if opened <= day - timedelta(days=1): windows.append((opened, day - timedelta(days=1)))
            opened = None
    if opened is not None: windows.append((opened, as_of))
    return windows


def reconstruct(events, market, spy, opening_cash=None):
    """Daily close valuation; external flows recorded at end of day for estimated TWR."""
    if not events or not spy: return [], [issue("no_history", "Transactions and SPY trading-day history are required.")]
    first = min(event.day for event in events)
    sessions = sorted(spy)
    baseline = [day for day in sessions if day < first]
    if not baseline: return [], [issue("opening_price", "SPY history is missing the opening valuation date.")]
    sessions = [baseline[-1]] + [day for day in sessions if day >= first]
    by_day = defaultdict(list)
    for event in events: by_day[event.day].append(event)
    quantities, multiples = defaultdict(float), {}
    cash = float(opening_cash or 0)
    issues, values = [], []
    pending_deposits = pending_withdrawals = 0.0
    previous = sessions[0]
    missing_funding = False
    # A recorded dividend and reinvestment are separate legs; don't credit twice.
    incomes = defaultdict(float)
    for event in events:
        if event.kind == "income": incomes[(event.day, event.symbol, event.account)] += event.amount
    for day in sessions:
        if day != sessions[0]:
            cursor = previous + timedelta(days=1)
            while cursor <= day:
                for symbol, history in market.items(): quantities[symbol] *= history.get(cursor, {}).get("split", 1.0)
                for event in by_day.get(cursor, []):
                    multiples[event.symbol] = event.multiplier
                    if event.kind in {"buy", "reinvest"}:
                        quantities[event.symbol] += event.quantity
                        cash -= event.amount
                        if event.kind == "reinvest" and not incomes.get((event.day, event.symbol, event.account)): cash += event.amount
                    elif event.kind == "sell": quantities[event.symbol] -= event.quantity; cash += event.amount
                    elif event.kind == "expiry": quantities[event.symbol] -= min(abs(quantities[event.symbol]), event.quantity) * (1 if quantities[event.symbol] >= 0 else -1)
                    elif event.kind in {"deposit", "income"}:
                        cash += event.amount
                        if event.kind == "deposit": pending_deposits += event.amount
                    elif event.kind in {"withdrawal", "fee"}:
                        cash -= event.amount
                        if event.kind == "withdrawal": pending_withdrawals += event.amount
                cursor += timedelta(days=1)
        complete, invested = not missing_funding, 0.0
        for symbol, quantity in quantities.items():
            if abs(quantity) <= 1e-8: continue
            if quantity < -1e-8:
                complete = False
                if not any(row.get("code") == "opening_positions" and row.get("symbol") == symbol for row in issues):
                    issues.append(issue("opening_positions", "Sales exceed recorded units. Import the opening position or missing purchases; short positions require additional valuation support.", day, symbol))
            price = market.get(symbol, {}).get(day, {}).get("close")
            if price is None or not isfinite(price) or price < 0:
                complete = False
                if not any(row.get("code") == "missing_price" and row.get("symbol") == symbol for row in issues):
                    issues.append(issue("missing_price", "Historical closing prices are missing while this instrument was held. No price was invented.", day, symbol))
            else: invested += quantity * multiples.get(symbol, 1) * price
        if cash < -.02:
            missing_funding = True
            complete = False
            if not any(row["code"] == "cash_history" for row in issues):
                issues.append(issue("cash_history", "Recorded funding is insufficient. Supply the actual cash balance before the first transaction, or add the missing funding activity. Margin accounts require additional valuation support.", day))
        total = cash + invested if complete else None
        if total is not None and total < 0:
            complete = False; total = None
        index = spy[day]
        values.append({"date": day, "holdings": invested if complete else None, "cash": cash, "value": total,
                       "deposits": pending_deposits, "withdrawals": pending_withdrawals, "spyTotalReturnIndex": index, "complete": complete})
        pending_deposits = pending_withdrawals = 0.0
        previous = day
    return values, issues
