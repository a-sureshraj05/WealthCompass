import json
import os
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.db.schema import Holding, UnrealizedGain, RealizedGain
from backend.app.api.auth import get_current_user

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


def _build_portfolio_context(db: Session) -> str:
    holdings = db.query(Holding).all()
    unrealized = db.query(UnrealizedGain).all()
    realized = db.query(RealizedGain).all()

    lines = ["# User Portfolio Summary\n"]

    # Holdings
    if holdings:
        lines.append("## Current Holdings")
        total_market_value = sum(h.marketValue or 0 for h in holdings)
        total_cost = sum(h.totalCost or 0 for h in holdings)
        lines.append(f"Total Market Value: ${total_market_value:,.2f}")
        lines.append(f"Total Cost Basis: ${total_cost:,.2f}")
        lines.append(f"Total Unrealized Gain: ${total_market_value - total_cost:,.2f}\n")
        lines.append("| Brokerage | Ticker | Qty | Avg Cost | Current Price | Market Value | Asset Type |")
        lines.append("|---|---|---|---|---|---|---|")
        for h in sorted(holdings, key=lambda x: (x.assetType or "", x.ticker)):
            lines.append(
                f"| {h.brokerage} | {h.ticker} | {h.quantity:.4g} | "
                f"${h.averageCostPerShare:.2f} | ${h.currentPrice:.2f} | "
                f"${h.marketValue:.2f} | {h.assetType or 'Equity'} |"
            )
        lines.append("")

    # Unrealized gains summary by ticker
    if unrealized:
        lines.append("## Unrealized Gains/Losses")
        by_ticker: dict = {}
        for u in unrealized:
            key = (u.brokerage, u.ticker)
            by_ticker.setdefault(key, {"gain": 0.0, "lt": 0.0, "st": 0.0})
            gain = u.unrealizedGain or 0.0
            by_ticker[key]["gain"] += gain
            if u.isLongTerm:
                by_ticker[key]["lt"] += gain
            else:
                by_ticker[key]["st"] += gain
        lines.append("| Brokerage | Ticker | Total Unrealized | Long Term | Short Term |")
        lines.append("|---|---|---|---|---|")
        for (brokerage, ticker), v in sorted(by_ticker.items()):
            lines.append(
                f"| {brokerage} | {ticker} | ${v['gain']:,.2f} | ${v['lt']:,.2f} | ${v['st']:,.2f} |"
            )
        lines.append("")

    # Realized gains summary by year
    if realized:
        lines.append("## Realized Gains/Losses")
        by_year: dict = {}
        for r in realized:
            year = r.sellDate.year if r.sellDate else "Unknown"
            by_year.setdefault(year, {"lt": 0.0, "st": 0.0})
            gain = r.gain or 0.0
            if r.isLongTerm:
                by_year[year]["lt"] += gain
            else:
                by_year[year]["st"] += gain
        lines.append("| Year | Long Term | Short Term | Net |")
        lines.append("|---|---|---|---|")
        for year in sorted(by_year.keys()):
            v = by_year[year]
            lines.append(f"| {year} | ${v['lt']:,.2f} | ${v['st']:,.2f} | ${v['lt']+v['st']:,.2f} |")
        lines.append("")

    return "\n".join(lines)


SYSTEM_PROMPT = """You are a helpful financial assistant for WealthCompass, a personal portfolio tracker.
You have access to the user's actual portfolio data provided below. Use it to give specific,
accurate answers about their holdings, gains, losses, and tax implications.

Be concise and direct. Format numbers as currency where appropriate.
If asked about tax advice, remind the user to consult a tax professional for official advice.

{portfolio_context}"""


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db), _=Depends(get_current_user)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file to enable chat."
        )

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed. Run: pip install anthropic")

    portfolio_context = _build_portfolio_context(db)
    system = SYSTEM_PROMPT.format(portfolio_context=portfolio_context)

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=system,
        messages=[{"role": m.role, "content": m.content} for m in payload.messages],
    )

    return ChatResponse(reply=response.content[0].text)


INSIGHTS_PROMPT = """You are a financial analyst reviewing a user's investment portfolio.
Analyze the portfolio data below and return ONLY a valid JSON array of insights.
Each insight must have these fields:
  - "category": one of "concentration", "tax", "performance", "options", "action"
  - "type": one of "warning", "positive", "info", "negative"
  - "title": short title (4-6 words)
  - "message": specific, data-driven insight (1-2 sentences, use real numbers from the data)

Rules:
- Return 5-7 insights total, covering different categories
- Be specific — use actual tickers, dollar amounts, and percentages from the data
- For tax insights, flag short-term gains that could be avoided and tax-loss harvesting opportunities
- For concentration, flag if any single ticker or sector > 30% of portfolio
- For options, mention expiry risk or positions with large unrealized losses
- For action, give one concrete suggestion
- Do NOT include markdown, explanation, or anything outside the JSON array

Today's date: {today}

{portfolio_context}"""


class InsightItem(BaseModel):
    category: str
    type: str
    title: str
    message: str


class InsightsResponse(BaseModel):
    insights: List[InsightItem]


@router.get("/insights", response_model=InsightsResponse)
def get_insights(db: Session = Depends(get_db), _=Depends(get_current_user)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured. Add it to your .env file to enable AI insights."
        )

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed. Run: pip install anthropic")

    portfolio_context = _build_portfolio_context(db)
    prompt = INSIGHTS_PROMPT.format(
        today=datetime.now().strftime("%Y-%m-%d"),
        portfolio_context=portfolio_context,
    )

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        items = json.loads(raw)
        return InsightsResponse(insights=[InsightItem(**i) for i in items])
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse insights from AI response")
