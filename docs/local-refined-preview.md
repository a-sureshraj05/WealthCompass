# Refined frontend comparison (local only)

Design version: **V3 draft 1**, saved as `ui-v3-draft-1`.
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
refined presentation uses neutral surfaces, compact white summary cards, a
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
