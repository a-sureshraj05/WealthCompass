"""A SPY counterfactual following recorded buy/sell dollars and external funding.

Exposure is measured in total-return-index units, not reported as actual shares.
All trades in a session execute at that session's adjusted close. Dividends of
SPY are already reinvested in the index; original-security income/REI is not copied.
"""
from backend.app.core.performance_ledger import issue


def trade_matched_spy(events, spy, opening_cash=None):
    if not events or not spy:
        return {}, []
    first = min(event.day for event in events)
    previous_sessions = sorted(day for day in spy if day < first)
    if not previous_sessions:
        return {}, [issue("spy_trade_opening", "SPY trade timing needs an opening benchmark session.")]
    sessions = [previous_sessions[-1]] + sorted(day for day in spy if day >= first)
    ordered = sorted(events, key=lambda event: (event.day, event.id))
    cursor, units, cash = 0, 0.0, float(opening_cash or 0)
    result, issues = {}, []
    failed = False
    for day in sessions:
        if failed:
            result[day] = {"value": None, "cash": None}
            continue
        index = spy[day]
        buys = sells = 0.0
        # Non-trading-day activity executes at the next available SPY close.
        # Net the session's legs rather than claiming an intraday execution order.
        while cursor < len(ordered) and ordered[cursor].day <= day:
            event = ordered[cursor]
            cursor += 1
            if event.kind == "buy": buys += event.amount
            elif event.kind == "sell": sells += event.amount
            elif event.kind == "deposit": cash += event.amount
            elif event.kind in {"withdrawal", "fee"}: cash -= event.amount
        units += (buys - sells) / index
        cash += sells - buys
        invested = units * index
        if invested < -.02:
            issues.append(issue("spy_trade_sale", "A sale exceeds the hypothetical SPY account's invested value. Trade timing stops here; no short position is assumed.", day))
            failed = True
        elif cash < -.02:
            issues.append(issue("spy_trade_cash", "The hypothetical SPY account has insufficient cash for your recorded trades or withdrawals. Original-stock income is not copied into SPY, whose own dividends are reinvested.", day))
            failed = True
        if failed:
            result[day] = {"value": None, "cash": None}
        else:
            units, cash = max(units, 0.0), max(cash, 0.0)
            result[day] = {"value": cash + units * index, "cash": cash}
    return result, issues
