"""Authenticated transaction-history generation for the enabled demo account."""
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.app.api.auth import get_current_user
from backend.app.api.deps import get_user_scope
from backend.app.core import crypto, database, performance_history
from backend.app.core.demo_performance_fixture import complete_demo_ledger
from backend.app.core.runtime_features import performance_demo_for_user
from backend.app.core.scoping import UserScope
from backend.app.db.schema import User

router = APIRouter()


def require_history_user(user: User = Depends(get_current_user)):
    if not performance_demo_for_user(user):
        raise HTTPException(status_code=403, detail="Transaction performance is not enabled for this account.")
    return user


class RebuildRequest(BaseModel):
    opening_cash: Optional[float] = Field(default=None, ge=0, le=1e12, allow_inf_nan=False)
    set_opening_cash: bool = False


@router.post("/performance/demo-sample")
def complete_sample(user: User = Depends(require_history_user), scope: UserScope = Depends(get_user_scope)):
    """Idempotent fixed sample additions; no arbitrary data or account selector."""
    if performance_history.job_status(scope.user_id).get("running"):
        raise HTTPException(status_code=409, detail="Wait for the current history build to finish.")
    try:
        return complete_demo_ledger(scope, user)
    except PermissionError as error:
        scope.db.rollback()
        raise HTTPException(status_code=403, detail=str(error))
    except ValueError as error:
        scope.db.rollback()
        raise HTTPException(status_code=409, detail=str(error))


@router.get("/performance/history")
def history(user: User = Depends(require_history_user), scope: UserScope = Depends(get_user_scope)):
    return performance_history.read_history(scope)


@router.post("/performance/rebuild", status_code=202)
def rebuild(body: RebuildRequest, tasks: BackgroundTasks, user: User = Depends(require_history_user), scope: UserScope = Depends(get_user_scope)):
    dek = crypto.CURRENT_DEK.get()
    if dek is None: raise HTTPException(status_code=401, detail="Sign in again to rebuild your encrypted history.")
    if performance_history.queue_build(scope, body.opening_cash, body.set_opening_cash):
        tasks.add_task(performance_history.build_history, scope.user_id, dek, database.SessionLocal)
    return {"status": "building"}
