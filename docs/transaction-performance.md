# Transaction-derived performance history

Enabled only for `demouser@gmail.com` on the staging service through the existing
server-side performance feature policy. Production and other accounts cannot
read or queue this service. The signup branch remains separate.

## Storage and refresh

- `historical_prices`: public daily closes, split metadata and SPY adjusted closes.
- `portfolio_daily_values`: encrypted holdings, cash, total equity and external
  flows, unique by signed-in user and trading date.
- `portfolio_performance_state`: encrypted opening-cash setting and diagnostics,
  source-ledger fingerprint and generation timestamp.

The additive Alembic revision is `7d0a241b51ae`. Existing startup `create_all`
also creates the missing tables; the migration tolerates that order.

Overview requests `GET /api/v1/performance/history`. A changed active ledger,
opening cash or completed-day cutoff makes the fingerprint stale. The UI posts
`/api/v1/performance/rebuild`, polls progress and renders persisted history.
Rebuilding uses a separate database session with the authenticated user's DEK;
it atomically replaces only that user's derived rows. No transactions are added
or rewritten. Refresh history retries a failed provider request. The current
single-worker deployment coalesces simultaneous builds for the same user.

## Calculation

Replay all active, nonduplicate transactions, including fully sold securities.
Use recorded execution amounts for cash debits/credits. A full sale needs no
sale-day closing quote: its proceeds remain cash. Partial positions continue
needing prices; reacquisitions create separate price-request windows. Income,
fees and reinvestments are investment activity, while deposits and withdrawals
are external flows. A broker reassignment alone does not change consolidated
holdings or cash. Unsupported transfer/exercise legs require review.

Prices come from Yahoo Finance via yfinance, with `auto_adjust=False`. Yahoo
Close is split-adjusted: restore it to the historical share basis using later
split metadata, then apply splits to ledger quantities on their effective dates.
SPY's adjusted close is a total-return proxy. SPY sessions define the valuation
calendar; no weekend, holiday or missing-position quote is invented. USD only.
Options require their exact OCC identifier and a genuine historical quote.
Historical option availability is limited.

Daily estimated TWR compounds `(closing equity - deposits + withdrawals) /
previous closing equity`. External flows are assumed at end of day; returns can
be inaccurate for material intraday flows. Recorded dividends are included;
unrecorded distributions are not inferred. This is not a certified performance
report. Earnings reconcile as ending minus opening minus deposits plus withdrawals.

A complete contiguous interval, starting at a positive opening close, is needed.
Inception-day performance is excluded when its opening equity is zero. A full
withdrawal or total loss can retain its zero ending value. Never bridge a missing
valuation. The latest complete interval is shown with explicit coverage dates;
YTD, trailing and calendar periods require all expected benchmark-session dates
and their opening valuation. Current-year controls use the latest benchmark
session even if the usable portfolio interval ends earlier.

## Data quality

Missing opening shares, non-USD activity, ambiguous legacy imported deposits,
missing execution amounts and unsupported actions block reconstruction. Negative
cash flags missing funding; subsequent positive calculated cash does not silently
restore accuracy. A statement-supported opening cash balance can be entered and
saved privately, changed or cleared. Margin and short-position valuation require
additional support. Missing option prices never fall back to cost basis, zero or
the design-preview fixture.

The fixed fictional dataset is retained only for the explicit local design
preview. The signed-in staging component always requests transaction history.

## Verification

Ledger/provider tests cover full/partial sales, reacquisition windows, split
restoration, option multipliers, income/reinvestment, account separation,
weekend flows, missing funding/prices and zero ending balances. Persistence tests
check ciphertext and another user's unchanged rows. Cookie API tests exercise
real authenticated background builds, opening-cash persistence and account/environment
gates. Frontend tests verify supplied history, missing-period coverage and hidden
figures. Migration tests exercise both creation orders.
