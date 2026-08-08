"""Shared FastAPI dependencies.

`get_user_scope` is the intended way for a route to reach portfolio data. It
resolves the signed-in user and hands back a UserScope bound to them, so a
handler cannot accidentally operate unscoped: there is no code path that
produces a scope without a user.

Lives here rather than in core/ because it depends on the auth layer, and core
should not import from api.
"""

from fastapi import Depends
from sqlalchemy.orm import Session

from backend.app.api.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope
from backend.app.db.schema import User


def get_user_scope(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserScope:
    """A data view bound to the signed-in user."""
    return UserScope(db, current_user.id)
