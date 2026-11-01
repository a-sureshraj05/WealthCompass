# Portfolio workspace preview

Branch: `feature/frontend-portfolio-enrichment`, based on `staging`.

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
connection / statement switch and Hide figures control. The development-only
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
