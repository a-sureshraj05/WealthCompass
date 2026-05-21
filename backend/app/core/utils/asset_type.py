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
    "equity option": "Options",
    "listed option": "Options",
    "call option": "Options",
    "put option": "Options",
    "non_standard_option": "Options",
    "index option": "Options",
    "security type is not defined": "Options",

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

# Ticker-based overrides — takes precedence over asset type string
TICKER_OVERRIDES: dict = {
    # Portfolio-specific overrides (tickers misclassified by the data provider)
    "RVI": "ETF",

    # Fidelity money market funds
    "SPAXX": "Cash",
    "FDRXX": "Cash",
    "FZFXX": "Cash",
    "FCASH": "Cash",
    # Vanguard money market funds
    "VMFXX": "Cash",
    "VUSXX": "Cash",
    "VMRXX": "Cash",
    # Schwab money market funds
    "SWVXX": "Cash",
    "SNSXX": "Cash",
}


def normalize(raw: str, ticker: str = "") -> str:
    """
    Normalize a raw asset type string to a standard value.
    Ticker-based overrides take precedence over asset type string.
    Returns empty string if unknown or not applicable.
    """
    if ticker and ticker.upper() in TICKER_OVERRIDES:
        return TICKER_OVERRIDES[ticker.upper()]
    if not raw:
        return ""
    return ASSET_TYPE_MAP.get(raw.strip().lower(), "Other")
