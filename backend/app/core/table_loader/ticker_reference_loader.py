from sqlalchemy import func

from backend.app.core.scoping import UserScope
from backend.app.core.stock_fetcher import get_stock_price
from ...db.schema import TickerReference, Transaction


def delete(scope: UserScope):
    # Scoped delete — unscoped, this clears every user's ticker references.
    scope.delete_all(TickerReference)
    scope.db.commit()


def load(scope: UserScope):
    # First, delete existing ticker references
    delete(scope)

    # Find the first addition date for each ticker from this user's transactions
    first_addition_dates = (
        scope.query(
            Transaction.ticker,
            func.min(Transaction.date).label("first_date")
        )
        .group_by(Transaction.ticker)
        .all()
    )

    # Insert new ticker references
    for ticker, first_date in first_addition_dates:
        latest_price = get_stock_price(ticker, period='1d')

        ticker_ref = TickerReference(
            ticker=ticker,
            first_addition_date=first_date.date(),
            price=latest_price
        )
        scope.add(ticker_ref)  # stamps user_id
    scope.db.commit()
