from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session
from backend.app.db.schema import UnrealizedGain
from backend.app.core.stock_fetcher import get_stock_price, get_stock_quote, is_expired_option
from backend.app.core.utils.ticker import underlying_ticker
from backend.app.core.stock_split_utils import build_split_map

_OPTIONS_MULTIPLIER = 100  # 1 contract = 100 underlying shares

def _multiplier(asset_type: str) -> int:
    return _OPTIONS_MULTIPLIER if (asset_type or "").lower() == "options" else 1

def delete(db: Session, brokerage_name: str = None):
    # Clear existing unrealized gains for the given brokerage, or all if none specified
    if brokerage_name:
        db.query(UnrealizedGain).filter(UnrealizedGain.brokerage == brokerage_name).delete()
    else:
        db.query(UnrealizedGain).delete()
    db.commit()

def load(db: Session, open_lots_by_ticker: Dict[str, List[Dict[str, Any]]], brokerage_name: str = None) -> Dict[str, float]:
    print(f"[unrealized_gain_loader] Starting load for brokerage: {brokerage_name}")

    # Capture the marks we already have before clearing the table. A price fetch
    # can fail for reasons that have nothing to do with the position — a rate
    # limit, a network blip — and rebuilding from scratch would otherwise
    # destroy rows we cannot re-derive. A stale price is wrong by a day; a
    # missing lot is wrong by the whole position.
    last_known: Dict[str, tuple] = {}
    for row in db.query(UnrealizedGain).all():
        key = row.option_symbol or row.ticker
        if key and row.currentPrice:
            last_known[key] = (row.currentPrice, row.prevClose)

    # First, delete existing unrealized gains
    delete(db, brokerage_name)

    unrealized_gains_list = []
    today = datetime.now()
    # prev_close_cache: underlying equity ticker → previous close price
    prev_close_cache: Dict[str, float] = {}

    # Pre-fetch splits for all equity tickers in open lots
    equity_tickers = list({tk for (_, tk), lots in open_lots_by_ticker.items()
                           if lots and not lots[0].get("option_symbol")})
    split_map = build_split_map(db, equity_tickers)

    for (brokerage, ticker), open_lots in open_lots_by_ticker.items():
        if not open_lots:
            continue

        # For options, use OCC symbol for price lookup (e.g. MSFT250117C00400000)
        # Expired options return None from yfinance → treat as $0 (worthless)
        option_symbol = open_lots[0].get("option_symbol") if open_lots else None
        price_ticker = option_symbol if option_symbol else ticker
        current_price, prev_close = get_stock_quote(price_ticker)
        if current_price is None:
            # Only an expiry date in the past proves a contract is worthless.
            # Absence of price data does not — that conflation once marked a
            # live options book to zero during a yfinance rate limit.
            if option_symbol and is_expired_option(option_symbol):
                print(f"[unrealized_gain_loader] Option {option_symbol} expired. Using $0.")
                current_price = 0.0
                prev_close = 0.0
            elif price_ticker in last_known:
                current_price, prev_close = last_known[price_ticker]
                print(f"[unrealized_gain_loader] No price for {price_ticker}; keeping last known mark {current_price}.")
            else:
                # Nothing fetched and nothing on record — dropping is the only
                # option left, but say so loudly rather than failing silently.
                print(f"Warning: no price and no prior mark for {price_ticker} ({brokerage}). Lot omitted.")
                continue
        # Cache previous close keyed by underlying equity ticker (for holding_loader)
        if not option_symbol and prev_close is not None:
            prev_close_cache[ticker] = prev_close

        for raw_lot in open_lots:
            # Lots from realized_gain_loader are already split-normalized — no re-application needed
            lot = raw_lot

            # Ensure lot quantity is positive before processing
            if lot["quantity"] < 1e-6:
                continue

            buy_date_dt = lot["date"]
            if buy_date_dt is None:
                continue

            try:
                diff_days = (today - buy_date_dt).days
                # Long (bought-to-open) options and equities qualify as long-term
                # after 365 days; short (written) options are always short-term.
                is_short_position = lot.get("is_short_position", False)
                is_long_term = (not is_short_position) and diff_days > 365

                m = _multiplier(lot.get("assetType"))
                # For equity, use cost_per_unit as the effective buy price so that
                # option-exercise premiums are included in the cost basis.
                # For options, price is per underlying share; cost_per_unit is per
                # contract (100x), so keep price for options calculations.
                is_options = (lot.get("assetType") or "").lower() == "options"
                buy_price = lot["price"] if is_options else lot.get("cost_per_unit", lot["price"])
                unrealized_gain_value = lot["quantity"] * m * (current_price - buy_price)

                ws_clear_dt = lot.get("wash_sale_clear_date")
                ws_clear_date = ws_clear_dt.date() if ws_clear_dt and hasattr(ws_clear_dt, "date") else ws_clear_dt

                recent_buy_dt = lot.get("wash_sale_recent_buy_date")
                ws_at_risk = bool(recent_buy_dt and unrealized_gain_value < 0)
                ws_risk_trigger = recent_buy_dt.date() if recent_buy_dt and hasattr(recent_buy_dt, "date") else recent_buy_dt

                unrealized_gain = UnrealizedGain(
                    brokerage=lot["brokerage"],
                    account_id=lot.get("account_id"),
                    ticker=underlying_ticker(lot.get("ticker", ticker)),
                    buyDate=buy_date_dt,
                    quantity=lot["quantity"],
                    buyPrice=buy_price,
                    currentPrice=current_price,
                    prevClose=prev_close,
                    unrealizedGain=unrealized_gain_value,
                    isLongTerm=is_long_term,
                    assetType=lot.get("assetType"),
                    wash_sale_adjustment=lot.get("wash_sale_adjustment", 0.0),
                    wash_sale_clear_date=ws_clear_date,
                    wash_sale_at_risk=ws_at_risk,
                    wash_sale_risk_trigger_date=ws_risk_trigger if ws_at_risk else None,
                    option_symbol=option_symbol,
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
    return prev_close_cache
