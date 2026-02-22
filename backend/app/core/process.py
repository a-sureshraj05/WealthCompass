from datetime import datetime  # noqa: F401
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from backend.app.db.schema import RealizedGain
from backend.app.db.schema import Transaction as DBTransaction
from backend.app.core.table_loader.ticker_reference_loader import load as ticker_reference_load


def process_transactions(db: Session, brokerage_name: str = None):
    print(
        f"Processing transactions for brokerage: {brokerage_name if brokerage_name else 'All'}..."
    )

    # Clear existing realized gains for the given brokerage, or all if none specified
    if brokerage_name:
        db.query(RealizedGain).filter(RealizedGain.brokerage == brokerage_name).delete()
    else:
        db.query(RealizedGain).delete()
    db.commit()

    # Fetch all transactions, or filtered by brokerage
    if brokerage_name:
        transactions = (
            db.query(DBTransaction)
            .filter(DBTransaction.brokerage == brokerage_name)
            .order_by(DBTransaction.date)
            .all()
        )
    else:
        transactions = db.query(DBTransaction).order_by(DBTransaction.date).all()

    realized_gains_list = []
    print(f"{realized_gains_list}")

    # Group transactions by ticker
    ticker_groups: Dict[str, List[DBTransaction]] = {}
    for t in transactions:
        if t.ticker not in ticker_groups:
            ticker_groups[t.ticker] = []
        ticker_groups[t.ticker].append(t)

    for ticker, ticker_transactions in ticker_groups.items():
        # Sort by date for FIFO
        sorted_transactions = sorted(ticker_transactions, key=lambda x: x.date)

        buy_lots_queue: List[Dict[str, Any]] = []

        for t in sorted_transactions:
            if t.action.upper() == "BUY":
                buy_lots_queue.append(
                    {
                        "date": t.date,
                        "quantity": t.quantity,
                        "price": t.price,
                        "brokerage": t.brokerage,
                    }
                )
            elif t.action.upper() == "SELL":
                remaining_to_sell = t.quantity
                while remaining_to_sell > 0 and len(buy_lots_queue) > 0:
                    lot = buy_lots_queue[0]
                    sell_qty = min(remaining_to_sell, lot["quantity"])

                    buy_date_dt = lot["date"]
                    sell_date_dt = t.date

                    diff_days = (sell_date_dt - buy_date_dt).days
                    is_long_term = diff_days > 365

                    realized_gain = RealizedGain(
                        brokerage=t.brokerage,
                        ticker=ticker,
                        buyDate=buy_date_dt,
                        sellDate=sell_date_dt,
                        quantity=sell_qty,
                        buyPrice=lot["price"],
                        sellPrice=t.price,
                        gain=sell_qty * (t.price - lot["price"]),
                        isLongTerm=is_long_term,
                    )
                    realized_gains_list.append(realized_gain)

                    lot["quantity"] -= sell_qty
                    remaining_to_sell -= sell_qty
                    if lot["quantity"] == 0:
                        buy_lots_queue.pop(0)  # Remove fully depleted lot

    db.add_all(realized_gains_list)
    db.commit()

    ticker_reference_load(db)

    print(f"Finished processing. Saved {len(realized_gains_list)} realized gains.")
