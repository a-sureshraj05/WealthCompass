# WealthCompass UI versions

These are frontend design checkpoints, recorded on November 6, 2026
(America/Los_Angeles). Environment names can move to newer code; these tags
preserve the versions that were in those environments on this date.

| Design | Status when saved | Fixed Git tag | Source branch | Reference |
| --- | --- | --- | --- | --- |
| Version 1 | Current production | `ui-v1` | `design/cloud-launch` | `44f0f60063ea154fe06092f281a758219dc9b5df` |
| Version 2 | Current staging | `ui-v2` | `staging` | `13cb12c0e106532b488ad0cde0d125799251af9f` |
| Version 3, draft 1 | Refined design for local review; not deployed | `ui-v3-draft-1` | `design/local-portfolio-studio` | Resolve with `git rev-parse 'ui-v3-draft-1^{commit}'` |

All three are annotated tags pushed to GitHub. V3's branch is also pushed as a
backup, without merging it into staging or production. The dated bookmark
`baseline/staging-ui-2026-11-06` remains an alias for the same commit as `ui-v2`.
The separate signup/onboarding branch is excluded from these V2/V3 checkpoints.

## What the versions mean

- **V1:** The production interface people are already using.
- **V2:** The staging interface with the earlier frontend enrichment and the
  portfolio, trade-timed SPY and buy-and-hold SPY comparison.
- **V3 draft:** A refinement of the familiar layout: lighter surfaces, compact
  summary cards, quieter sidebar/filter styling, and Snapshot, Performance and
  AI Insights sections within Overview. The local preview can switch between the
  current V2 layout and the V3 concept using fictional sample data.

Git tags capture the full repository at a commit, not just the frontend. These
are design labels rather than package/database schema versions. They do not
capture database rows, brokerage credentials, sessions or browser preferences.
Creating/pushing these tags does not promote code to an environment.

## Find and compare versions

```sh
git fetch origin --tags
git tag --list 'ui-v*'
git show --no-patch ui-v1
git show --no-patch ui-v2
git show --no-patch ui-v3-draft-1

# Compare the deployed production and staging frontends.
git diff ui-v1 ui-v2 -- frontend/

# Compare staging with the saved refined concept.
git diff ui-v2 ui-v3-draft-1 -- frontend/

# Read a particular file without switching branches.
git show ui-v1:frontend/components/Sidebar.tsx
```

[Browse V1](https://github.com/a-sureshraj05/WealthCompass/tree/ui-v1) ·
[Browse V2](https://github.com/a-sureshraj05/WealthCompass/tree/ui-v2) ·
[Browse V3 draft 1](https://github.com/a-sureshraj05/WealthCompass/tree/ui-v3-draft-1)

## Inspect a version without disturbing current work

```sh
git worktree add --detach /tmp/wealthcompass-ui-v3 ui-v3-draft-1
cd /tmp/wealthcompass-ui-v3/frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5182 --strictPort
```

For V3, open http://127.0.0.1:5182/design-preview?design=refined. For its comparison
layout, open http://127.0.0.1:5182/design-preview. This explicit DEV-only route uses
fictional data and needs no backend login. See [local preview details](local-refined-preview.md).
V1 predates that preview route; use its saved source as the reference rather than
assuming it has the same preview capabilities.

## Save future checkpoints

Keep existing version tags fixed. Continue V3 development on its branch and
create another annotated tag for a useful review milestone:

```sh
git tag -a ui-v3-draft-2 -m 'UI Version 3 draft 2: describe the reviewed changes' HEAD
git push origin ui-v3-draft-2
```

When V3 is approved, create `ui-v3` at the approved commit and update this registry.
Deployment remains a separate step. Do not move `ui-v1` or `ui-v2` merely because
production or staging is upgraded; that would lose their meaning as bookmarks.
