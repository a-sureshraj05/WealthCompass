from sqlalchemy import Boolean, Column, Date, DateTime, Float, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Transaction(Base):
    __tablename__ = "transactions"

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
    source = Column(String)


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
    ticker = Column(String, index=True)
    quantity = Column(Float)
    averageCostPerShare = Column(Float)
    totalCost = Column(Float)
    currentPrice = Column(Float)
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


class UnrealizedGain(Base):
    __tablename__ = "unrealized_gains"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)
    ticker = Column(String)
    buyDate = Column(DateTime)
    quantity = Column(Float)
    buyPrice = Column(Float)
    currentPrice = Column(Float)
    unrealizedGain = Column(Float)
    isLongTerm = Column(Boolean)
    assetType = Column(String)


class TickerReference(Base):
    __tablename__ = "ticker_references"

    ticker = Column(String, primary_key=True, index=True)
    first_addition_date = Column(Date)
    price = Column(Float)


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)           # e.g. "Robinhood", "Schwab"
    access_token = Column(String, unique=True)
    item_id = Column(String, unique=True) # Plaid's item ID


class PlaidTransaction(Base):
    __tablename__ = "plaid_transactions"

    id = Column(Integer, primary_key=True, index=True)
    plaid_item_id = Column(Integer, index=True)  # FK to PlaidItem.id
    brokerage = Column(String)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)              # buy / sell
    quantity = Column(Float)
    price = Column(Float)
    amount = Column(Float)               # total value (quantity * price)
    assetType = Column(String)           # equity, etf, etc.
    plaid_transaction_id = Column(String, unique=True)  # Plaid's own ID (prevents duplicates)


class SnaptradeConnection(Base):
    __tablename__ = "snaptrade_connections"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String)               # e.g. "Robinhood"
    brokerage_slug = Column(String)          # e.g. "ROBINHOOD"
    authorization_id = Column(String, unique=True)  # Snaptrade's auth ID
    account_id = Column(String)              # Snaptrade account ID


class SnaptradeTransaction(Base):
    __tablename__ = "snaptrade_transactions"

    id = Column(Integer, primary_key=True, index=True)
    authorization_id = Column(String, index=True)
    brokerage = Column(String)
    date = Column(DateTime)
    ticker = Column(String)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    amount = Column(Float)
    currency = Column(String)
    assetType = Column(String)
    snaptrade_transaction_id = Column(String, unique=True)  # prevents duplicates