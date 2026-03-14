import os
from datetime import datetime

import plaid
from fastapi import APIRouter, Depends, HTTPException
from plaid.api import plaid_api
from plaid.model.country_code import CountryCode
from plaid.model.investments_transactions_get_request import InvestmentsTransactionsGetRequest
from plaid.model.investments_transactions_get_request_options import InvestmentsTransactionsGetRequestOptions
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.db.schema import PlaidItem, PlaidTransaction

router = APIRouter()

# --- Plaid client setup ---
PLAID_ENV = os.getenv("PLAID_ENV", "sandbox")
PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID")
PLAID_SECRET = os.getenv("PLAID_SECRET")

env_map = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

configuration = plaid.Configuration(
    host=env_map[PLAID_ENV],
    api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
)
api_client = plaid.ApiClient(configuration)
client = plaid_api.PlaidApi(api_client)


# --- Request/Response models ---
class ExchangeTokenRequest(BaseModel):
    public_token: str
    brokerage: str


# --- Endpoints ---

@router.post("/create-link-token")
def create_link_token():
    """Generate a link token to initialize Plaid Link on the frontend."""
    try:
        request = LinkTokenCreateRequest(
            products=[Products("investments")],
            client_name="WealthCompass",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id="wealthcompass-user"),
        )
        response = client.link_token_create(request)
        return {"link_token": response["link_token"]}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=str(e.body))


@router.post("/exchange-token")
def exchange_token(body: ExchangeTokenRequest, db: Session = Depends(get_db)):
    """Exchange public token for access token and store it."""
    try:
        exchange_request = ItemPublicTokenExchangeRequest(public_token=body.public_token)
        response = client.item_public_token_exchange(exchange_request)

        access_token = response["access_token"]
        item_id = response["item_id"]

        # Store or update the PlaidItem (deduplicate by brokerage name)
        existing = db.query(PlaidItem).filter(PlaidItem.brokerage == body.brokerage).first()
        if existing:
            existing.access_token = access_token
            existing.item_id = item_id
        else:
            db.add(PlaidItem(
                brokerage=body.brokerage,
                access_token=access_token,
                item_id=item_id,
            ))
        db.commit()
        return {"message": f"Successfully connected {body.brokerage}"}
    except plaid.ApiException as e:
        raise HTTPException(status_code=400, detail=str(e.body))


@router.post("/sync")
def sync_plaid_transactions(db: Session = Depends(get_db)):
    """Fetch latest investment transactions from all connected brokerages."""
    items = db.query(PlaidItem).all()
    if not items:
        raise HTTPException(status_code=404, detail="No connected brokerages found.")

    total_synced = 0

    for item in items:
        try:
            request = InvestmentsTransactionsGetRequest(
                access_token=item.access_token,
                start_date=datetime(2000, 1, 1).date(),
                end_date=datetime.now().date(),
                options=InvestmentsTransactionsGetRequestOptions(count=500),
            )
            response = client.investments_transactions_get(request)
            investment_txns = response.investment_transactions
            securities = {s.security_id: s for s in response.securities}

            for txn in investment_txns:
                # Skip duplicates
                if db.query(PlaidTransaction).filter(
                    PlaidTransaction.plaid_transaction_id == txn.investment_transaction_id
                ).first():
                    continue

                security = securities.get(txn.security_id)
                ticker = (getattr(security, "ticker_symbol", None) or getattr(security, "name", "UNKNOWN")) if security else "UNKNOWN"

                db.add(PlaidTransaction(
                    plaid_item_id=item.id,
                    brokerage=item.brokerage,
                    date=datetime.strptime(str(txn.date), "%Y-%m-%d"),
                    ticker=ticker,
                    name=getattr(security, "name", "") if security else "",
                    action=str(txn.type),
                    quantity=abs(txn.quantity or 0),
                    price=txn.price or 0,
                    amount=abs(txn.amount or 0),
                    assetType=getattr(security, "type", "") if security else "",
                    plaid_transaction_id=txn.investment_transaction_id,
                ))
                total_synced += 1

            db.commit()

        except plaid.ApiException as e:
            db.rollback()
            print(f"[plaid] Error syncing {item.brokerage}: {e.body}")

    return {"message": f"Synced {total_synced} new transactions."}


@router.get("/connected-brokerages")
def get_connected_brokerages(db: Session = Depends(get_db)):
    """Return list of connected brokerages."""
    items = db.query(PlaidItem).all()
    return [{"id": i.id, "brokerage": i.brokerage} for i in items]


@router.get("/transactions")
def get_plaid_transactions(db: Session = Depends(get_db)):
    """Return all Plaid transactions."""
    return db.query(PlaidTransaction).order_by(PlaidTransaction.date.desc()).all()
