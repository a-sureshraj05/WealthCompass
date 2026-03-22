import os
from datetime import datetime

from snaptrade_client import SnapTrade
from sqlalchemy.orm import Session

from backend.app.db.schema import SnaptradeConnection, SnaptradeIgnoredAccount, SnaptradeTransaction, Transaction as DBTransaction
from backend.app.core.utils.asset_type import normalize as normalize_asset_type

# --- Snaptrade client setup ---
CLIENT_ID = os.getenv("SNAPTRADE_CLIENT_ID")
CONSUMER_KEY = os.getenv("SNAPTRADE_CONSUMER_KEY")
USER_ID = os.getenv("SNAPTRADE_USER_ID", "wealthcompass-user")
USER_SECRET = os.getenv("SNAPTRADE_USER_SECRET")

BROKERAGE_SLUG_MAP = {
    "Robinhood": "ROBINHOOD",
    "Schwab": "SCHWAB",
    "Fidelity": "FIDELITY",
    "Other": None,
}

# Brokerage + action combinations that should be treated as cash (ticker=CASH, assetType=Cash)
CASH_ACTION_MAP: dict[str, set[str]] = {
    "Robinhood": {"WITHDRAWAL", "CONTRIBUTION", "DEPOSIT", "FEE"},
}


def _build_occ_symbol(option_symbol) -> str:
    """Extract OCC option ticker from SnapTrade option_symbol dict. Returns '' if data is missing.
    SnapTrade's 'ticker' field is already the OCC symbol (e.g. 'NFLX  280616C00090000').
    We strip spaces so yfinance can look it up (e.g. 'NFLX280616C00090000').
    """
    if not option_symbol:
        return ""
    raw_ticker = option_symbol.get("ticker", "") if isinstance(option_symbol, dict) else getattr(option_symbol, "ticker", "")
    occ = raw_ticker.replace(" ", "")
    print(f"[OCC] raw_ticker={raw_ticker!r} → occ={occ!r}")
    return occ


def get_client() -> SnapTrade:
    return SnapTrade(client_id=CLIENT_ID, consumer_key=CONSUMER_KEY)


def _extract_auth_id(brokerage_authorization) -> str:
    """Extract authorization ID whether the field is a string, dict, or object."""
    if not brokerage_authorization:
        return ""
    if isinstance(brokerage_authorization, dict):
        return str(brokerage_authorization.get("id", ""))
    if hasattr(brokerage_authorization, "id"):
        return str(brokerage_authorization.id)
    return str(brokerage_authorization)


def _build_auth_brokerage_map(client) -> dict:
    """Build a map of authorization_id → brokerage name."""
    auth_resp = client.connections.list_brokerage_authorizations(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )
    auth_map = {}
    for auth in auth_resp.body:
        auth_id = _extract_auth_id(auth.get("id") or auth.get("authorization_id"))
        brokerage_info = auth.get("brokerage") or {}
        brokerage_name = brokerage_info.get("name", "Unknown") if isinstance(brokerage_info, dict) else str(brokerage_info)
        print(f"[SnapTrade Auth] id={auth_id} brokerage={brokerage_name}")
        auth_map[auth_id] = brokerage_name
    return auth_map


def get_connect_url(brokerage: str) -> str:
    """Return Snaptrade portal URL for the given brokerage."""
    client = get_client()
    slug = BROKERAGE_SLUG_MAP.get(brokerage)
    body = {"userId": USER_ID, "userSecret": USER_SECRET}
    if slug:
        body["broker"] = slug
    resp = client.authentication.login_snap_trade_user(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET},
        body=body,
    )
    return resp.body.get("redirectURI") or resp.body.get("loginLink", "")


def ignore_account(account_id: str, db: Session) -> None:
    """Add an account to the ignore list."""
    if not db.query(SnaptradeIgnoredAccount).filter(SnaptradeIgnoredAccount.account_id == account_id).first():
        db.add(SnaptradeIgnoredAccount(account_id=account_id))
        db.commit()


def get_accounts(db: Session) -> list:
    """Return list of user accounts from Snaptrade API, excluding ignored accounts."""
    ignored_ids = {row.account_id for row in db.query(SnaptradeIgnoredAccount).all()}
    client = get_client()
    auth_brokerage_map = _build_auth_brokerage_map(client)

    resp = client.account_information.list_user_accounts(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )
    result = []
    for account in resp.body:
        account_id = account.get("id")
        if account_id in ignored_ids:
            continue
        auth_id = _extract_auth_id(account.get("brokerage_authorization"))
        brokerage_name = auth_brokerage_map.get(auth_id, "Unknown")
        account_name = account.get("name", "") or ""
        # Strip brokerage name prefix from account name (e.g. E*TRADE prefixes all accounts)
        if account_name.upper().startswith(brokerage_name.upper()):
            account_name = account_name[len(brokerage_name):].strip(" -–:")

        result.append({
            "id": account.get("id"),
            "name": account_name,
            "brokerage": brokerage_name,
            "authorization_id": auth_id,
        })
    return result


def get_connections(db: Session) -> list:
    """Return list of connected brokerages directly from Snaptrade API."""
    client = get_client()
    resp = client.connections.list_brokerage_authorizations(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )
    result = []
    for i, auth in enumerate(resp.body):
        brokerage_info = auth.get("brokerage") or {}
        brokerage_name = brokerage_info.get("name", "Unknown") if isinstance(brokerage_info, dict) else str(brokerage_info)
        result.append({"id": i + 1, "brokerage": brokerage_name, "authorization_id": auth.get("id", "")})
    return result


def delete_connection(authorization_id: str, db: Session) -> None:
    """Delete a brokerage connection from Snaptrade and local DB."""
    client = get_client()
    # Remove from Snaptrade
    client.connections.remove_brokerage_authorization(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET},
        path_params={"authorizationId": authorization_id},
    )
    # Remove from local DB if present
    row = db.query(SnaptradeConnection).filter(
        SnaptradeConnection.authorization_id == authorization_id
    ).first()
    if row:
        db.delete(row)
        db.commit()


def sync(db: Session, start_date: str = None, end_date: str = None, account_ids: list = None) -> int:
    """Fetch latest connections and transactions from Snaptrade, store in DB."""
    client = get_client()
    total_synced = 0
    ignored_ids = {row.account_id for row in db.query(SnaptradeIgnoredAccount).all()}

    # Refresh connections from Snaptrade and build auth → brokerage map
    auth_brokerage_map = _build_auth_brokerage_map(client)
    auth_resp = client.connections.list_brokerage_authorizations(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )
    for auth in auth_resp.body:
        auth_id = _extract_auth_id(auth.get("id") or auth.get("authorization_id"))
        brokerage_info = auth.get("brokerage") or {}
        brokerage_name = brokerage_info.get("name", "Unknown") if isinstance(brokerage_info, dict) else str(brokerage_info)
        brokerage_slug = brokerage_info.get("slug", "") if isinstance(brokerage_info, dict) else ""

        existing = db.query(SnaptradeConnection).filter(
            SnaptradeConnection.authorization_id == auth_id
        ).first()
        if not existing:
            db.add(SnaptradeConnection(
                brokerage=brokerage_name,
                brokerage_slug=brokerage_slug,
                authorization_id=auth_id,
                account_id="",
            ))
    db.commit()

    # Fetch transactions for all accounts
    accounts_resp = client.account_information.list_user_accounts(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )

    for account in accounts_resp.body:
        account_id = account.get("id")
        account_auth_id = _extract_auth_id(account.get("brokerage_authorization"))
        brokerage_name = auth_brokerage_map.get(account_auth_id, "Unknown")
        print(f"[SnapTrade Account] id={account_id} brokerage={brokerage_name} name={account.get('name')} auth_id={account_auth_id}")

        # Skip ignored accounts
        if account_id in ignored_ids:
            continue

        # Skip if caller specified account_ids and this account isn't in the list
        if account_ids and account_id not in account_ids:
            continue

        try:
            query_params = {
                "userId": USER_ID,
                "userSecret": USER_SECRET,
                "accounts": account_id,
            }
            if start_date:
                query_params["startDate"] = start_date
            if end_date:
                query_params["endDate"] = end_date

            txn_resp = client.transactions_and_reporting.get_activities(
                query_params=query_params
            )

            for txn in txn_resp.body:
                txn_id = str(txn.get("id", ""))
                symbol_info = txn.get("symbol") or {}
                raw_ticker = symbol_info.get("symbol") or symbol_info.get("raw_symbol", "")
                raw_symbol_type = (txn.get("symbol") or {}).get("type") or {}
                raw_symbol_type_desc = raw_symbol_type.get("description", "") if isinstance(raw_symbol_type, dict) else str(raw_symbol_type)
                print(f"[SnapTrade Txn] id={txn_id} type={txn.get('type')} ticker={raw_ticker} symbol_type={raw_symbol_type_desc!r} option_type={txn.get('option_type')!r} option_symbol={txn.get('option_symbol')!r} date={txn.get('trade_date')} amount={txn.get('amount')} units={txn.get('units')}")

                if not txn_id:
                    continue

                if db.query(SnaptradeTransaction).filter(
                    SnaptradeTransaction.snaptrade_transaction_id == txn_id
                ).first():
                    continue

                action = str(txn.get("type", "")).upper()

                symbol_info = txn.get("symbol") or {}
                is_cash_action = action in CASH_ACTION_MAP.get(brokerage_name, set())
                ticker = "CASH" if is_cash_action else (symbol_info.get("symbol") or symbol_info.get("raw_symbol", "UNKNOWN"))
                name = symbol_info.get("description", "")
                brokerage_name = txn.get("institution") or brokerage_name
                symbol_type = symbol_info.get("type") or {}
                raw_asset_type = symbol_type.get("description", "") if isinstance(symbol_type, dict) else ""

                # Detect options via option_symbol / option_type fields (more reliable than symbol type description)
                raw_option_symbol = txn.get("option_symbol")
                option_type = txn.get("option_type")
                is_option = bool(raw_option_symbol or option_type)
                occ_symbol = _build_occ_symbol(raw_option_symbol) if is_option else ""

                if is_cash_action:
                    asset_type = "Cash"
                elif is_option:
                    asset_type = "Options"
                else:
                    asset_type = normalize_asset_type(raw_asset_type, ticker=ticker)

                raw_date = txn.get("trade_date") or txn.get("settlement_date") or ""
                try:
                    date = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d")
                except Exception:
                    date = datetime.now()
                quantity = float(txn.get("units") or 0)
                price = float(txn.get("price") or 0)
                amount = float(txn.get("amount") or 0)
                currency = txn.get("currency", {}).get("code", "USD") if isinstance(txn.get("currency"), dict) else "USD"

                db_snaptrade = SnaptradeTransaction(
                    authorization_id=str(txn.get("brokerage_authorization", "")),
                    brokerage=brokerage_name,
                    date=date,
                    ticker=ticker,
                    name=name,
                    action=action,
                    quantity=abs(quantity),
                    price=price,
                    amount=abs(amount),
                    currency=currency,
                    assetType=asset_type,
                    option_symbol=occ_symbol or None,
                    snaptrade_transaction_id=txn_id,
                )
                db.add(db_snaptrade)
                db.flush()  # Get db_snaptrade.id before inserting transaction

                # Also insert into unified Transaction table
                db.add(DBTransaction(
                    brokerage=brokerage_name,
                    date=date,
                    ticker=ticker,
                    name=name,
                    action=action,
                    quantity=abs(quantity),
                    price=price,
                    costPerShare=price,
                    totalCost=abs(amount),
                    assetType=asset_type,
                    option_symbol=occ_symbol or None,
                    source="snaptrade",
                    raw_id=db_snaptrade.id,
                ))

                total_synced += 1

            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[snaptrade] Error syncing account {account_id}: {e}")

    return total_synced
