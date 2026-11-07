import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Mirrors backend/tests/conftest.py's own fix for the same problem: alembic's
# console script does not add the repo root to sys.path the way `python -m`
# does, so `backend.app...` imports fail unless this does it explicitly.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# backend/app/db/schema.py imports backend.app.core.crypto at module load time
# (EncryptedFloat/EncryptedString/EncryptedJSON). crypto.py has zero database
# dependencies and reads no env vars at import time, so this import is
# side-effect-free and safe to do here.
from backend.app.db.schema import Base  # noqa: E402

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DATABASE_URL from the environment, not a hardcoded sqlalchemy.url in
# alembic.ini — this is the one line that makes the same migrations apply to
# local Docker Postgres today and Supabase later without editing alembic.ini.
#
# Deliberately NOT read from .env the way main.py reads app config: Alembic is
# a one-off CLI command a developer runs explicitly with DATABASE_URL exported
# for exactly the target they mean to migrate. Silently falling back to
# whatever happens to be in .env risks migrating the wrong database by
# accident — a missing DATABASE_URL should be loud, not a surprise default.
db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise RuntimeError(
        "DATABASE_URL is not set. Alembic has nothing to target — export it "
        "(e.g. postgresql://postgres:postgres@localhost:5432/wealthcompass_dev) "
        "before running alembic commands."
    )
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
config.set_main_option("sqlalchemy.url", db_url)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


# Offline mode intentionally not implemented — this app only ever runs
# against a live, reachable database (local Docker now, Supabase later);
# there's no SQL-script-handoff workflow to support.
run_migrations_online()
