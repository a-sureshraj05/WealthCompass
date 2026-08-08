"""Cross-device UI preferences.

Column order used to live in each browser's localStorage, which meant the Mac
and the phone kept independent copies that could never agree. These are stored
on portfolio_summary alongside the other cached JSON blobs so both devices read
the same row.

Deliberately schemaless: the backend stores whatever key/value pairs the client
sends. Adding a preference is a frontend-only change.
"""

import json
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.api.deps import get_user_scope
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.db.schema import PortfolioSummary

logger = logging.getLogger(__name__)
router = APIRouter()


class PreferencesPayload(BaseModel):
    preferences: Dict[str, Any]


def _load(db: Session) -> Dict[str, Any]:
    summary = scope.query(PortfolioSummary).first()
    if not summary or not summary.ui_prefs_json:
        return {}
    try:
        value = json.loads(summary.ui_prefs_json)
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        # Corrupt blob shouldn't break page load — preferences are cosmetic.
        logger.warning("ui_prefs_json is not valid JSON; ignoring")
        return {}


@router.get("/preferences", response_model=PreferencesPayload)
def get_preferences(db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    return PreferencesPayload(preferences=_load(db))


@router.put("/preferences", response_model=PreferencesPayload)
def update_preferences(payload: PreferencesPayload, db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Merge the supplied keys into the stored blob.

    A merge rather than a replace: two devices touching different preferences
    shouldn't clobber each other, and a client that only knows about column
    order shouldn't wipe a setting added later.
    """
    merged = {**_load(db), **payload.preferences}
    blob = json.dumps(merged)

    summary = scope.query(PortfolioSummary).first()
    if summary:
        summary.ui_prefs_json = blob
    else:
        scope.add(PortfolioSummary(ui_prefs_json=blob))
    db.commit()

    return PreferencesPayload(preferences=merged)
