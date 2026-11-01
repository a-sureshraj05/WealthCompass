# Portfolio performance and SPY comparison

Proposed placement: a full-width module in Overview after AI Insights, before
Today's contributors and allocation. It is currently visible only in the
DEV-only `/design-preview`. Both portfolio and SPY series are simulated; this
is not a historical backtest or live market data.

## Periods and presentation

- Completed calendar years: January 1 through December 31, each year separately.
- Current year: YTD from January 1 through the as-of date, never labeled a full year.
- Trailing 1/3/5 years: the day after the matching prior anniversary through the
  as-of date. For November 1, 2026, 1Y is November 2, 2025–November 1, 2026.
  A nonexistent February 29 anniversary is clamped to February 28 before adding a day.
- Opening valuation: last available value on or before the day preceding the range.
  Show both the requested dates and actual opening/ending valuation dates. Do not
  invent prices on weekends or silently truncate a five-year return to available history.
- The sample is fixed as of November 1, 2026, with its latest valuation on October 30.
- Growth view: cumulative TWR and SPY total return, percentage-point difference,
  and a percent / hypothetical growth-of-$10,000 switch. 3Y/5Y also show annualized returns.
- Calendar view: paired bars and a newest-first table of returns, opening value,
  deposits, withdrawals, investment earnings and ending value. Select a year to
  inspect its growth path and balance bridge.
- SPY stays in the comparison; there is no benchmark-off switch.
- Hide Figures suppresses the chart, return figures and balance reconciliation.
- The mock history covers all sample brokerages. A scope note appears if the
  overview's brokerage filter is active; it does not pretend to filter this fixture.

## Returns and reconciliation

Investment earnings in dollars:

`ending value - opening value - external deposits + external withdrawals`

A sale whose proceeds remain in portfolio cash is not an external withdrawal.
Adding its realized gain again double-counts it. Dividends and interest are
investment income, not fresh contributions. Transfers between included accounts
are internal; a transfer crossing the selected portfolio boundary is external.

Use time-weighted total return (TWR) as the primary SPY comparison, compounding
subperiod returns around external flows. The prototype's complete daily fixture
assumes external flows occur at end of day: `r = (ending - deposits + withdrawals)
/ previous ending - 1`. Live intraday/large flows need valuations at the flow, or
a disclosed approximation such as Modified Dietz where appropriate. Do not label
an approximation as exact TWR. A separate money-weighted/XIRR view can describe
the investor's actual funding experience, with a cash-flow-matched SPY equivalent.

Use SPY total return with distributions reinvested and the same dates/currency.
A normalized $10,000 path is investment growth without contributions, not actual
account wealth. Portfolio return includes cash and account fees, before personal
taxes. A gap in percentage points is not risk-adjusted alpha. A portfolio holding
cash, bonds or options has a different risk profile from SPY.

## Backend work before real results

The current holdings/P&L tables are snapshots and do not provide a complete
historical portfolio value series. This frontend concept does not change the backend.
Production needs:

1. Complete transaction and dated external-flow history, including opening positions,
   closed positions, cash, fees, distributions, security transfers and corporate actions.
2. Historical valuations of every position and cash/liabilities, with consistent FX
   and reliable options valuation where applicable. Reconstructing only today's
   surviving holdings would introduce survivorship bias.
3. Historical SPY total-return data, a real market calendar, and coverage/provenance flags.
4. An API returning explicit requested/valued dates, return methodology, completeness,
   return series, calendar-year rows and the dollar reconciliation for the selected scope.
5. Tests covering flow timing, income versus deposits, internal transfers, splits,
   fees, missing history, market holidays, zero/negative portfolio equity and leap days.

A specific ingestion issue needs review first: `snaptrade.py` currently maps DIV
and DIVIDEND to DEPOSIT and REI to BUY. Original event semantics must be retained
or recovered so investment income cannot be mistaken for external funding.

References:
- https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/
- https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy
