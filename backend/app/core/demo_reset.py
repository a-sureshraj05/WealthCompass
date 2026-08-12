"""Boot-time seeding and periodic reset for the hosted demo instance.

Only ever active when WC_DEMO_MODE=true. Every path here ultimately calls
`backend.scripts.seed_demo.seed()`, which runs its own three fail-closed guards
— so nothing in this module can reach a database the CLI would have refused.

Why in-process rather than a scheduled machine
----------------------------------------------
The original plan called for a separate scheduled Fly machine, on the grounds
that an app restart mid-reset could leave the demo half-seeded. That reasoning
assumed a persistent shared database. The hosted instance instead keeps SQLite
on the container's ephemeral filesystem, so a restart *is* a full re-seed and
there is no lasting state to corrupt. A separate machine would also have its own
filesystem and could not reach this one's database at all.
"""

import logging
import os
import shutil
import threading
import time
from pathlib import Path

logger = logging.getLogger(__name__)

DEMO_MODE = os.getenv("WC_DEMO_MODE", "").lower() == "true"
# 0 disables the loop and leaves boot-time seeding in place — useful locally,
# where `./server.sh demo` wants a stable database to poke at.
RESET_MINUTES = int(os.getenv("WC_DEMO_RESET_MINUTES", "60"))

# Set by the Dockerfile to the database baked at build time. Absent locally,
# where seeding live is fine and there is no cold start to optimise for.
TEMPLATE_DB = os.getenv("WC_DEMO_TEMPLATE_DB", "")


def _seed() -> None:
    from backend.scripts.seed_demo import seed

    seed(assume_yes=True)


def _target_db_path() -> str:
    """Filesystem path behind DATABASE_URL, or '' if it is not a SQLite file."""
    url = os.getenv("DATABASE_URL", "")
    if not url.startswith("sqlite"):
        return ""
    return url.split("///")[-1] if "///" in url else ""


def _restore_from_template() -> bool:
    """Copy the baked database into place. Returns False if unavailable.

    A file copy rather than a re-seed because this runs on the cold-start path,
    where the platform has already made the visitor wait to wake the container.
    Copying is instant and needs no network; seeding costs ~6s and depends on
    Yahoo Finance answering.
    """
    if not TEMPLATE_DB or not Path(TEMPLATE_DB).is_file():
        return False

    target = _target_db_path()
    if not target:
        return False

    # Guard parity with seed_demo: this writes a database file, so it must be
    # incapable of landing on the real one for exactly the same reasons.
    if "wealthcompass.db" in target:
        logger.error("[demo] refusing to restore over %s", target)
        return False

    Path(target).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(TEMPLATE_DB, target)

    # main.py's create_all() has already opened this file and left a pooled
    # connection behind. copyfile truncates and rewrites the same inode, so that
    # connection now refers to a file whose contents changed underneath it —
    # SQLite caches page data per connection and would serve stale or corrupt
    # reads. Dropping the pool forces every subsequent request to reopen.
    from backend.app.core.database import engine

    engine.dispose()

    logger.info("[demo] restored from baked template → %s", target)
    return True


def seed_if_empty() -> None:
    """Seed at startup when the database has no users.

    The container filesystem starts empty on every boot, so in the cloud this
    always fires. Locally it is a no-op against an already-seeded demo.db, which
    is why it checks rather than truncating unconditionally.
    """
    if not DEMO_MODE:
        return

    from backend.app.core.database import SessionLocal
    from backend.app.db.schema import User

    db = SessionLocal()
    try:
        if db.query(User).first() is not None:
            logger.info("[demo] users already present — skipping boot seed")
            return
    finally:
        db.close()

    logger.info("[demo] empty database — restoring")
    try:
        # Baked template first; it is instant and offline. Falling back to a live
        # seed covers local runs and any image built without one.
        if _restore_from_template():
            return
        logger.info("[demo] no baked template — seeding live")
        _seed()
    except SystemExit as exc:
        # A guard refused. Surface it loudly: booting a demo instance with no
        # data is a broken demo, and the message says which guard tripped.
        logger.error("[demo] boot seed refused: %s", exc)
    except Exception:
        logger.exception("[demo] boot seed failed")


def start_reset_loop() -> None:
    """Re-seed on a fixed interval, in a daemon thread.

    Daemon so it never holds up shutdown. Exceptions are caught and logged
    rather than propagated — a failed reset should leave the previous demo data
    in place and try again next interval, not kill the thread and silently stop
    resetting for the life of the machine.
    """
    if not DEMO_MODE or RESET_MINUTES <= 0:
        return

    interval = RESET_MINUTES * 60

    def loop() -> None:
        while True:
            time.sleep(interval)
            logger.info("[demo] periodic reset starting")
            try:
                _seed()
                logger.info("[demo] periodic reset complete")
            except Exception:
                logger.exception("[demo] periodic reset failed; keeping current data")

    threading.Thread(target=loop, daemon=True, name="demo-reset").start()
    logger.info("[demo] reset loop started — every %d min", RESET_MINUTES)
