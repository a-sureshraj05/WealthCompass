import re
import yfinance as yf
import pandas as pd
from decimal import Decimal, ROUND_HALF_UP
from typing import Union

# OCC option symbol: up to 6-char root + YYMMDD + C/P + 8-digit strike (e.g. MSFT281215C00400000)
_OCC_RE = re.compile(r'^([A-Z]{1,6})(\d{6})([CP])(\d{8})$')


def _parse_occ(symbol: str):
    """Return (underlying, expiry_str 'YYYY-MM-DD', call_put 'c'/'p', strike float) or None."""
    m = _OCC_RE.match(symbol)
    if not m:
        return None
    underlying, yymmdd, cp, strike_raw = m.groups()
    yy, mm, dd = yymmdd[:2], yymmdd[2:4], yymmdd[4:]
    year = int(yy) + 2000
    expiry = f"{year}-{mm}-{dd}"
    strike = int(strike_raw) / 1000.0
    return underlying, expiry, cp.lower(), strike


def _get_option_quote(occ_symbol: str) -> tuple:
    """Fetch (current_price, prev_close) for an OCC option symbol.
    current_price: bid/ask mid from the option chain (or lastPrice fallback).
    prev_close: previous session close from history(period='5d') on the OCC symbol,
    same approach as equity — avoids the stale lastPrice/change inconsistency.
    Returns (None, None) on failure."""
    parsed = _parse_occ(occ_symbol)
    if not parsed:
        return None, None
    underlying, expiry, cp, strike = parsed
    try:
        # Current price from the live option chain (bid/ask mid)
        ticker = yf.Ticker(underlying)
        chain = ticker.option_chain(expiry)
        df = chain.calls if cp == 'c' else chain.puts
        row = df[df['strike'] == strike]
        if row.empty:
            row = df.iloc[(df['strike'] - strike).abs().argsort()[:1]]
            if abs(row.iloc[0]['strike'] - strike) > 0.01:
                print(f"[option_price] No exact strike match for {occ_symbol} (closest={row.iloc[0]['strike']})")
                return None, None
        r = row.iloc[0]
        bid = float(r.get('bid', 0) or 0)
        ask = float(r.get('ask', 0) or 0)
        last = float(r.get('lastPrice', 0) or 0)
        if bid > 0 and ask > 0:
            # Options quote in penny increments, so a mid on a half-cent isn't a
            # tradeable price. Round to the cent to match how brokerages display
            # the mark — otherwise totals drift a few dollars off the statement.
            # Decimal + ROUND_HALF_UP on purpose: a half-cent mid is exactly the
            # case here, and round() would bankers-round it to the even cent.
            current = float(
                ((Decimal(str(bid)) + Decimal(str(ask))) / 2).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            )
        elif last > 0:
            current = last
        else:
            current = None

        # Previous close from history — same as equity approach
        prev_close = current
        try:
            hist = yf.Ticker(occ_symbol).history(period='5d').dropna(subset=['Close'])
            if len(hist) >= 2:
                prev_close = float(hist['Close'].iloc[-2])
            elif len(hist) == 1:
                prev_close = float(hist['Close'].iloc[-1])
        except Exception:
            pass

        print(f"[option_price] {occ_symbol} → bid={bid} ask={ask} last={last} → price={current} prev_close={prev_close}")
        return current, prev_close
    except Exception as e:
        print(f"[option_price] Error fetching chain for {occ_symbol}: {e}")
        return None, None


def _get_option_price(occ_symbol: str) -> Union[float, None]:
    """Fetch current mid-price for an OCC option symbol. Used by get_stock_price."""
    price, _ = _get_option_quote(occ_symbol)
    return price


def get_stock_quote(ticker_symbol: str) -> tuple:
    """Return (current_price, previous_close) for an equity ticker.
    Uses fast_info.last_price as the current price (reflects intraday),
    with history(period='5d') for the previous close.
    Falls back to (current, current) if only one day of data is available.
    Returns (None, None) on failure. Does not handle OCC option symbols."""
    if _OCC_RE.match(ticker_symbol):
        return _get_option_quote(ticker_symbol)
    try:
        t = yf.Ticker(ticker_symbol)
        # fast_info.last_price reflects current intraday price (or last close outside hours)
        live_price = None
        try:
            live_price = t.fast_info.last_price
        except Exception:
            pass

        hist = t.history(period='5d').dropna(subset=['Close'])
        if len(hist) >= 2:
            prev_close = float(hist['Close'].iloc[-2])
        elif len(hist) == 1:
            prev_close = float(hist['Close'].iloc[-1])
        else:
            prev_close = live_price

        current = live_price if live_price else (float(hist['Close'].iloc[-1]) if len(hist) else None)
        if current is None:
            return None, None
        return float(current), float(prev_close) if prev_close else float(current)
    except Exception as e:
        print(f"Error fetching quote for {ticker_symbol}: {e}")
        return None, None


def get_stock_price(ticker_symbol: str, period: str = '1d') -> Union[float, None]:
    """
    Fetches the latest closing stock price for a given ticker symbol.
    Handles OCC option symbols (e.g. MSFT281215C00400000) via the option chain.
    """
    # Route option symbols through the chain lookup
    if _OCC_RE.match(ticker_symbol):
        return _get_option_price(ticker_symbol)

    try:
        ticker = yf.Ticker(ticker_symbol)
        historical_data = ticker.history(period=period)

        if not historical_data.empty and 'Close' in historical_data.columns:
            return historical_data['Close'].iloc[-1].item()
        else:
            return None
    except Exception as e:
        print(f"Error fetching stock price for {ticker_symbol}: {e}")
        return None

def get_stock_price_by_date_range(ticker_symbol: str, start_date: str, end_date: str) -> Union[pd.DataFrame, None]:
    """
    Fetches historical stock data for a given ticker symbol and date range.
    
    Args:
        ticker_symbol: The stock ticker symbol (e.g., 'AAPL').
        start_date: The start date in 'YYYY-MM-DD' format.
        end_date: The end date in 'YYYY-MM-DD' format.
        
    Returns:
        A pandas DataFrame containing the historical data, or None if an error occurs.
    """
    try:
        data = yf.download(ticker_symbol, start=start_date, end=end_date)
        if not data.empty:
            return data
        else:
            return None
    except Exception as e:
        print(f"Error fetching stock price for {ticker_symbol}: {e}")
        return None

if __name__ == '__main__':
    # Example usage:
    apple_price = get_stock_price('NFLX')
    if apple_price:
        print(f"The current price of Netflix (NFLX) is: ${apple_price:.2f}")

    meta_price = get_stock_price('META')
    if meta_price:
        print(f"The current price of Meta (META) is: ${meta_price:.2f}")
