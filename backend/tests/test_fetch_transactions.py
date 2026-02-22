import sys
import os

# Add the project root to the Python path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy import create_engine, distinct
from sqlalchemy.orm import sessionmaker

from backend.app.core.stock_fetcher import get_stock_price
from backend.app.db.schema import Transaction

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./db/wealthcompass.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_tickers_and_last_closing_values():
    """
    Fetches all unique tickers from the transactions table and prints their last closing values.
    """
    db = SessionLocal()
    try:
        # Get unique tickers from the transactions table
        unique_tickers = db.query(distinct(Transaction.ticker)).all()
        tickers = [ticker[0] for ticker in unique_tickers]

        print("Found tickers:", tickers)

        for ticker in tickers:
            if ticker:
                # Fetch historical data for the last day
                data = get_stock_price(ticker, period='1d')
                if data is not None and not data.empty:
                    last_close = data['Close'].iloc[-1]
                    print(f"Ticker: {ticker}, Last Close: {last_close}")
                else:
                    print(f"Could not fetch data for ticker: {ticker}")
    finally:
        db.close()

if __name__ == "__main__":
    get_tickers_and_last_closing_values()
