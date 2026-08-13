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
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

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

When holding-period data is present and something there is genuinely notable — a
sizeable position days away from long-term treatment, or an unusually large share
still short-term — it is worth one of your observations. Do not spend one on it
when nothing is close.

Write plain text and never mention the data's structure: no field or section
names, no markdown, no bullet characters. Each line is rendered verbatim as its
own card, so any syntax you add shows up literally.

Do not give buy, sell, or hold advice, and do not predict prices. Describe what
the data shows, not what the person should do about it. Where something is
notable, say it plainly rather than softening it into "consider reviewing"
language that carries no information."""


CHAT_SYSTEM_PROMPT = """You are helping someone understand their own investment portfolio.

Their portfolio is given below as percentages and ratios — never dollar amounts.
That is deliberate. Do not ask for absolute values and do not speculate about how
much the portfolio is worth. If asked directly what something is worth, say you
only have relative figures; the interface shows them the real numbers alongside
this conversation.

Answer from the data you were given. Be specific and cite the percentages. When a
question cannot be answered from this digest — anything needing cost basis in
dollars, or market data you were not given — say so plainly instead of guessing.

Tax timing is covered when holding-period data is present: the share already
long-term, and for each still-short-term lot how long it has been held, how many
days remain, and the date it converts. Answer those questions directly. The same
ticker can appear as several lots bought at different times, each converting on
its own date, and a written option never converts regardless of the calendar.

Never mention the data's structure. No field or section names, no "the digest
says", no "I have/don't have that field". The person cannot see any of it and
those names mean nothing to them — write as though you simply know their
portfolio. When something genuinely is not available, say what is missing in
their terms ("I don't have purchase prices"), not which key is absent.

Write plain text. The panel renders exactly what you send, so markdown syntax
appears literally: no **bold**, no ## headings, no tables, no backticks. For
several items, one short line each is ideal — a dash and a plain sentence.
Leading with the answer beats leading with a list.

Tax questions deserve real analysis, not a referral. When asked about harvesting
losses, offsetting this year's gains, or the cost of selling something, do the
arithmetic and lay out the consequences concretely: which lots are at a loss,
what share of the year's realized gains they would offset, whether a loss is
short- or long-term, and whether any wash-sale window blocks it. Compare the
options and say which is mechanically more efficient and why.

Weigh timing too. A position days away from long-term treatment is more expensive
to sell now than shortly after, and a lot's size relative to the portfolio decides
whether selling it materially changes the concentration picture. Say so.

What you cannot know is their tax bracket, income, other accounts, and goals — so
frame conclusions as what the numbers favour, not as instruction. Say it once, at
the end, in a single clause; do not open with a disclaimer or repeat it. Never
predict prices.

You do not have dollar amounts, so you cannot say how many shares make up a given
sum. Convert the other way instead: give the position's share of the portfolio and
let them map it to the figure they have in mind.

Keep answers short — a few sentences unless genuinely more is needed. This is a
side panel, not a document."""


class InsightsUnavailable(Exception):
    """Insights cannot be produced. The message is shown to the user verbatim."""


def fingerprint(holdings: List[Any], realized_count: int = 0,
                long_term_lots: int = 0) -> str:
    """Identify the portfolio a cached insight describes, so staleness is detectable.

    Deliberately built from data that does **not** move with price: which
    positions exist, at which brokerage, in what quantity, plus how many lots are
    closed and how many have crossed into long-term. Trading, importing, syncing
    or resetting changes those; a quote tick does not.

    An earlier version hashed rounded percentages, on the theory that coarse
    buckets would absorb drift. They do not. Every position's weight is a share
    of the same total, so a fraction-of-a-percent move in the largest holding
    nudges all of them, and it only takes one sitting near a rounding boundary to
    flip the hash. Measured: a 0.2% tick invalidated the cache. Coarser buckets
    move the boundaries without removing them — the fix is to not depend on
    prices at all.

    The cost of that choice: a large price move alone will not trigger a refresh.
    That is the right trade for a composition summary, and the button is still
    there for anyone who disagrees in the moment.
    """
    import hashlib

    structure = {
        "positions": sorted(
            (h.ticker, h.brokerage, h.assetType or "Equity",
             # Rounded only to absorb float representation noise, not real change.
             round(h.quantity or 0.0, 6))
            for h in holdings
        ),
        "closed_lots": realized_count,
        # A lot crossing into long-term changes the tax answer with no trade and
        # no price move, so the calendar has to be part of the identity.
        "long_term_lots": long_term_lots,
    }
    return hashlib.sha256(
        json.dumps(structure, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]


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


#: A lot is long-term once held *more* than 365 days, matching
#: unrealized_gain_loader's `diff_days > 365`. Duplicating the threshold here
#: rather than importing it keeps this module free of loader imports, but the two
#: must agree — a mismatch would have the chat contradict the Holdings table.
LONG_TERM_DAYS = 365

#: Shares per option contract. Options are quoted per underlying share, so a
#: lot's value is quantity x price x this. Mirrors the loaders.
OPTION_CONTRACT_SIZE = 100


def _lot_value(lot: Any) -> float:
    """Market value of one open lot.

    Options are quoted per underlying share while quantity counts contracts, so a
    contract is worth 100x the quoted price — the same multiplier the loaders
    apply. Without it an options lot is understated a hundredfold: it rounds to
    0.0% of the portfolio and the long/short-term split stops summing to 100.
    """
    quantity = lot.quantity or 0.0
    price = lot.currentPrice or 0.0
    asset_type = (lot.assetType or "Equity").lower()
    multiplier = OPTION_CONTRACT_SIZE if asset_type == "options" else 1
    return abs(quantity * price) * multiplier


def _holding_periods(open_lots: List[Any]) -> Optional[Dict]:
    """When short-term lots convert to long-term.

    Dates are not dollar amounts, so this stays inside the privacy model: it says
    *when* something was bought and what share of the portfolio it represents,
    never what it cost or is worth.

    Percentages are taken against the lots' own total rather than the holdings
    total. Both are rebuilt by the same recompute and should agree, but keying
    off the holdings figure means any drift between the two tables silently
    produces a long/short split that does not sum to 100 — a number the model
    would then repeat with confidence. Normalising within the section makes it
    self-consistent by construction.
    """
    if not open_lots:
        return None

    priced = [(lot, _lot_value(lot)) for lot in open_lots]
    priced = [(lot, value) for lot, value in priced if value > 0]
    if not priced:
        return None

    total_value = sum(value for _, value in priced)
    if total_value <= 0:
        return None

    today = datetime.now()
    upcoming = []
    long_term_value = 0.0
    short_term_value = 0.0

    for lot, value in priced:
        if lot.isLongTerm:
            long_term_value += value
            continue

        short_term_value += value

        # A written (short) option has no holding period to run — it is
        # short-term whatever the calendar says. Reporting a countdown for one
        # would be wrong, not merely unhelpful.
        buy_date = getattr(lot, "buyDate", None)
        if (lot.quantity or 0.0) < 0 or buy_date is None:
            continue

        days_held = (today - buy_date).days
        days_remaining = (LONG_TERM_DAYS + 1) - days_held
        if days_remaining < 0:
            continue  # loader will reclassify on next recompute

        upcoming.append({
            "ticker": lot.ticker,
            "brokerage": lot.brokerage,
            "asset_type": lot.assetType or "Equity",
            "portfolio_pct": round(value / total_value * 100, 1),
            "days_held": days_held,
            "days_until_long_term": days_remaining,
            "becomes_long_term_on":
                (buy_date + timedelta(days=LONG_TERM_DAYS + 1)).strftime("%Y-%m-%d"),
        })

    upcoming.sort(key=lambda lot: lot["days_until_long_term"])

    return {
        "note": (
            "A lot becomes long-term after more than 365 days held. "
            "`upcoming` lists only lots that are still short-term, soonest first."
        ),
        "long_term_pct_of_portfolio": round(long_term_value / total_value * 100, 1),
        "short_term_pct_of_portfolio": round(short_term_value / total_value * 100, 1),
        "upcoming": upcoming[:20],
    }


def _tax_position(
    realized: List[Any],
    open_lots: List[Any],
    total_value: float,
    year: Optional[int] = None,
) -> Optional[Dict]:
    """This tax year's booked gains, and the open losses that could offset them.

    Everything is expressed as a percentage of portfolio value — including the
    realized figures. That common denominator is what makes the section useful
    without dollars: a loss and a gain measured against the same base can be
    compared directly, so "this loss covers most of that gain" is answerable
    while neither number reveals what the portfolio is worth.

    Short- and long-term are kept apart because they are taxed differently and
    losses offset their own character first. Wash-sale flags ride along, since a
    loss that cannot currently be claimed is not really harvestable.
    """
    if total_value <= 0:
        return None

    year = year or datetime.now().year
    pct = lambda amount: round(amount / total_value * 100, 2)

    booked_short = 0.0
    booked_long = 0.0
    disallowed = 0.0
    for row in realized or []:
        sell_date = getattr(row, "sellDate", None)
        if sell_date is None or sell_date.year != year:
            continue
        gain = row.gain or 0.0
        if row.isLongTerm:
            booked_long += gain
        else:
            booked_short += gain
        disallowed += getattr(row, "wash_sale_disallowed_amount", 0.0) or 0.0

    harvestable = []
    for lot in open_lots or []:
        unrealized = lot.unrealizedGain or 0.0
        if unrealized >= 0:
            continue
        value = _lot_value(lot)
        cost = value - unrealized  # what it would have been worth flat
        harvestable.append({
            "ticker": lot.ticker,
            "brokerage": lot.brokerage,
            "asset_type": lot.assetType or "Equity",
            "term": "long" if lot.isLongTerm else "short",
            "portfolio_pct": round(value / total_value * 100, 1),
            "loss_pct_of_position": round(unrealized / cost * 100, 1) if cost > 0 else None,
            "loss_pct_of_portfolio": pct(abs(unrealized)),
            # A loss inside its wash-sale window cannot be claimed now — the date
            # is when it becomes claimable again.
            "wash_sale_blocked": bool(getattr(lot, "wash_sale_at_risk", False)),
            "wash_sale_clear_date": (
                lot.wash_sale_clear_date.strftime("%Y-%m-%d")
                if getattr(lot, "wash_sale_clear_date", None) else None
            ),
        })

    harvestable.sort(key=lambda lot: -lot["loss_pct_of_portfolio"])

    if not harvestable and not booked_short and not booked_long:
        return None

    claimable = sum(
        lot["loss_pct_of_portfolio"] for lot in harvestable if not lot["wash_sale_blocked"]
    )
    net_booked = pct(booked_short + booked_long)

    return {
        "note": (
            "All figures are percentages of current portfolio value, so gains and "
            "losses can be compared directly. Losses offset gains of their own "
            "character first (short against short, long against long) before "
            "crossing over. A wash-sale-blocked loss cannot be claimed until its "
            "clear date."
        ),
        "tax_year": year,
        "realized_short_term_pct_of_portfolio": pct(booked_short),
        "realized_long_term_pct_of_portfolio": pct(booked_long),
        "realized_net_pct_of_portfolio": net_booked,
        "wash_sale_disallowed_pct_of_portfolio": pct(disallowed) if disallowed else 0.0,
        "claimable_loss_pct_of_portfolio": round(claimable, 2),
        # The single number the "can I neutralise this year's gains" question
        # turns on. None when nothing was booked — there is nothing to offset.
        "claimable_losses_cover_pct_of_realized_gain": (
            round(claimable / net_booked * 100, 1)
            if net_booked > 0 and claimable > 0 else None
        ),
        "harvestable_losses": harvestable,
    }


def build_digest(
    holdings: List[Any],
    sectors: Optional[Dict[str, str]] = None,
    realized: Optional[List[Any]] = None,
    open_lots: Optional[List[Any]] = None,
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
            # Omitted rather than sent as "Unknown": a placeholder is something
            # the model has to notice, interpret, and then explain to the user
            # ("sector data isn't itemized beyond Unknown"), which is worse than
            # the field simply not being there.
            **({"sector": sectors[h.ticker]} if sectors.get(h.ticker) else {}),
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
        if p.get("sector"):
            by_sector[p["sector"]] = by_sector.get(p["sector"], 0.0) + p["portfolio_pct"]

    digest: Dict[str, Any] = {
        "position_count": len(positions),
        "overall_gain_pct": overall_gain_pct,
        "largest_position_pct": positions[0]["portfolio_pct"],
        "top_five_concentration_pct": round(
            sum(p["portfolio_pct"] for p in positions[:5]), 1),
        "by_brokerage_pct": {k: round(v, 1) for k, v in
                             sorted(by_brokerage.items(), key=lambda kv: -kv[1])},
        # Absent entirely when no sector is known — see the note above.
        **({"by_sector_pct": {k: round(v, 1) for k, v in
                              sorted(by_sector.items(), key=lambda kv: -kv[1])}}
           if by_sector else {}),
        "positions": positions,
    }

    periods = _holding_periods(open_lots or [])
    if periods:
        digest["holding_periods"] = periods

    tax = _tax_position(realized or [], open_lots or [], total)
    if tax:
        digest["tax_position"] = tax

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
        # Always log the provider's own message. Collapsing it to a status code
        # hides the one thing that says what to do — a 400 here is far more
        # often "no credit balance" than a malformed request, and the operator
        # cannot tell those apart from the number alone.
        detail = getattr(exc, "message", "") or str(exc)
        logger.warning("[insights] provider %s: %s", exc.status_code, detail)

        if exc.status_code == 401:
            raise InsightsUnavailable("The configured API key was rejected.")
        if exc.status_code == 429:
            raise InsightsUnavailable("Rate limited by the AI service — try again shortly.")
        if "credit balance" in detail.lower():
            # Deliberately vague to the visitor. On the public demo the reader is
            # a stranger, and "the owner is out of credit" is not their business —
            # the actionable version is in the server log above.
            raise InsightsUnavailable(
                "AI insights are temporarily unavailable. Please try again later."
            )
        raise InsightsUnavailable(
            f"The AI service rejected the request ({exc.status_code}). "
            "Details are in the server log."
        )
    except anthropic.APIConnectionError as exc:
        logger.warning("[insights] connection failure: %s", exc)
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


def chat(digest: Dict, messages: List[Dict[str, str]]) -> str:
    """Answer a question about the digest, given prior conversation turns.

    `messages` is the client's conversation — this feature is deliberately
    stateless server-side, per the design decision not to persist chat. The
    caller is responsible for having already bounded its length; unbounded
    history is the main way a chat feature's cost runs away.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise InsightsUnavailable("AI chat is not configured on this instance.")

    try:
        import anthropic
    except ImportError:
        raise InsightsUnavailable(
            "AI chat is unavailable — the anthropic package is not installed."
        )

    client = anthropic.Anthropic(api_key=api_key)

    # The portfolio rides in the system prompt rather than as a user turn: it is
    # context, not something the person said, and keeping it out of the
    # conversation means a later turn cannot appear to have "quoted" it.
    system = (
        CHAT_SYSTEM_PROMPT
        + "\n\nThe portfolio, in percentages:\n\n"
        + json.dumps(digest, indent=2)
    )

    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            thinking={"type": "adaptive"},
            output_config={"effort": EFFORT},
            messages=messages,
        )
    except anthropic.APIStatusError as exc:
        detail = getattr(exc, "message", "") or str(exc)
        logger.warning("[chat] provider %s: %s", exc.status_code, detail)
        if exc.status_code == 401:
            raise InsightsUnavailable("The configured API key was rejected.")
        if exc.status_code == 429:
            raise InsightsUnavailable("Rate limited by the AI service — try again shortly.")
        if "credit balance" in detail.lower():
            raise InsightsUnavailable(
                "AI chat is temporarily unavailable. Please try again later."
            )
        raise InsightsUnavailable(
            f"The AI service rejected the request ({exc.status_code}). "
            "Details are in the server log."
        )
    except anthropic.APIConnectionError as exc:
        logger.warning("[chat] connection failure: %s", exc)
        raise InsightsUnavailable("Could not reach the AI service.")

    if response.stop_reason == "refusal":
        raise InsightsUnavailable("The AI service declined to answer that.")

    text = "\n".join(
        block.text for block in response.content if block.type == "text"
    ).strip()

    if not text:
        raise InsightsUnavailable("The AI service returned an empty response.")

    return text
