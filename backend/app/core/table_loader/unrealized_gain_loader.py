from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.schema import UnrealizedGain
from backend.app.core.stock_fetcher import get_stock_price

def delete(db: Session, brokerage_name: str = None):
    # Clear existing unrealized gains for the given brokerage, or all if none specified
    if brokerage_name:
        db.query(UnrealizedGain).filter(UnrealizedGain.brokerage == brokerage_name).delete()
    else:
        db.query(UnrealizedGain).delete()
    db.commit()

def load(db: Session, open_lots_by_ticker: Dict[str, List[Dict[str, Any]]], brokerage_name: str = None):
    print(f"[unrealized_gain_loader] Starting load for brokerage: {brokerage_name}")
    # First, delete existing unrealized gains
    delete(db, brokerage_name)

    unrealized_gains_list = []
    today = datetime.now()

    for ticker, open_lots in open_lots_by_ticker.items():
        if not open_lots:
            # print(f"[unrealized_gain_loader] No open lots for {ticker}, skipping.") # Debug print removed
            continue

        current_price = get_stock_price(ticker)  # Fetch current price once per ticker
        if current_price is None:
            # Skip if current price cannot be fetched
            print(f"Warning: Could not fetch current price for {ticker}. Skipping unrealized gain calculation for this ticker.")
            continue

        for lot in open_lots:
            # Ensure lot quantity is positive before processing
            if lot["quantity"] <= 0:
                # print(f"[unrealized_gain_loader] Lot quantity is non-positive for {ticker}, skipping lot: {lot}") # Debug print removed
                continue

            buy_date_dt = lot["date"]
            if buy_date_dt is None:
                # print(f"[unrealized_gain_loader] buyDate is None for {ticker}, skipping lot: {lot}") # Debug print removed
                continue

            try:
                diff_days = (today - buy_date_dt).days
                is_long_term = diff_days > 365

                unrealized_gain = UnrealizedGain(
                    brokerage=lot["brokerage"],
                    ticker=ticker,
                    buyDate=buy_date_dt,
                    quantity=lot["quantity"],
                    buyPrice=lot["price"],
                    currentPrice=current_price,
                    unrealizedGain=lot["quantity"] * (current_price - lot["price"]),
                    isLongTerm=is_long_term,
                )
                unrealized_gains_list.append(unrealized_gain)
            except Exception as e:
                print(f"[unrealized_gain_loader] ERROR creating UnrealizedGain object for lot {lot}: {e}")
                continue # Skip this lot if there's an error creating the object

    try:
        print(f"[unrealized_gain_loader] Adding {len(unrealized_gains_list)} unrealized gains to DB.")
        db.add_all(unrealized_gains_list)
        db.commit()
        print(f"[unrealized_gain_loader] Successfully committed unrealized gains.")
    except Exception as e:
        db.rollback()
        print(f"[unrealized_gain_loader] ERROR committing unrealized gains: {e}")
        raise # Re-raise the exception to propagate the error
