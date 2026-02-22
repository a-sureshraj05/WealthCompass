from sqlalchemy.orm import Session
from sqlalchemy import func
from ...db.schema import Transaction, TickerReference

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
        # Convert datetime to date for first_addition_date
        ticker_ref = TickerReference(ticker=ticker, first_addition_date=first_date.date())
        db.add(ticker_ref)
    db.commit()
