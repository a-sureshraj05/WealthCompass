import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./db/wealthcompass.db")

# Some hosts (Heroku-style, occasionally Supabase examples) still hand out the
# deprecated `postgres://` scheme. SQLAlchemy 1.4+ rejects it outright.
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# check_same_thread is a SQLite-only DBAPI kwarg — psycopg2's connect() raises
# TypeError if it receives it, so it must not be passed unconditionally.
connect_args = (
    {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
    # Cheap on SQLite; on Postgres it recycles a connection that went stale
    # during an idle period instead of surfacing as a mid-request error.
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
