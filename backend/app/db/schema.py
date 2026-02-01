from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Transaction(Base):
    __tablename__ = 'transactions'

    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime)
    ticker = Column(String)
    type = Column(String)
    quantity = Column(Float)
    price = Column(Float)
    brokerage = Column(String)

class Holding(Base):
    __tablename__ = 'holdings'

    id = Column(Integer, primary_key=True, index=True)
    brokerage = Column(String, index=True)
    date = Column(DateTime)
    ticker = Column(String, index=True)
    name = Column(String)
    action = Column(String)
    quantity = Column(Float)
    costPerShare = Column(Float)
    totalCost = Column(Float)
