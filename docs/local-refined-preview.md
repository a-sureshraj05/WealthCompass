# Refined frontend comparison (local only)

Design version: **V3 staging candidate 1**, saved as `ui-v3-rc-1`.
The earlier `ui-v3-draft-1` and `ui-v3-draft-2` checkpoints remain fixed.
This candidate enables the approved layout in authenticated staging; it is not deployed.
Branch: `design/local-portfolio-studio`, based on V2 (`ui-v2`) after PR #22.
See the [UI version registry](ui-versions.md) for all saved designs.
The design prototype makes no live account writes or schema changes. The newest
news work adds an authenticated backend news endpoint; nothing is deployed.
The separate signup branch is not included.

Start from `frontend/`:

```sh
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

- Current layout: http://127.0.0.1:5180/design-preview
- Refined layout: http://127.0.0.1:5180/design-preview?design=refined
- 100 mixed assets: http://127.0.0.1:5180/design-preview?design=refined&portfolio=100-mixed
- Performance: http://127.0.0.1:5180/design-preview?design=refined&section=performance
- AI Insights: http://127.0.0.1:5180/design-preview?design=refined&section=insights

Keep the familiar five main destinations and existing table workflows. The
refined presentation uses neutral surfaces, a larger portfolio card with three
separate metric shortcuts, a
quieter sidebar and lighter panel/filter styling. Overview separates Snapshot,
Performance and AI Insights instead of stacking long sections. The section tabs
support arrow keys, Home and End. Both presentations use the existing fictional
preview dataset and isolated API adapter; neither needs a backend or login.
The portfolio selector includes the original, 50-stock, 50-mixed and 100-mixed
samples. The comparison links preserve the main destination and sample.

The refined CSS is now shared in `frontend/components/refined-workspace.css` and
scoped to `.refined-workspace`. Both the local preview and authenticated staging
workspace use it. Production keeps the previous dashboard layout under the
server-side runtime policy. See [staging release details](staging-v3-release.md).
The preview performance history remains illustrative; this design comparison
does not replace staging's real-price performance service.

Validation: frontend tests, TypeScript, production build and localhost page/module
responses. Native browser visual inspection requires macOS Accessibility and
Screen Recording permissions; those were pending during implementation.

## Draft 2 interactions

- Portfolio value opens Holdings.
- Daily equity change opens Gains & Losses with Unrealized selected and the
  holdings map on Day.
- Unrealized gain/loss opens the same map on Open P&L.
- Cash opens Accounts & Imports.

Tile drilldowns retain the brokerage selection and clear unrelated ticker filters.
The map is scrolled into view and focused after the page scroll reset. A return
link and brokerage scope keep the destination clear. Figures stay hidden when
the profile visibility setting is off.

The Overview view selector now has a stronger selected state, icons and brief
descriptions. Its controlled selection appears in the top breadcrumb and URL,
so refreshing and switching designs preserve the chosen view.

In the refined Performance view, balance reconciliation is under a collapsed
Balance details disclosure. Its equation remains available for checking funding
and investment results; the main comparison chart stays prominent. The current
V2 comparison keeps its existing expanded layout.

Validation: 132 frontend tests, TypeScript, production build and local module
checks. No backend data or deployed branches were changed.


## Holdings performance (working draft)

Overview performance is unchanged. Open
http://127.0.0.1:5180/design-preview?design=refined&holdingsView=performance#holdings
for the new Holdings → Performance view, beside Stocks & funds and Options.
This sample is available in the local preview and as an explicitly labelled,
isolated fictional portfolio in authenticated staging. The live transaction-history
service is unchanged. No Analyze selector is added to Overview.

Select up to five stocks/ETFs. Three are selected initially when available.
Every solid line uses that holding's own recorded purchases, sales and income;
other stocks are not hypothetical replacements for one primary holding. The
brokerage selector scopes these personal histories. Clear/remove selections or
search the holdings picker to choose a different set.

- Profit = remaining value + cash returned − money added. Purchases and explicit
  fees add capital; sales and cash income return money from the holding.
- Each subperiod includes its own opening holding value as capital. Different
  capital amounts affect dollar results, so dollar lines are not a percentage
  return ranking. Annualized XIRR is shown after one year where a unique supported
  solution exists.
- Each history begins at actual first recorded activity and ends at the last
  valuation or final closed-position exit/payment. Missing spans are not extended.
- SPY is optional. Each dashed SPY line replays one holding's cash amounts/dates,
  labelled “SPY · AAPL cash flows”, etc. Different stock funding schedules produce
  different SPY dollar histories; a single shared SPY dollar line would mislead.
  If a withdrawal exceeds a benchmark's value, that comparison is unavailable.
- Profit is the default measure. Value + returned cash is available separately.
  A disclosure provides per-holding cash-flow totals and calendar-aligned daily
  chart values. Missing values before entry/after exit stay blank.
- Prices and SPY paths are explicitly simulated. The fictional ledger includes
  purchase legs for its four closed lots so remaining share counts reconcile.
  These are fixture computations, not seeded database records or historical returns.
- Live support needs complete transaction legs, split-aware daily valuations,
  normalized dividend/reinvestment records and benchmark total-return prices.
  Options are excluded from this first holding-level view.

## Heatmap and ranking tabs (working draft)

Open http://127.0.0.1:5180/design-preview?design=refined&portfolio=100-mixed#gainsLosses.
Heatmap and Ranked holdings are separate keyboard-accessible tabs under one
shared Open P&L / Day control. Both retain their state while the inactive panel
is hidden. Filters apply to both. The page order is Filters → Lot breakdown →
Tax assumptions → Understand the net result → charts. Lot terms start collapsed.

Ranked holdings provides search, percentage/dollar/exposure sorting, diverging
percentage bars, dollar P&L, position weight and value. All matching holdings
remain available in a scrolling list. Search does not change the weight
denominator. The map shows concentration. Both show snapshot P&L, not personal
money-weighted performance, and share existing filters.

Holdings view buttons share one height and baseline; tax copy is alongside the
table views and omitted for Performance. The heatmap's period switch is aligned
with its header; panel titles and content use matching insets. Controls wrap on
small screens without squeezing the tab labels.

Profile figure visibility removes charts, cash figures and daily values from the
rendered page. The current V2 comparison keeps its original chart layout. Authenticated staging
uses the approved V3 views when its runtime flag is enabled.
Staging and production have not been changed. Browser visual inspection remains
unavailable without the macOS permissions noted above; server-rendered and HTTP
checks do not replace visual QA.

Validation: 156 frontend tests, TypeScript and production build pass. The corrected
Holding Performance route and transformed modules respond on localhost port 5180.


## Enriched sign-in and portfolio news

The sign-in design is available at
http://127.0.0.1:5180/design-preview?screen=login (submission disabled).
Overview Snapshot now includes Portfolio news with twenty labelled sample stories,
five per page and numbered pagination. In the signed-in app, a new session loads
real recent news from the authenticated news endpoint. It ranks stories by
portfolio exposure, headline event relevance and recency. Only public symbols
are sent to Yahoo Finance's ticker RSS feed. The live endpoint never returns
sample news. See [news implementation and validation](portfolio-news.md).

## Typography and login refinement

The shared theme defines page, panel, body, label, caption and metric font sizes.
Panel titles use Inter at 15px/600 across Overview, Performance, Gains & Losses,
Insights and Accounts & Imports. Page titles keep Hanken Grotesk; key portfolio
summary figures retain their larger visual hierarchy. Holdings performance
controls now receive the same smaller button font as Overview performance, and
its per-stock figures use 20px rather than 23px. Accounts no longer references
the unloaded Manrope font or intermediate font weights. Mobile form controls
retain the 16px rule that prevents focus zoom.

The login page uses a soft blue/green background, form accents and an interactive
illustrative Overview / Performance / Portfolio news preview. Its sample views
use local component state and no API calls or user account data. Arrow keys,
Home and End navigate preview tabs. Hero branding stays prominent while form
and secondary section headings share the site's body font.


## Authenticated staging integration

The approved V3 workspace is enabled by authenticated runtime metadata rather
than DEV-only checks. Shared CSS, Overview view navigation and breadcrumbs,
Gains chart tabs and summary shortcuts work in a release build. The holding
performance sample uses an isolated fictional portfolio and local sample filters;
real account data is never passed to that chart. See [release and rollback details](staging-v3-release.md).
