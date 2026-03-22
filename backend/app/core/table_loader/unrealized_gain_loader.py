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

    for (brokerage, ticker), open_lots in open_lots_by_ticker.items():
        if not open_lots:
            continue

        # For options, use OCC symbol for price lookup (e.g. MSFT250117C00400000)
        # Expired options return None from yfinance → treat as $0 (worthless)
        option_symbol = open_lots[0].get("option_symbol") if open_lots else None
        price_ticker = option_symbol if option_symbol else ticker
        current_price = get_stock_price(price_ticker)
        if current_price is None:
            if option_symbol:
                print(f"[unrealized_gain_loader] Option {option_symbol} has no price data (likely expired). Using $0.")
                current_price = 0.0
            else:
                print(f"Warning: Could not fetch current price for {ticker} ({brokerage}). Skipping.")
                continue

        for lot in open_lots:
            # Ensure lot quantity is positive before processing
            if lot["quantity"] <= 0:
                continue

            buy_date_dt = lot["date"]
            if buy_date_dt is None:
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
                    assetType=lot.get("assetType"),
                )
                unrealized_gains_list.append(unrealized_gain)
            except Exception as e:
                print(f"[unrealized_gain_loader] ERROR creating UnrealizedGain object for lot {lot}: {e}")
                continue

    try:
        print(f"[unrealized_gain_loader] Adding {len(unrealized_gains_list)} unrealized gains to DB.")
        db.add_all(unrealized_gains_list)
        db.commit()
        print(f"[unrealized_gain_loader] Successfully committed unrealized gains.")
    except Exception as e:
        db.rollback()
        print(f"[unrealized_gain_loader] ERROR committing unrealized gains: {e}")
        raise
