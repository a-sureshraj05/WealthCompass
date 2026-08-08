"""User scoping — the single seam through which portfolio data is reached.

Two rules, and they exist because both failure modes are silent:

  * a **read** that forgets its filter shows one user another user's portfolio;
  * a **write** that forgets its stamp files someone's trade under the wrong
    account, where it will quietly distort their cost basis forever.

Neither raises an error on its own, so the fix cannot be "remember to filter".
`UserScope` makes the filter and the stamp the default behaviour of the call
you were going to make anyway, and refuses to construct itself without a user.

    scope = UserScope(db, user.id)
    rows  = scope.query(Transaction).all()        # user_id filter applied
    scope.add(Transaction(...))                   # user_id stamped

The raw `db.query(Transaction)` / `db.add(...)` path still exists — SQLAlchemy
is not taken away — but anything reaching portfolio data through it is a review
finding, and `user_id` being NOT NULL with no default turns a forgotten stamp
into an IntegrityError at flush rather than a wrong number a year later.
"""

from typing import Any, Iterable

from sqlalchemy.orm import Query, Session

from backend.app.db.schema import USER_SCOPED_MODELS

_SCOPED = set(USER_SCOPED_MODELS)


class UserScope:
    """A session view bound to exactly one user."""

    __slots__ = ("db", "user_id")

    def __init__(self, db: Session, user_id: int):
        # Falsy covers None and 0 alike. There is no "no user" mode: code that
        # cannot name a user has no business reaching portfolio data.
        if not user_id:
            raise ValueError("UserScope requires a user_id — refusing to run unscoped.")
        self.db = db
        self.user_id = user_id

    # --- reads ---------------------------------------------------------------

    def query(self, *entities: Any) -> Query:
        """`db.query(...)` with the user filter applied to every scoped entity."""
        q = self.db.query(*entities)
        for entity in entities:
            if entity in _SCOPED:
                q = q.filter(entity.user_id == self.user_id)
        return q

    def filter_for(self, query: Query, model: Any) -> Query:
        """Apply the user filter to a query built elsewhere."""
        return query.filter(model.user_id == self.user_id) if model in _SCOPED else query

    # --- writes --------------------------------------------------------------

    def add(self, obj: Any) -> Any:
        """`db.add()` with user_id stamped on scoped models."""
        self._stamp(obj)
        self.db.add(obj)
        return obj

    def add_all(self, objs: Iterable[Any]) -> None:
        objs = list(objs)
        for obj in objs:
            self._stamp(obj)
        self.db.add_all(objs)

    def _stamp(self, obj: Any) -> None:
        if type(obj) in _SCOPED:
            # Overwrite rather than defaulting: an object arriving with someone
            # else's id is a bug, and honouring it would be the leak itself.
            obj.user_id = self.user_id

    # --- deletes -------------------------------------------------------------

    def delete_all(self, model: Any, **filters: Any) -> int:
        """Bulk-delete this user's rows of `model`.

        The loaders rebuild derived tables by clearing them first. Unscoped,
        that clear wipes every user's holdings and gains — which is why this is
        the one delete path they are allowed to use.
        """
        if model not in _SCOPED:
            raise ValueError(f"{model.__name__} is not user-scoped; delete it explicitly.")
        q = self.db.query(model).filter(model.user_id == self.user_id)
        for column, value in filters.items():
            if value is not None:
                q = q.filter(getattr(model, column) == value)
        return q.delete(synchronize_session=False)

    def __repr__(self) -> str:
        return f"<UserScope user_id={self.user_id}>"


def get_scope(db: Session, user: Any) -> UserScope:
    """Build a scope from an authenticated user."""
    return UserScope(db, getattr(user, "id", None))
