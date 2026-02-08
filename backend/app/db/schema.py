from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String
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


class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String, index=True)
    date = Column(DateTime)
    ticker = Column(String, index=True)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    costPerShare = Column(Float)
    totalCost = Column(Float)


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
