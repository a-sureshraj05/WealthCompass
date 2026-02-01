from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base
import os

# Assuming schema.py defines Base
# from ..db.schema import Base

# SQLite database URL. For production, you'd use PostgreSQL/MySQL.
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./db/wealthcompass.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False} # Needed for SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# We will import Base from schema.py later in main.py to create tables

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
