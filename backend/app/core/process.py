from sqlalchemy.orm import Session

from backend.app.db.schema import RealizedGain
from backend.app.db.schema import Transaction as DBTransaction
from backend.app.core.table_loader.ticker_reference_loader import load as ticker_reference_load
from backend.app.core.table_loader.realized_gain_loader import load as realized_gain_load
from backend.app.core.table_loader.unrealized_gain_loader import load as unrealized_gain_load
from backend.app.core.table_loader.holding_loader import load as holding_load

def process_transactions(db: Session, brokerage_name: str = None):
    print(
        f"Processing transactions for brokerage: {brokerage_name if brokerage_name else 'All'}..."
    )

    open_lots = realized_gain_load(db, brokerage_name)
    unrealized_gain_load(db, open_lots, brokerage_name)
    holding_load(db, brokerage_name)
    # ticker_reference_load(db)

    print(f"Finished processing for brokerage: {brokerage_name if brokerage_name else 'All'}.")
