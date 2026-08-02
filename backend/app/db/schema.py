from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    costPerShare = Column(Float)
    totalCost = Column(Float)
    assetType = Column(String)
    source = Column(String)
    raw_id = Column(Integer, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False, server_default="0")
    is_override = Column(Boolean, default=False, nullable=False, server_default="0")
    is_duplicate = Column(Boolean, default=False, nullable=False, server_default="0")
    # Manually set only — never written by any loader, sync, or automated process.
    # Set exclusively via PATCH /transactions/{id}/verify when working with Claude.
    is_backend_verified = Column(Boolean, default=False, nullable=False, server_default="0")
    current_brokerage = Column(String, nullable=True)  # set when shares transferred to another brokerage
    original_values = Column(String, nullable=True)
    option_symbol = Column(String, nullable=True)  # OCC option symbol e.g. MSFT250117C00400000


class ManualRawTransaction(Base):
    __tablename__ = "manual_raw_transactions"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    costPerShare = Column(Float)
    totalCost = Column(Float)
    assetType = Column(String)


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String, index=True)
    account_id = Column(Integer, nullable=True)
    ticker = Column(String, index=True)
    quantity = Column(Float)
    averageCostPerShare = Column(Float)
    totalCost = Column(Float)
    currentPrice = Column(Float)
    previousClose = Column(Float, default=0.0)
    marketValue = Column(Float)
    assetType = Column(String)


class RealizedGain(Base):
    __tablename__ = "realized_gains"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)
    ticker = Column(String)
    buyDate = Column(DateTime)
    sellDate = Column(DateTime)
    quantity = Column(Float)
    buyPrice = Column(Float)
    sellPrice = Column(Float)
    gain = Column(Float)
    isLongTerm = Column(Boolean)
    assetType = Column(String)
    is_wash_sale = Column(Boolean, default=False, nullable=False, server_default="0")
    wash_sale_disallowed_amount = Column(Float, default=0.0, nullable=False, server_default="0")


class UnrealizedGain(Base):
    __tablename__ = "unrealized_gains"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    ticker = Column(String)
    buyDate = Column(DateTime)
    quantity = Column(Float)
    buyPrice = Column(Float)
    currentPrice = Column(Float)
    prevClose = Column(Float, nullable=True)
    unrealizedGain = Column(Float)
    isLongTerm = Column(Boolean)
    assetType = Column(String)
    # Type 1: this lot absorbed a disallowed wash sale loss
    wash_sale_adjustment = Column(Float, default=0.0, nullable=False, server_default="0")
    wash_sale_clear_date = Column(Date, nullable=True)   # safe-to-sell-at-loss date
    # Type 2: selling this lot at a loss today would be disallowed
    wash_sale_at_risk = Column(Boolean, default=False, nullable=False, server_default="0")
    wash_sale_risk_trigger_date = Column(Date, nullable=True)  # the recent buy causing the risk
    option_symbol = Column(String, nullable=True)


class OptionsRetain(Base):
    __tablename__ = "options_retain"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String, nullable=False)
    ticker = Column(String, nullable=False)
    buy_date = Column(DateTime, nullable=False)
    retain_quantity = Column(Float, nullable=False, default=0)

    __table_args__ = (UniqueConstraint("brokerage", "ticker", "buy_date", name="uq_options_retain"),)


class PortfolioSummary(Base):
    """Single-row cache of precomputed/fetched portfolio stats."""
    __tablename__ = "portfolio_summary"

    id = Column(Integer, primary_key=True, default=1)
    cash_balance = Column(Float, default=0.0)
    buying_power_json = Column(String, nullable=True)  # JSON: {brokerage: amount}
    analyst_json = Column(String, nullable=True)       # JSON: [AnalystData, ...]
    # JSON: {key: value} — UI preferences that should follow the user between
    # devices rather than living in one browser's localStorage.
    ui_prefs_json = Column(String, nullable=True)


class TickerReference(Base):
    __tablename__ = "ticker_references"

    ticker = Column(String, primary_key=True, index=True)
    first_addition_date = Column(Date)
    price = Column(Float)



class BrokerageAccount(Base):
    """One row per brokerage account — the authoritative name reference."""
    __tablename__ = "brokerage_accounts"

    id = Column(Integer, primary_key=True, index=True)
    snaptrade_account_id = Column(String, unique=True, nullable=False)
    brokerage = Column(String, nullable=False)
    name = Column(String, nullable=False)


class SnaptradeConnection(Base):
    __tablename__ = "snaptrade_connections"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)               # e.g. "Robinhood"
    brokerage_slug = Column(String)          # e.g. "ROBINHOOD"
    authorization_id = Column(String, unique=True)  # Snaptrade's auth ID
    account_id = Column(String)              # Snaptrade account ID


class SnaptradeIgnoredAccount(Base):
    __tablename__ = "snaptrade_ignored_accounts"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, unique=True, nullable=False)


class StockSplit(Base):
    """Stock split events used to adjust historical buy lot quantities and prices."""
    __tablename__ = "stock_splits"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    split_date = Column(DateTime, nullable=False)
    numerator = Column(Float, nullable=False)    # e.g. 20 for a 20:1 split
    denominator = Column(Float, nullable=False)  # e.g.  1 for a 20:1 split

    __table_args__ = (UniqueConstraint("ticker", "split_date", name="uq_stock_split"),)


class TransactionSplitConfig(Base):
    """Persists user-defined splits on a raw transaction so they survive resets."""
    __tablename__ = "transaction_split_configs"

    id = Column(Integer, primary_key=True, index=True)
    raw_id = Column(Integer, nullable=False, index=True)
    source = Column(String, nullable=False)  # 'manual' | 'snaptrade'
    # JSON list: [{"qty": float, "current_brokerage": str|null}, ...]
    # Sum of qty == original raw quantity. Order preserved on replay.
    pieces = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("raw_id", "source", name="uq_split_config"),)


class LotAssignment(Base):
    """Explicit mapping of a sell transaction to a specific buy transaction lot."""
    __tablename__ = "lot_assignments"

    id = Column(Integer, primary_key=True, index=True)
    sell_transaction_id = Column(Integer, nullable=False, index=True)
    buy_transaction_id = Column(Integer, nullable=False, index=True)
    quantity = Column(Float, nullable=False)


class SnaptradeTransaction(Base):
    __tablename__ = "snaptrade_transactions"

    id = Column(Integer, primary_key=True, index=True)
    authorization_id = Column(String, index=True)
    brokerage = Column(String)
    account_id = Column(Integer, nullable=True)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    amount = Column(Float)
    currency = Column(String)
    assetType = Column(String)
    option_symbol = Column(String, nullable=True)  # OCC option symbol e.g. MSFT250117C00400000
    snaptrade_transaction_id = Column(String, unique=True)  # prevents duplicates