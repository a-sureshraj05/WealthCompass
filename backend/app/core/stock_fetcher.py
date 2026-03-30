import re
import yfinance as yf
import pandas as pd
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


def _get_option_price(occ_symbol: str) -> Union[float, None]:
    """Fetch current mid-price for an OCC option symbol via the underlying's option chain."""
    parsed = _parse_occ(occ_symbol)
    if not parsed:
        return None
    underlying, expiry, cp, strike = parsed
    try:
        ticker = yf.Ticker(underlying)
        chain = ticker.option_chain(expiry)
        df = chain.calls if cp == 'c' else chain.puts
        row = df[df['strike'] == strike]
        if row.empty:
            # Try nearest strike in case of floating-point mismatch
            row = df.iloc[(df['strike'] - strike).abs().argsort()[:1]]
            if abs(row.iloc[0]['strike'] - strike) > 0.01:
                print(f"[option_price] No exact strike match for {occ_symbol} (closest={row.iloc[0]['strike']})")
                return None
        bid = float(row.iloc[0].get('bid', 0) or 0)
        ask = float(row.iloc[0].get('ask', 0) or 0)
        last = float(row.iloc[0].get('lastPrice', 0) or 0)
        if bid > 0 and ask > 0:
            price = (bid + ask) / 2
        elif last > 0:
            price = last
        else:
            price = None
        print(f"[option_price] {occ_symbol} → underlying={underlying} expiry={expiry} strike={strike} {cp.upper()} bid={bid} ask={ask} last={last} → price={price}")
        return price
    except Exception as e:
        print(f"[option_price] Error fetching chain for {occ_symbol}: {e}")
        return None


def get_stock_quote(ticker_symbol: str) -> tuple:
    """Return (current_price, previous_close) for an equity ticker.
    Falls back to (current, current) if only one day of data is available.
    Returns (None, None) on failure. Does not handle OCC option symbols."""
    if _OCC_RE.match(ticker_symbol):
        price = _get_option_price(ticker_symbol)
        return (price, price)
    try:
        hist = yf.Ticker(ticker_symbol).history(period='1mo')
        # history() only returns trading days, so iloc[-1] = last close, iloc[-2] = prev trading day close
        if len(hist) >= 2:
            return float(hist['Close'].iloc[-1]), float(hist['Close'].iloc[-2])
        elif len(hist) == 1:
            current = float(hist['Close'].iloc[-1])
            return current, current
        return None, None
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
