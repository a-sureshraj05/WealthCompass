from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.schema import StockSplit


def get_splits_after(db: Session, ticker: str, after_date) -> List[StockSplit]:
    """Return all splits for a ticker that occurred strictly after after_date, ordered by date."""
    return (
        db.query(StockSplit)
        .filter(StockSplit.ticker == ticker, StockSplit.split_date > after_date)
        .order_by(StockSplit.split_date)
        .all()
    )


def apply_splits_to_lot(lot: Dict[str, Any], splits: List[StockSplit]) -> Dict[str, Any]:
    """
    Adjust a buy lot's quantity and price for all splits that occurred after the buy date.
    Each split multiplies quantity by (numerator/denominator) and divides price by same ratio.
    Returns a new dict — does not mutate the original.
    """
    if not splits:
        return lot

    adjusted = dict(lot)
    for split in splits:
        ratio = split.numerator / split.denominator
        adjusted["quantity"] = adjusted["quantity"] * ratio
        adjusted["price"] = adjusted["price"] / ratio
        adjusted["cost_per_unit"] = adjusted["cost_per_unit"] / ratio

    return adjusted


def build_split_map(db: Session, tickers: List[str]) -> Dict[str, List[StockSplit]]:
    """
    Pre-fetch all splits for a list of tickers.
    Returns {ticker: [StockSplit, ...]} ordered by split_date asc.
    """
    if not tickers:
        return {}
    rows = (
        db.query(StockSplit)
        .filter(StockSplit.ticker.in_(tickers))
        .order_by(StockSplit.split_date)
        .all()
    )
    result: Dict[str, List[StockSplit]] = {}
    for s in rows:
        result.setdefault(s.ticker, []).append(s)
    return result
