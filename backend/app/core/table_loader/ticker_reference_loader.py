from sqlalchemy.orm import Session
from sqlalchemy import func
from ...db.schema import Transaction, TickerReference
from backend.app.core.stock_fetcher import get_stock_price

def delete(db: Session):
    # Delete existing ticker references
    db.query(TickerReference).delete()
    db.commit()

def load(db: Session):
    # First, delete existing ticker references
    delete(db)

    # Find the first addition date for each ticker from transactions
    first_addition_dates = (
        db.query(
            Transaction.ticker,
            func.min(Transaction.date).label("first_date")
        )
        .group_by(Transaction.ticker)
        .all()
    )

    # Insert new ticker references
    for ticker, first_date in first_addition_dates:
        latest_price = None
        historical_data = get_stock_price(ticker, period='1d')
        if historical_data is not None and not historical_data.empty:
            latest_price = historical_data['Close'].iloc[-1]
        
        ticker_ref = TickerReference(
            ticker=ticker,
            first_addition_date=first_date.date(),
            price=latest_price
        )
        db.add(ticker_ref)
    db.commit()
