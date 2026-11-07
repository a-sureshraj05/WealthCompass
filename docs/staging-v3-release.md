# V3 staging release candidate

Branch: `design/local-portfolio-studio`, based on the saved V2 staging commit.
The signup/onboarding branch is excluded. Preparing this candidate does not push
or deploy staging or production.

## What the staging build renders

The authenticated app reads runtime presentation flags from `/api/v1/auth/me`.
The V3 workspace, Overview views/summary shortcuts, Gains & Losses chart tabs,
shared typography, enriched login and portfolio news work in the normal
`npm run build` output. The browser does not need Vite development mode.

`WC_APP_ENV=staging` enables the V3 runtime policy. The verified existing staging
Render service also defaults on when deployment metadata matches its service ID
and the `staging` branch. An explicit non-staging `WC_APP_ENV` always wins over
that fallback. These decisions do not use browser query parameters or hostnames.

The staging Blueprint records:

```text
WC_APP_ENV=staging
WC_REFINED_UI=true
WC_HOLDING_PERFORMANCE_PREVIEW=true
```

No new API key or database migration is needed for this candidate. News retrieves
real recent stories through the authenticated endpoint and public ticker RSS.

## Data boundaries

- Portfolio summary, holdings, gains, transactions, accounts and news continue
  using the signed-in account and existing user-scoped backend routes.
- Overview performance retains the existing transaction-based history and SPY
  comparison policy. Its demo-account restriction is unchanged. Accounts without
  enabled history receive an explicit unavailable message in the Performance view.
- Holdings → Performance is an explicitly labelled **sample portfolio** for
  staging design review. It receives only fixed fictional holdings/transactions,
  simulated daily prices and its own brokerage selection. It does not receive
  the account's holdings, transactions or brokerage filter. The sample view has
  no Recalculate positions action. Figure visibility still applies.
- The sample is not a live holding backtest. Connecting that view to real daily
  valuations remains separate work; no simulated values are written to accounts.
- The public `/design-preview` bypass and in-memory API adapter remain DEV-only.
  Anonymous requests in a release build still require normal authentication.

## Rollback controls

`WC_REFINED_UI=false` restores the previous dashboard layout and disables the
holding sample. `WC_HOLDING_PERFORMANCE_PREVIEW=false` hides only the sample tab,
keeping the V3 workspace. Missing flags default to enabled only within the
trusted staging environment. The approved production release independently opts
in to the V3 workspace; the simulated holding chart remains staging-only. See
[production promotion](production-v3-release.md). Login/news code changes remain
part of this candidate; these presentation flags control the dashboard layout
and sample tab, not the full code release. Git rollback is a separate option.

## Validation and limitations

Release-mode renderer tests use `import.meta.env.DEV=false` to verify V3 navigation,
heatmap/ranking tabs, the existing Overview history, sample isolation and privacy.
Tests cover server-side staging/production policy and reject query-string opt-in.
The previously failing AI Insights cost-control tests now stub only external
prices and option selection in their test fixture; the application's real pricing
logic is unchanged.

The actual Docker image built successfully as `wealthcompass:v3-staging-review`.
A temporary localhost-only container with its own fictional demo database passed
health, sign-in, authenticated runtime flags and release-JavaScript checks. The
live news endpoint returned twenty real stories and rejected anonymous access.
The smoke-test container was removed afterwards; no host account database was
mounted. Native browser visual QA still requires the macOS permissions documented
in the local preview guide.


Latest validation: **172 frontend tests passed**, TypeScript passed and the Vite
production build passed. The complete backend suite passed with **170 passed,
3 skipped**, including the previously failing AI Insights tests. No live pricing
or portfolio calculations were changed to achieve those test results.
