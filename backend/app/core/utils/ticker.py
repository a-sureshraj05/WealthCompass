import re

_OCC_RE = re.compile(r'^([A-Z]{1,6})\d{6}[CP]\d{8}$')

def underlying_ticker(ticker: str) -> str:
    """Return the underlying equity symbol from an OCC option symbol.
    E.g. 'META280121C00610000' → 'META'. Pass-through for plain tickers."""
    m = _OCC_RE.match(ticker or "")
    return m.group(1) if m else ticker
