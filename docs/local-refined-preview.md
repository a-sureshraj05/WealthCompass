# Refined frontend comparison (local only)

Design version: **V3 draft 2**, saved as `ui-v3-draft-2` (draft 1 remains fixed).
Branch: `design/local-portfolio-studio`, based on V2 (`ui-v2`) after PR #22.
See the [UI version registry](ui-versions.md) for all saved designs.
No backend changes, deployed feature flags, live account writes or schema changes.
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

The refined CSS is scoped to `.refined-preview` and imported by the existing
DEV-only preview entry. Regular signed-in pages use the current presentation.
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
