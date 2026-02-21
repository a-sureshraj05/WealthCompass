import yfinance as yf
import pandas as pd
from typing import Union

def get_stock_price(ticker_symbol: str, period: str = '1d') -> Union[pd.DataFrame, None]:
    """
    Fetches historical stock data for a given ticker symbol.
    
    Args:
        ticker_symbol: The stock ticker symbol (e.g., 'AAPL').
        period: The time period for which to fetch data (e.g., '1d', '5d', '1mo').
        
    Returns:
        A pandas DataFrame containing the historical data, or None if an error occurs.
    """
    try:
        ticker = yf.Ticker(ticker_symbol)
        historical_data = ticker.history(period=period)
        print(f"Fetching stock price for: {historical_data}")

        if not historical_data.empty:
            return historical_data
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
