# Frontend design bookmarks

The numbered V1/V2/V3 registry is in [UI versions](ui-versions.md). The dated
bookmark below is retained as an alias for `ui-v2`.

## Staging before the refined preview

- Bookmark: `baseline/staging-ui-2026-11-06`
- Commit: `13cb12c0e106532b488ad0cde0d125799251af9f`
- Date: November 6, 2026, America/Los_Angeles
- Baseline: staging after PR #22, before `design/local-portfolio-studio`.
- Includes the current frontend and three-way portfolio/SPY comparison.
- Excludes the local uncommitted refinement and separate signup branch.
- [Browse the saved code](https://github.com/a-sureshraj05/WealthCompass/tree/baseline/staging-ui-2026-11-06)

The annotated tag is pushed to GitHub. It stays at this exact commit when staging
changes. Keep this bookmark fixed; create a new dated tag for another milestone.
It preserves code only, not the database, credentials or account data.

Fetch and inspect:

```sh
git fetch origin --tags
git show baseline/staging-ui-2026-11-06
```

Compare the current frontend, including local edits, with the saved baseline:

```sh
git diff baseline/staging-ui-2026-11-06 -- frontend/
```

Open an isolated copy without switching branches or disturbing local edits:

```sh
git worktree add --detach /tmp/wealthcompass-staging-baseline baseline/staging-ui-2026-11-06
cd /tmp/wealthcompass-staging-baseline/frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5181 --strictPort
```

Then open http://127.0.0.1:5181/design-preview for the saved layout with fictional
sample data. The local refined preview can keep running separately on port 5180.
