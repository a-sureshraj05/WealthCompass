# Centralized asset type normalization.
# Both manual imports and Snaptrade sync use this to ensure consistent values.
#
# To add/change a mapping, update ASSET_TYPE_MAP below.
# Normalized values: "Equity", "ETF", "Options", "Crypto", "Cash", "Other"

ASSET_TYPE_MAP: dict = {
    # Equity
    "equity": "Equity",
    "stock": "Equity",
    "common stock": "Equity",
    "ordinary shares": "Equity",
    "american depositary receipt": "Equity",
    "adr": "Equity",
    "cs": "Equity",

    # ETF / Fund
    "etf": "ETF",
    "exchange traded fund": "ETF",
    "open ended fund": "ETF",
    "mutual fund": "ETF",
    "fund": "ETF",

    # Options
    "options": "Options",
    "option": "Options",
    "derivative": "Options",

    # Crypto
    "crypto": "Crypto",
    "cryptocurrency": "Crypto",
    "digital currency": "Crypto",

    # Cash / Money Market
    "cash": "Cash",
    "money market": "Cash",
    "currency": "Cash",
    "fixed income": "Cash",
    "bond": "Cash",

    # Contributions / transfers (no asset type)
    "contribution": "",
    "transfer": "",
    "dividend": "",
}


def normalize(raw: str) -> str:
    """
    Normalize a raw asset type string to a standard value.
    Returns empty string if unknown or not applicable.
    """
    if not raw:
        return ""
    return ASSET_TYPE_MAP.get(raw.strip().lower(), "Other")
