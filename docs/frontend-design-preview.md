# Portfolio workspace preview

Branch: `feature/brokerage-table-styling`, based on `staging` after PR #16.

Run from `frontend/`:

```sh
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open http://localhost:5174/design-preview. The development-only page uses fictional
holdings in Fidelity, Schwab and Vanguard. It never mounts the authenticated app
or contacts portfolio, brokerage or AI services. The route is unavailable in production;
normal authentication still applies there.

The preview reuses `DashboardView`, `PortfolioOverview` and the actual tab views
from the signed-in app. Navigate all five sections from the sidebar or mobile
navigation. The URL hash preserves the selected section on reload:

- `#dashboardView`: **Overview** — portfolio value, daily contributors and allocation.
- `#holdings`: **Holdings** — Stocks & funds and Options, with brokerage and lot drill-down.
- `#gainsLosses`: **Gains & Losses** — unrealized and realized results, tax assumptions and charts.
- `#transactions`: **Transactions** — source ledger, filters, editing and reconciliation.
- `#importData`: **Accounts & Imports** — connections, synchronization and statement import.

The five-section structure separates the portfolio summary, current positions,
investment results, source ledger and data acquisition. Options remain within
Holdings; realized/unrealized are subviews of Gains & Losses. Maintenance actions
are in collapsed sections rather than the primary transaction toolbar.

Try the brokerage selector, dollars/percentage switch, column ordering, row
expansion, Stocks & funds / Options switch, Realized / Unrealized switch,
connection / statement switch and the profile privacy control. The development-only
API adapter serves supporting data in memory and rejects unsupported requests
without a network fallback. Preview column-order caches have their own namespace.
Ledger edits affect sample rows only; position recalculation is illustrative.
Statement imports add example rows rather than parsing real financial documents.
New account connections and destructive source-data actions are unavailable.
Accounts & Imports now separates two workflows. Connected accounts shows named
accounts under each brokerage, explicit all-listed/selected sync scope, available
history/year-to-date/custom periods and optional ticker filtering. All syncs send
explicit provider account IDs; an empty selection cannot become an all-account
sync. Account-list failures disable synchronization and remain visible.
Statement import stages a CSV/TXT file or pasted CSV locally, with a source-content
preview and a separate replacement acknowledgment before importing. Production
CSV formats are Robinhood and Schwab; other providers use the connection portal.
The import endpoint extends earlier history for tickers with brokerage-synced
coverage, while keeping other parsed rows as source records. Invalid, empty and
invalid-date/non-finite-amount statements are checked before prior history is
deleted. The preview's fictional sample button demonstrates the import flow. A three-step
progress rail leads from format selection and source preparation to a separate
read-only review. Review shows up to five original CSV rows, counts all source
rows and checks the expected headers. Action values are preserved as exported;
the preview never infers Asset Type or changes financial values. A UTF-8 byte-order
mark is removed from the header before submitting to the existing server parser.
Inline results link back to Transactions; no automatic import occurs on file
selection. Destructive tools remain collapsed and describe their actual scope,
including clearing all derived portfolio records when either source is removed.
The live account workspace requires the backend's `/brokerage/provider-accounts`
route; `/brokerage/accounts` remains the local portfolio-account endpoint.
Brokerage logos in Accounts & Imports are bundled local assets for Fidelity,
Schwab, Robinhood, Vanguard and E*TRADE, with no external image requests. They
appear in the account cards, connect catalog, selected-account sync summary and
import format/review views. Source provenance is in `frontend/assets/brokerages/README.md`.
Account cards include per-brokerage include/exclude actions and global selection
controls. The sync panel names the chosen accounts; optional ticker filters are
collapsed until needed.
Company logos load from the shared public logo providers in the preview and
signed-in views. Initials are a fallback after both providers fail; ETF rows use
the shared fund icon. Portfolio records remain fictional and in memory.

Table controls use one pattern across Stocks & funds, Options, Transactions,
and Gains & Losses: labels above each field, searchable brokerage/ticker
multi-selects, visible result counts, removable active-filter chips and Clear all.
Grouping and column layout actions are separate from data filters. Custom
transaction dates use labeled start/end fields; realized gains show the active
tax year explicitly and Clear all includes that year filter.

Holdings defaults to eight position/P&L columns, Options to nine and Transactions
to the full eight-column ledger. The shared Columns dialog supports visibility,
reordering, task-specific presets, All columns and Restore default layout.
Ticker (and transaction date) remain visible. Existing saved column ordering is
preserved, new columns are appended safely, and visibility is saved with order.
Gains & Losses has a seven-column holding/lot table with P&L percentages. Options filters remain
available even when no positions match.

Gains & Losses uses a reconciliation report rather than overview-style metric
cards: gains, losses and net P&L are compared by tax term, with a compact lot-outcome
distribution. The illustrative tax estimate sits beside its rate assumptions.
The reconciliation report has a dollar/percentage toggle. Percentage values use
one shared cost-basis denominator within each row so gains and losses reconcile
to net P&L; zero or negative cost basis is shown as unavailable.
Unrealized results show a full-width heatmap, with open-P&L and daily-equity views.
Heatmap area represents absolute current lot value; colour shows P&L percentage.
Zero-value positions remain in the reconciliation report and lot tables.
Realized results default to all years with annual net P&L bars; selecting a tax
year switches to monthly net P&L. All charts and summaries use the same filtered
records. The previous simplified cross-term tax-offset formula is preserved.
Lot tables retain stock/option separation, sorting, expansion and wash-sale flags.
When figures are hidden, charts and lot details are omitted rather than blurred.

Includes a consolidated value summary, daily equity contributors, allocation,
largest holdings, invested/cash breakdown by brokerage, concentration summary,
responsive layout, keyboard access and masked chart states. AI Insights sits directly below the portfolio summary and above the charts.
The local preview renders three clearly labeled sample observations calculated
from the fictional holdings and cash, with links to Holdings and Gains & Losses.
Its sample Q&A runs locally and does not call any AI service. The signed-in view
uses the existing cached-insights, regeneration and chat APIs. Cached analysis
shows its generation time and portfolio-change status; Hide figures hides the
analysis and disables its chat/generation controls. Analysis covers the entire
portfolio, with an explicit scope note when the overview is brokerage-filtered.

Daily figures estimate price movement on current equity positions. They exclude
options and positions without a valid previous close. Allocation represents
positive invested assets, excludes cash/short exposure, and groups smaller
holdings as Other. Unrealized P&L is market value less open-position cost basis.
No historical performance series is fabricated.

The sidebar uses the overview's navy, muted blue and soft background tones, with
an explicit collapse/expand control and the same compass mark in its expanded
and compact states. The mark is a native SVG at
`frontend/assets/wealthcompass-mark.svg`, reused by the brand component, sign-in
screen, mobile header and browser favicon.

Validation (Node 22.6+ for the calculation tests):

```sh
npm run build
npx tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
```

Transactions now presents Asset Type with a small class icon and a readable
label (`Equity` displays as `Stock`). Action uses light blue buy badges, lavender
sell badges, teal income/deposit badges and neutral transfer/event badges.
Option actions expand into Buy/Sell to open/close. Fees use a muted amber badge;
unknown source values remain visible with neutral styling. Original values are
available in hover titles and remain unchanged in edit fields, filter keys,
API writes and calculations. Asset filter labels match the displayed cells.

Shared surface colors now use a pale blue-gray canvas (`#edf2f8`), white cards,
light blue header bands and consistent slate borders with restrained shadows.
The Total Portfolio Value panel keeps its original navy (`#172d50`) as the
visual anchor. The same surface tokens apply to filters, tables, gain reports
and account panels in both the authenticated app and the local preview.
Short-/long-term tints and financial gain/loss colors retain their meanings.

Brokerage identities in Transactions, Holdings, Options and Gains & Losses now
share a compact logo-and-name treatment with a light outlined surface. The same
bundled marks are used in Accounts & Imports. Transaction account names remain
under the original brokerage, and transferred lots show a clearly labeled
“Now at” destination. Brokerage names, account IDs, filters and transfer writes
are unchanged. Unknown brokerages keep their name with a neutral institution
icon. In Holdings and Options, expand a ticker or group by Brokerage to inspect
the updated source rows.

A proposed Performance vs SPY module is available in the development preview
below AI Insights. It includes YTD, trailing 1/3/5-year and calendar-year views,
a permanent simulated SPY total-return comparison, normalized percent/$10k
charts, and a reconciled opening/deposit/withdrawal/earnings/ending balance bridge.
Both series are explicitly simulated. No real performance is exposed in the
signed-in app; live history and cash-flow classification are not implemented.
See `docs/portfolio-performance-design.md` for methods, date rules and backend work.

The top-right avatar is now a shared account menu in the preview and signed-in
app. It shows the account identity, opens an Edit profile form and provides
Sign out. Names are saved under the existing per-user `profile_display_name`
preference, preserving saved table layouts; no database migration or backend
endpoint was added. Avatar initials follow the saved name. Failed preference
reads remain visible and do not masquerade as a cleared name. Failed real logout
requests leave the app signed in and show an actionable error.

In the preview, the profile belongs to the fictional Jordan Doe account. Name
edits stay in the mock adapter's memory. Sign out opens a local preview-session
exit screen with a Return to design preview button; it never calls real logout
or changes an authenticated WealthCompass session.

The profile menu includes the Hide financial values switch, the sole visibility
control. It uses the `financial_numbers_visible` account preference, saved
automatically through the existing user-scoped preferences API.
Each login and reload starts masked until that preference loads; saved `false`
stays hidden and saved `true` restores visible figures. Accounts without a saved
choice keep the existing visible default after loading. Failed reads remain
masked with Retry; failed saves preserve the current session choice and clearly
report that the next-login preference was not saved. Pending saves disable the
controls to prevent conflicting writes. Sign-out retries any unsaved choice but
remains available if preference storage fails. No account values are cached in
browser storage by this feature.

For local preview testing, only the fictional visibility choice also survives
reloads in the isolated `wealthcompass:design-preview:financial-visibility`
browser-storage key. It never reads or writes a real account's preference.

Use the visible sample portfolio choices or `/design-preview?portfolio=50-stocks` to
inspect a fictional fifty-stock portfolio across the same three brokerages.
This scenario has matching holdings, open lots, buy transactions and sample
analyst quotes; it has no option positions or realized sales. Its total value
matches the original fixture so the separately simulated performance example
retains the same endpoint. Switching scenarios reloads the preview and resets
sample edits, preserving the profile visibility preference.

The choices also offer `/design-preview?portfolio=50-mixed` (40 stocks,
10 ETFs and 6 option positions) and `/design-preview?portfolio=100-mixed`
(80 stocks, 20 ETFs and 12 option positions). The 50/100 counts refer to unique
stock/ETF holdings; options are additional contract positions on those
underlyings. Both scenarios span all three brokerages and contain calls, puts,
retained/sellable contracts, winning/losing positions, short-/long-term open
lots, and closed stock/ETF/option lots with matching buy/sell ledger entries.
The larger sample includes multiple option contracts on the same underlying.
ETF identity icons are preserved when the same symbol also has options.

All scenarios retain the same illustrative ending portfolio value. Equity daily
contributors exclude options. Option valuations, gains and ledger cash amounts
apply the 100-share multiplier; the sample options calculator and retention
updates use the selected scenario's contracts rather than fixed totals.

Sample choices are shown as visible cards above every preview tab, with a Loaded
count and Open Holdings action. Overview summarizes five rows rather than listing
all 50/100 holdings; Holdings provides the full list. The normal development app
also has a Sample portfolios link in its navbar. These controls are excluded
from production.

Overview stays compact at fifty or one hundred holdings: allocation shows at most
eight segments. Up to eight positive holdings each get their own slice; larger
portfolios show seven named holdings and Other with the remaining holding count.
Every individual holding above 20% of the positive invested-asset total stays
separate. Other can exceed 20% as a group of smaller holdings; its caption explains
this and provides View full breakdown. The donut is 208px with smaller gaps when
there are more than six slices. Daily contributors shows the top ten
ranked by absolute dollar change or percentage move according to its $/% toggle,
while its total covers every eligible holding. View all contributors opens a
scrollable list with both metrics and the same ranking; Show top 10 restores the
chart. The aggregate percentage remains the weighted return across all eligible
holdings, rather than a sum of the individual percentages. Largest
holdings shows five with View all 50/100 leading to Holdings. The Other pie segment
and legend both open the full Holdings view. Brokerage filters recompute all
counts and totals. No live data source or financial calculation was changed.

The full contributors list reuses Holdings' sort indicators and three-state
column sort: ascending, descending, then reset. Holding sorts alphabetically;
Dollar change and Daily move sort signed values so losses/gains can be inspected
in either order. Reset restores absolute-move ranking for the selected $/% mode.
Changing that mode also resets manual table sorting. Active headers expose
`aria-sort`, including `other` for the default absolute-value ranking. The chart
retains its top-ten ranking and portfolio totals regardless of table sorting.

Stocks & funds and Options now share display-only holding formatters at ticker,
brokerage, account and lot levels: quantities omit trailing decimals and retain
up to eight fractional places (very small nonzero quantities retain significant
precision); totals show USD with grouping and two decimals; prices/premiums and
strikes retain up to four decimals when needed, with extra precision for tiny
prices; percentages show two decimals. Negative amounts retain their sign and
missing/non-finite values use an em dash. Lot dates remain the recorded ISO day
without local-timezone shifts. Calculations, option multipliers and editable
retention quantities keep their original numeric values.

Holdings tables also share a visual hierarchy: semibold ticker symbols and market
values, medium-weight quantities and P&L, lighter cost/price values, and consistent
teal/rose financial direction. Short-term, long-term and mixed tax-term labels use
soft blue, lavender and amber surfaces respectively. Styles are scoped to Stocks
& funds and Options, including account, brokerage and individual-lot rows.
