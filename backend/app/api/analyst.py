from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import yfinance as yf

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


@router.post("/analyst/batch", response_model=List[AnalystData])
def get_analyst_data_batch(tickers: List[str]):
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
    return results
