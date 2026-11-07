"""Public daily-price provider. All money/positions remain outside worker threads."""
from datetime import timedelta
from math import isfinite, prod
import yfinance as yf

from backend.app.core.performance_ledger import holding_windows


def fetch_instrument(symbol, events, as_of):
    instrument = yf.Ticker(symbol)
    option = events[0].multiplier == 100
    splits = {}
    if not option:
        # Yahoo Close already reflects later stock splits. Fetch action metadata
        # separately so even a position closed before a split has correct prices.
        actions = instrument.get_splits(period="max")
        for stamp, ratio in actions.items():
            ratio = float(ratio)
            if not isfinite(ratio) or ratio <= 0: raise ValueError("Invalid split metadata")
            splits[stamp.date()] = ratio
    windows = holding_windows(events, splits, as_of)
    rows = {day: {"close": None, "adjusted": None, "split": ratio, "currency": "USD"} for day, ratio in splits.items() if min(event.day for event in events) <= day <= as_of}
    for start, end in windows:
        history = instrument.history(start=start.isoformat(), end=(end + timedelta(days=1)).isoformat(), interval="1d", auto_adjust=False, actions=True, timeout=12)
        metadata = instrument.get_history_metadata()
        currency = str(metadata.get("currency", "")).upper()
        if currency != "USD": raise ValueError("USD price history is required")
        for stamp, row in history.iterrows():
            day = stamp.date()
            value = float(row["Close"])
            if not isfinite(value) or value < 0 or not option and value == 0: continue
            factor = prod(ratio for split_day, ratio in splits.items() if split_day > day)
            rows[day] = {"close": value * factor, "adjusted": None, "split": splits.get(day, 1.0), "currency": currency}
    return rows


def fetch_spy(start, end):
    instrument = yf.Ticker("SPY")
    history = instrument.history(start=(start - timedelta(days=10)).isoformat(), end=(end + timedelta(days=1)).isoformat(), interval="1d", auto_adjust=False, actions=True, timeout=12)
    if str(instrument.get_history_metadata().get("currency", "")).upper() != "USD": raise ValueError("SPY currency is not USD")
    result = {}
    for stamp, row in history.iterrows():
        adjusted = float(row.get("Adj Close", float("nan")))
        close = float(row["Close"])
        if isfinite(adjusted) and adjusted > 0 and isfinite(close) and close > 0:
            result[stamp.date()] = {"close": close, "adjusted": adjusted, "split": float(row.get("Stock Splits", 0)) or 1.0, "currency": "USD"}
    return result
