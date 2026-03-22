import os
from datetime import datetime

from snaptrade_client import SnapTrade
from sqlalchemy.orm import Session

from backend.app.db.schema import SnaptradeConnection, SnaptradeTransaction, Transaction as DBTransaction
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


def get_client() -> SnapTrade:
    return SnapTrade(client_id=CLIENT_ID, consumer_key=CONSUMER_KEY)


def get_connect_url(brokerage: str) -> str:
    """Return Snaptrade portal URL for the given brokerage."""
    client = get_client()
    slug = BROKERAGE_SLUG_MAP.get(brokerage)
    body = {"userId": USER_ID, "userSecret": USER_SECRET}
    if slug:
        body["broker"] = slug
    body["immediateRedirect"] = True
    resp = client.authentication.login_snap_trade_user(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET},
        body=body,
    )
    return resp.body.get("redirectURI") or resp.body.get("loginLink", "")


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


def sync(db: Session, start_date: str = None, end_date: str = None, auth_ids: list = None) -> int:
    """Fetch latest connections and transactions from Snaptrade, store in DB."""
    client = get_client()
    total_synced = 0

    # Refresh connections from Snaptrade
    auth_resp = client.connections.list_brokerage_authorizations(
        query_params={"userId": USER_ID, "userSecret": USER_SECRET}
    )
    for auth in auth_resp.body:
        auth_id = auth.get("id") or auth.get("authorization_id")
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
        brokerage_info = account.get("brokerage") or {}
        brokerage_name = brokerage_info.get("name", "Unknown") if isinstance(brokerage_info, dict) else str(brokerage_info)
        account_auth_id = str(account.get("brokerage_authorization", "") or "")
        print(f"[SnapTrade Account] id={account_id} brokerage={brokerage_name} name={account.get('name')} number={account.get('number')} auth_id={account_auth_id}")

        # Skip if caller specified auth_ids and this account isn't in the list
        if auth_ids and account_auth_id not in auth_ids:
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
                if not txn_id:
                    continue

                if db.query(SnaptradeTransaction).filter(
                    SnaptradeTransaction.snaptrade_transaction_id == txn_id
                ).first():
                    continue

                symbol_info = txn.get("symbol") or {}
                ticker = symbol_info.get("symbol") or symbol_info.get("raw_symbol", "UNKNOWN")
                name = symbol_info.get("description", "")
                brokerage_name = txn.get("institution") or brokerage_name
                symbol_type = symbol_info.get("type") or {}
                raw_asset_type = symbol_type.get("description", "") if isinstance(symbol_type, dict) else ""
                asset_type = normalize_asset_type(raw_asset_type, ticker=ticker)

                raw_date = txn.get("trade_date") or txn.get("settlement_date") or ""
                try:
                    date = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d")
                except Exception:
                    date = datetime.now()

                action = str(txn.get("type", "")).upper()
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
                    source="snaptrade",
                    raw_id=db_snaptrade.id,
                ))

                total_synced += 1

            db.commit()
        except Exception as e:
            db.rollback()
            print(f"[snaptrade] Error syncing account {account_id}: {e}")

    return total_synced
