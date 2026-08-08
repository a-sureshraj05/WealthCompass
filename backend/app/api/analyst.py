import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import yfinance as yf

from backend.app.api.deps import get_user_scope
from backend.app.core.database import get_db
from backend.app.core.scoping import UserScope

router = APIRouter()


class AnalystData(BaseModel):
    ticker: str
    currentPrice: Optional[float] = None
    targetLow: Optional[float] = None
    targetHigh: Optional[float] = None
    targetMedian: Optional[float] = None
    targetMean: Optional[float] = None
    analystCount: Optional[int] = None
    recommendation: Optional[str] = None
    sector: Optional[str] = None


@router.get("/analyst/{ticker}", response_model=AnalystData)
def get_analyst_data(ticker: str):
    try:
        info = yf.Ticker(ticker).info
        return AnalystData(
            ticker=ticker.upper(),
            currentPrice=info.get("currentPrice"),
            targetLow=info.get("targetLowPrice"),
            targetHigh=info.get("targetHighPrice"),
            targetMedian=info.get("targetMedianPrice"),
            targetMean=info.get("targetMeanPrice"),
            analystCount=info.get("numberOfAnalystOpinions"),
            recommendation=info.get("recommendationKey"),
            sector=info.get("sector"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch analyst data for {ticker}: {str(e)}")


@router.get("/analyst/cached", response_model=List[AnalystData])
def get_analyst_cached(db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    """Return last cached analyst data — instant, no yfinance call."""
    from backend.app.db.schema import PortfolioSummary
    summary = scope.query(PortfolioSummary).first()
    if summary and summary.analyst_json:
        return json.loads(summary.analyst_json)
    return []


@router.post("/analyst/batch", response_model=List[AnalystData])
def get_analyst_data_batch(tickers: List[str], db: Session = Depends(get_db),
    scope: UserScope = Depends(get_user_scope)):
    results = []
    for ticker in tickers:
        try:
            info = yf.Ticker(ticker).info
            results.append(AnalystData(
                ticker=ticker.upper(),
                currentPrice=info.get("currentPrice"),
                targetLow=info.get("targetLowPrice"),
                targetHigh=info.get("targetHighPrice"),
                targetMedian=info.get("targetMedianPrice"),
                targetMean=info.get("targetMeanPrice"),
                analystCount=info.get("numberOfAnalystOpinions"),
                recommendation=info.get("recommendationKey"),
                sector=info.get("sector"),
            ))
        except Exception:
            results.append(AnalystData(ticker=ticker.upper()))
    # Cache result in DB
    from backend.app.db.schema import PortfolioSummary
    summary = scope.query(PortfolioSummary).first()
    payload = json.dumps([r.dict() for r in results])
    if summary:
        summary.analyst_json = payload
    else:
        scope.add(PortfolioSummary(analyst_json=payload))
    db.commit()
    return results
