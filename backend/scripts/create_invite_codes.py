"""Mint invite codes for registration gating.

Registration requires a valid, unused invite code (see
backend/app/api/auth.py's RegisterRequest.invite_code and
_claim_invite_code) — an empty invite_codes table blocks all signups, so run
this once before the first registration against a fresh database.

Usage:
    python3 -m backend.scripts.create_invite_codes --count 5

No destructive guard needed here, unlike seed_demo.py — this only inserts
new rows, there is nothing to truncate.
"""

import argparse
import secrets
from datetime import datetime

from backend.app.core.database import SessionLocal
from backend.app.db.schema import InviteCode


def create_codes(count: int) -> list:
    db = SessionLocal()
    try:
        codes = [secrets.token_urlsafe(9) for _ in range(count)]
        db.add_all(InviteCode(code=c, created_at=datetime.utcnow()) for c in codes)
        db.commit()
        return codes
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Mint new invite codes.")
    ap.add_argument("--count", type=int, default=1)
    args = ap.parse_args()
    for code in create_codes(args.count):
        print(code)


if __name__ == "__main__":
    main()
