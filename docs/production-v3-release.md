# V3 production promotion

The approved staging release is `d5f76d4` (PR #24). Production is promoted to
`main`; `staging` remains the development/test branch. Neither branch is deleted.
The fixed `ui-v1` and `ui-v2` tags preserve the older interfaces.

## Production source and configuration

The existing `wealthcompass-app` service deploys from `design/cloud-launch`.
PR #25 promoted the release to `main`; PR #26 added `branch: main` to the legacy
production manifest. Live deployment records and assets confirmed that Render
continued building the legacy branch after this edit. Do not assume a manifest
commit alone changes an existing service's source: a dashboard source change or
an active Blueprint sync is still required. No Render API credential is available
in this workspace or GitHub repository secrets.

Until Render's source is changed to `main`, publish each approved main release by
merging it into `design/cloud-launch`. The code is kept on `main`, and the existing
service receives that same code through its working deployment source. Both
`main` and `staging` remain available for development. In Render's service Settings,
set the source branch to `main` to remove this temporary publishing step; if a
Blueprint manages the service, also synchronize its configuration/source.

Keep the existing `DATABASE_URL`, `JWT_SECRET` and `WealthCompass` environment
group. `WC_DEMO_MODE=false` is mandatory: the Docker image's portable-demo default
must not reset the production database. Production explicitly sets:

```text
WC_APP_ENV=production
WC_REFINED_UI=true
WC_PERFORMANCE_DEMO=true
WC_HOLDING_PERFORMANCE_PREVIEW=false
```

The V3 layout is enabled for signed-in users. Transaction-derived performance is
enabled only for the authenticated `demouser@gmail.com` account. The simulated
individual-holding performance prototype remains staging-only, even if its flag
is accidentally true in production. Other accounts' records and credentials are
not migrated or reseeded. Signup/onboarding work remains excluded.

As with staging, trusted Render metadata supplies defaults for the verified
existing production service (`srv-dbj6lqm7bikc73eim1d0`) on `main` or its legacy
source branch, without requiring a dashboard flag resync. Explicit false flags
disable features; unknown services/branches and explicit development environments
do not inherit these defaults. Hostnames and query strings never enable them.

## Demo preparation

The pre-release read-only comparison found production's 16 demo transactions
match staging's original 16. Staging contains seven additional labelled sample
transactions. After the new production build is healthy, sign in to the public
demo account and use its existing authenticated endpoints:

1. `POST /api/v1/performance/demo-sample` adds just the seven fixed rows. It
   requires the exact demo email, `is_test_user`, enabled history, and an unchanged
   base fixture. It rejects customized ledgers and is idempotent. It never accepts
   a target user ID or arbitrary transaction payload.
2. `POST /api/v1/realized-gains/process` refreshes that user's derived holdings
   and gains from its ledger.
3. `POST /api/v1/performance/rebuild` with `{}` generates daily values from those
   transactions and genuine historical prices, including SPY total-return and
   trade-timing comparisons. Poll `GET /api/v1/performance/history` until ready.
4. Verify 23 transactions, complete coverage, populated SPY series, runtime flags,
   unauthenticated access rejection, and unchanged records for the second demo
   account. Do not call the whole-database seed/reset script on production.

No encrypted source rows, user keys or sessions are copied between databases.
Public market prices are fetched independently for production; returns are not
copied from a fixed simulated series.

## Schema and validation

The two additive revisions since V1 are `7d0a241b51ae` and `c0926f46b738`.
They add daily performance, public historical prices and the trade-timing SPY
benchmark. Existing startup `Base.metadata.create_all()` creates these missing
tables without replacing existing tables. If maintaining Alembic version tracking,
run `DATABASE_URL=<production URL> python -m alembic upgrade head` from a trusted
operator environment; upgrades also handle tables already created at startup.
Never target the local owner's default database. No destructive upgrade is used.

A temporary PostgreSQL 16 rehearsal upgraded the previous production revision to
head twice, preserved an existing sentinel user byte for byte, and matched all
model columns. The production Docker image was built with its data-leak guard.
Validation passed: 181 frontend tests, TypeScript and Vite build; 183 backend
tests passed and 3 skipped. Disposable-container checks use only fictional data.

## Rollback

Keep the production database and both long-lived branches. Set
`WC_REFINED_UI=false` for a layout rollback or `WC_PERFORMANCE_DEMO=false` to
close demo history routes. A full code rollback can deploy the fixed `ui-v1`
commit; leave the additive tables in place. Do not downgrade/drop performance
tables as part of a UI rollback.
