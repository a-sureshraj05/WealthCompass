"""AI portfolio insights — builds a privacy-scaled digest and asks Claude about it.

Three rules govern this module.

**Never send dollar amounts.** The digest describes the portfolio in percentages
and ratios only: `AAPL 23.2% of portfolio, +91.0%`. Anthropic can already
attribute a request to the billing account, so the protection that matters is
that the *content* never reveals net worth. The UI still shows real figures — it
has them locally and never needed the model to repeat them.

**The digest is built server-side from the database**, not from whatever the
client posts. A handler that analysed client-supplied holdings would be trusting
the browser for the numbers, and would let one user ask about figures that are
not theirs.

**The result is cached, not regenerated per view.** Generation is triggered by an
explicit click and stored on `portfolio_summary.insights_json`, alongside the
existing `analyst_json` and `buying_power_json` caches. On the public demo that
is what bounds cost: every visitor sees the same fabricated portfolio, so the
first click pays for the call and everyone after reads the stored text until the
next reset clears it.
"""

import json
import os
from typing import Any, Dict, List, Optional

MODEL = os.getenv("WC_INSIGHTS_MODEL", "claude-sonnet-5")

# Summarising a digest whose numbers are already computed — the judgment is in
# the framing, not in deriving figures. Overridable because the right setting is
# workload-specific and worth tuning against real output.
EFFORT = os.getenv("WC_INSIGHTS_EFFORT", "medium")

# The answer is a handful of short observations. A low ceiling doubles as the
# per-call cost bound if every other guard somehow fails.
MAX_TOKENS = int(os.getenv("WC_INSIGHTS_MAX_TOKENS", "1024"))

SYSTEM_PROMPT = """You are a portfolio analyst reading a summary of someone's holdings.

Everything you are given is expressed as percentages and ratios — never dollar
amounts. That is deliberate. Do not ask for absolute values, and do not speculate
about how large the portfolio is. Reason entirely in relative terms.

Write 3 to 5 observations, each on its own line, each a single sentence. No
bullet characters, no numbering, no headings — the interface renders each line as
its own card.

Say what the composition actually shows: concentration in a single position,
sector or brokerage clustering, the spread between the best and worst performers,
how much of the portfolio a few names account for. Be specific and quantitative,
citing the percentages you were given.

Do not give buy, sell, or hold advice, and do not predict prices. Describe what
the data shows, not what the person should do about it. Where something is
notable, say it plainly rather than softening it into "consider reviewing"
language that carries no information."""


class InsightsUnavailable(Exception):
    """Insights cannot be produced. The message is shown to the user verbatim."""


def _sector_map(analyst_json: Optional[str]) -> Dict[str, str]:
    """ticker → sector, from the cached analyst payload.

    Holdings carry no sector of their own; the frontend patches it in from this
    same cache. Absent or malformed cache just means sectors are omitted from the
    digest — it is enrichment, not a requirement.
    """
    if not analyst_json:
        return {}
    try:
        rows = json.loads(analyst_json)
    except (ValueError, TypeError):
        return {}
    if not isinstance(rows, list):
        return {}
    out = {}
    for row in rows:
        if isinstance(row, dict) and row.get("ticker") and row.get("sector"):
            out[row["ticker"]] = row["sector"]
    return out


def build_digest(
    holdings: List[Any],
    sectors: Optional[Dict[str, str]] = None,
    realized: Optional[List[Any]] = None,
) -> Optional[Dict]:
    """Scale holdings into percentages. Returns None when there is nothing to say."""
    sectors = sectors or {}

    priced = [h for h in holdings if (h.marketValue or 0.0) > 0]
    if not priced:
        return None

    total = sum(h.marketValue or 0.0 for h in priced)
    if total <= 0:
        return None

    positions = []
    for h in priced:
        market_value = h.marketValue or 0.0
        cost = h.totalCost or 0.0
        # Return on what was paid. Meaningless without a basis, so omitted rather
        # than reported as 0% — a transferred-in lot with no recorded basis would
        # otherwise read as a flat position.
        gain_pct = ((market_value - cost) / cost * 100) if cost > 0 else None

        positions.append({
            "ticker": h.ticker,
            "brokerage": h.brokerage,
            "sector": sectors.get(h.ticker, "Unknown"),
            "asset_type": h.assetType or "Equity",
            "portfolio_pct": round(market_value / total * 100, 1),
            "gain_pct": round(gain_pct, 1) if gain_pct is not None else None,
        })

    positions.sort(key=lambda p: -p["portfolio_pct"])

    total_cost = sum(h.totalCost or 0.0 for h in priced)
    overall_gain_pct = (
        round((total - total_cost) / total_cost * 100, 1) if total_cost > 0 else None
    )

    by_brokerage: Dict[str, float] = {}
    by_sector: Dict[str, float] = {}
    for p in positions:
        by_brokerage[p["brokerage"]] = by_brokerage.get(p["brokerage"], 0.0) + p["portfolio_pct"]
        by_sector[p["sector"]] = by_sector.get(p["sector"], 0.0) + p["portfolio_pct"]

    digest: Dict[str, Any] = {
        "position_count": len(positions),
        "overall_gain_pct": overall_gain_pct,
        "largest_position_pct": positions[0]["portfolio_pct"],
        "top_five_concentration_pct": round(
            sum(p["portfolio_pct"] for p in positions[:5]), 1),
        "by_brokerage_pct": {k: round(v, 1) for k, v in
                             sorted(by_brokerage.items(), key=lambda kv: -kv[1])},
        "by_sector_pct": {k: round(v, 1) for k, v in
                          sorted(by_sector.items(), key=lambda kv: -kv[1])},
        "positions": positions,
    }

    # Realized history as counts and ratios only — how many closed lots, and how
    # they split by tax character. Never the amounts.
    if realized:
        long_term = sum(1 for r in realized if r.isLongTerm)
        winners = sum(1 for r in realized if (r.gain or 0) > 0)
        digest["realized"] = {
            "closed_lot_count": len(realized),
            "long_term_pct": round(long_term / len(realized) * 100, 1),
            "profitable_pct": round(winners / len(realized) * 100, 1),
        }

    return digest


def generate(digest: Dict) -> str:
    """Ask Claude to interpret the digest. Returns newline-separated observations."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise InsightsUnavailable(
            "AI insights are not configured on this instance."
        )

    try:
        import anthropic
    except ImportError:
        raise InsightsUnavailable(
            "AI insights are unavailable — the anthropic package is not installed."
        )

    client = anthropic.Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={"effort": EFFORT},
            messages=[{
                "role": "user",
                "content": ("Here is the portfolio, in percentages:\n\n"
                            + json.dumps(digest, indent=2)),
            }],
        )
    except anthropic.APIStatusError as exc:
        # Distinguish the two the operator can actually act on; everything else
        # is a generic message with the detail left to the server log.
        if exc.status_code == 401:
            raise InsightsUnavailable("The configured API key was rejected.")
        if exc.status_code == 429:
            raise InsightsUnavailable("Rate limited by the AI service — try again shortly.")
        raise InsightsUnavailable(f"The AI service returned an error ({exc.status_code}).")
    except anthropic.APIConnectionError:
        raise InsightsUnavailable("Could not reach the AI service.")

    # A refusal is HTTP 200 with empty or partial content, so indexing content[0]
    # unconditionally would raise here instead of producing a readable message.
    if response.stop_reason == "refusal":
        raise InsightsUnavailable("The AI service declined to analyse this portfolio.")

    text = "\n".join(
        block.text for block in response.content if block.type == "text"
    ).strip()

    if not text:
        raise InsightsUnavailable("The AI service returned an empty response.")

    return text
