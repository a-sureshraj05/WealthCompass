# WealthCompass — Cloud Launch (Render, demo-only)

> **Data hygiene.** Like `ARCHITECTURE.md`, this file contains no real portfolio data and must not
> acquire any. Demo fixtures described here are fabricated and deliberately unrelated to the
> owner's actual holdings.

**Companion document:** `docs/ARCHITECTURE.md` — V1 describes the system as built, V2 the
multi-user target.

**Status as of 2026-08-12.** This was a plan; it is now a record. Stages 1 and 2 are built and
verified. Nothing is deployed yet — the branch is pushed and the Render service has not been
created. Two things changed materially from the original plan (the platform, and the database), and
both are explained below rather than quietly edited out.

---

## 0. The local-data guarantee

The live database at `db/wealthcompass.db` is not touched by anything here. That is enforced, not
promised:

| Guarantee | Mechanism | Verified |
|---|---|---|
| Cloud never reads the local file | The cloud instance builds its own database from scratch. No script, migration, or deploy step references the local path. Nothing is copied up. | Container DB contains 21 fabricated rows and two demo users; the real one has 1,575 rows and a different account |
| Seed/reset **cannot** target local | `seed_demo._guard` fails closed on three conditions: `WC_DEMO_MODE=true`, the URL must not contain `wealthcompass.db`, and `--yes`. All three must pass. | All three re-tested after `main()` was refactored into `seed()` |
| Local data cannot reach the image | `.dockerignore` excludes `db/`, `data/`, `config/`, `.env`, and `api/archive/` | Build-context probe returns no `.db`, `.env`, or `tickers.yml` |
| A broken `.dockerignore` fails the build | A `RUN` guard stage asserts none of it arrived and exits non-zero if it did | Guard reports clean on every build |
| Nothing accumulates in the cloud | The database is on the container's ephemeral filesystem. There is no volume. | — |

The fourth row exists because the third one **silently failed**. `.dockerignore` matches with Go's
`filepath.Match`, where `*` never crosses a `/`, so a bare `*.db` matches only the context root.
Empty stray databases at `backend/wealthcompass.db` and `backend/app/db/wealthcompass.db` reached
the build context unnoticed. Git's `*.db` *does* match at any depth, which is why `.gitignore` looks
correct and `.dockerignore` has to be written differently (`**/*.db`).

Directory patterns are conversely root-anchored (`/db/`, not `**/db/`), because `**/db/` also
matches `backend/app/db/` — which is source, and excluding it breaks the image with
`No module named 'backend.app.db'`. Both mistakes were made and caught here; the assertion stage is
what makes the next one cheap.

An image layer is public, immutable, and not deletable after the fact. By the time a mistake is
noticed, it has already shipped — which is why this is a build failure rather than a checklist item.

---

## 1. The stages, and what actually happened

| Stage | What it covers | Status |
|---|---|---|
| **1. Demo** | Public URL, fabricated data, seeded logins, periodic reset | **Built**, not yet deployed |
| **2. Multi-tenant** | `user_id` scoping throughout; per-user recompute; cross-tenant leak test | **Shipped** — commits `5f4f7ed`…`da50395` |
| **3. Real accounts** | Encryption, invite-gated signup, per-user brokerage credentials | Not started |

**Stage 2 landed before Stage 1**, inverting the plan. No harm done — the demo simply has two
tenants instead of one shared login, which exercises the scoping better than a single account would.

Isolation is verified live, not only by the test suite: two seeded users logged into a running
container returned disjoint holdings, with zero ticker overlap. Backend suite: 11 passed.

---

## 2. Deployed architecture

```
                        Internet
                            │  HTTPS (platform-managed cert)
                            ▼
        ┌──────────── Render web service (free plan) ────────────┐
        │                                                         │
        │   Docker container, single uvicorn worker               │
        │   ┌─────────────────────────────────────────────┐      │
        │   │ /api/v1/*  → routers                        │      │
        │   │              demo mode: brokerage 503,      │      │
        │   │              import 503, register 403       │      │
        │   │ /healthz   → liveness + SELECT 1            │      │
        │   │ /*         → built React SPA (static)       │      │
        │   └─────────────────────────────────────────────┘      │
        │                          │                              │
        │   SQLite on the container's EPHEMERAL filesystem        │
        │   /app/rundata/demo.db ← restored on boot from          │
        │   /app/seed/demo.db (baked at build time, read-only)    │
        └─────────────────────────┬───────────────────────────────┘
                                  ▼
                    yfinance → Yahoo Finance (public quotes only)
```

Single origin: the API and frontend are the same host, so **CORS never enters the picture** — as
locally, except the Vite dev proxy is replaced by FastAPI serving the built assets.

**Not present:** SnapTrade credentials, any AI API key, any real user's data, registration,
encryption (there is nothing to encrypt), a volume, a managed database.

### 2.1 Why not Postgres — a deliberate deviation

The original plan specified Fly Managed Postgres and a separate scheduled reset machine. Both were
dropped once the scope settled on demo-only:

- **Ephemeral SQLite, not Postgres.** The demo cannot accumulate state across restarts, so there is
  nothing to leak, corrupt, or back up. The absence of persistence is itself the guarantee.
- **In-process reset, not a scheduled machine.** The plan's objection was that a restart mid-reset
  leaves the demo half-seeded. That assumed a persistent shared database; with ephemeral storage a
  restart *is* a full reseed. A separate machine would also have its own filesystem and could not
  reach this one's database at all.
- **Consequence:** the Postgres dialect work (§3.2, §3.3 of the original plan) is skipped entirely
  and remains **undone**. See §7.

### 2.2 Why Render, not Fly

Fly retired its free tier for new accounts — a 2-VM-hour / 7-day trial, then a card and a ~$5/mo
practical minimum. Render's free plan requires no payment details. `render.yaml` is the live config;
`fly.toml` is kept as a ready migration target rather than deleted.

Migration is deliberately cheap: no volume, no Postgres, nothing persistent. Moving platforms means
writing that platform's config file and pointing it at the same Dockerfile — only the URL changes.
That portability is precisely what makes starting on a free tier low-risk.

Two changes make the image portable across free tiers:

- `CMD` reads `${PORT:-8000}`. Render, Koyeb and Cloud Run all inject the port they expect; a
  hardcoded 8000 fails their health checks. The default keeps local `docker run` unchanged.
- The demo database is **baked at build time** and restored on boot, rather than seeded live. On a
  plan that sleeps after idle, a visitor would otherwise wait for the platform to wake the container
  *and* for ~6s of seeding that calls Yahoo Finance. Cold start dropped from 10s to **2.0s**.

The bake runs *after* the leak guard, so the guard's "no database came from the build context"
assertion still means something. The baked file is the only `.db` in the image.
`demo_reset._restore_from_template()` calls `engine.dispose()` after copying, because `create_all()`
has already opened that file and `copyfile` rewrites the same inode — pooled connections would
otherwise serve stale pages.

---

## 3. What changed in the codebase

| # | Change | Status |
|---|---|---|
| 3.1 | `backend/requirements.txt`, pinned | Done — see below |
| 3.2 | Dialect-aware `database.py` | **Skipped** — no Postgres |
| 3.3 | Gate startup DDL on `dialect == "sqlite"` | **Skipped** — no Postgres |
| 3.4 | Tailwind as a build dep; esm.sh importmap removed | Done |
| 3.5 | FastAPI serves `frontend/dist` with SPA fallback | Done |
| 3.6 | `GET /healthz` with a DB ping | Done |
| 3.7 | `WC_DEMO_MODE` gating | Done, and extended — see §3.9 |
| 3.8 | `Dockerfile` + `.dockerignore` + leak guard | Done |
| 3.9 | CSV import closed in demo mode | Done — **new**, see below |

**3.1 — the dependency manifest.** Pinned. `google-cloud-aiplatform` dropped: its only importer is
`api/archive/ai_import.py`, which is not a registered router and is excluded from the image.

`snaptrade-python-sdk` is **deliberately absent**. 11.0.169 hard-pins `typing_extensions==4.13.2`,
which pydantic 2.12.5 (`>=4.14.1`) cannot satisfy — an unsatisfiable resolve, not a preference.
Notably the local environment has 4.15.0 installed, so the local combination already violates that
pin and merely happens to work; pip would not reproduce it. Version 13.0.1 relaxes the pin and would
resolve cleanly, but bumping the brokerage SDK two majors to ship a demo that never calls SnapTrade
puts the one code path that syncs real accounts at risk for no benefit. `snaptrade.py` tolerates the
missing import; `get_client()` raises loudly if anything ever reaches it.

**3.4 — the frontend.** Tailwind pinned to **v3**, not v4: the markup was written against the v3 CDN
defaults, and v4 changes the default border colour and renames the shadow scale, which would
silently restyle the app. The inline `<style>` block moved to `index.css` unchanged. `@google/genai`
and `react-plaid-link` were dropped outright — nothing imported either. The only remaining external
request is Google Fonts, a stylesheet rather than a script, which degrades to system sans if it
fails.

**3.5 — SPA serving.** The catch-all is registered last, or it swallows `/api/v1/*`, and only mounts
when `frontend/dist` exists — locally Vite serves on :5173 and proxies to the backend, so the mount
must not be a hard requirement.

**3.9 — the import hazard (new).** `manual_import` *persists* what it parses, and the demo publishes
its passwords, so its accounts are shared by every visitor at once. Without a guard, one visitor
uploading a real brokerage statement would have it written to a shared account and shown to the next
visitor who signed in. The periodic reset bounds that window without closing it.

This is easy to miss because nothing about the *operator's* data is at risk — the exposure is
between visitors, so nothing complains. The guard sits above the endpoint's opening `delete_all()`,
so a rejected upload leaves the demo intact rather than wiping it.

---

## 4. Demo data

### 4.1 Generated through the app, not inserted

The fixture is **hardcoded in `backend/scripts/seed_demo.py`**, written through `UserScope` and then
handed to the real `process_transactions()` pipeline, so holdings, tax lots and gains are produced by
the app rather than hand-built. Anything the pipeline cannot derive from those rows is a bug worth
finding, which is the point of seeding this way.

> The original plan called for a committed CSV at `backend/fixtures/demo_statement.csv` loaded
> through `csv_data_parse()`. That is **not** what was built and the file does not exist. Rows are
> seeded as SnapTrade-sourced instead, which matches how the app is designed to be used and means a
> statement import would *add* to the demo rather than destroy it — `manual_import` clears existing
> manual rows for its brokerage, which would otherwise wipe the split lot and the transfer the demo
> exists to show. (Import is closed in demo mode anyway, per §3.9.)

### 4.2 What the fixture contains

Two users. Between them the portfolios exercise: two brokerages plus a third for the second tenant,
an ACATS transfer, a pre-split lot, options and equity on the same underlying, long-term and
short-term lots of the same stock, a dividend reinvestment, realized gains of both tax characters,
and a positive non-round cash balance.

Tickers are real, well-known large-caps so yfinance returns genuine quotes and the charts look
alive — but **quantities, dates and cost bases are entirely fabricated**, and the totals are kept
deliberately small. The seed script prints a warning if either portfolio exceeds $25,000.

The option contract is chosen at seed time from the live chain (`_pick_option_symbol`), because a
hardcoded strike may not exist by the time it runs, and the unrealized loader drops lots it cannot
price — the option would silently vanish from the demo.

### 4.3 Reset

- **On boot:** `demo_reset.seed_if_empty()` restores the baked template if the database has no users.
  Falls back to a live seed if no template exists, which is what happens locally.
- **On an interval:** `WC_DEMO_RESET_MINUTES` (default 720 — 12 hours) re-runs the full seed in a daemon thread.
  Exceptions are logged rather than propagated — a failed reset should leave the previous data in
  place and retry next interval, not kill the thread and silently stop resetting.

On a free plan that sleeps after ~15 minutes idle, the wall-clock loop rarely fires, because the
process usually is not running. That is fine: a cold start restores the template, so **waking up is
the reset**.

---

## 5. Configuration

Set in `render.yaml`:

| Name | Value | Notes |
|---|---|---|
| `WC_DEMO_MODE` | `true` | Gates brokerage (503), import (503), registration (403); disables the `tickers.yml` allowlist; unlocks the seed script |
| `WC_DEMO_RESET_MINUTES` | `720` | 12 hours. 0 disables the loop, leaving boot restore in place |
| `JWT_SECRET` | `generateValue: true` | **Required.** Without it `auth.py` generates a random key per process and every visitor is logged out on each restart — constantly, on a plan that sleeps |
| `JWT_EXPIRE_MINUTES` | `120` | Shorter than the local 24h; a demo session has no reason to outlive its instance |
| `DATABASE_URL` | set in the Dockerfile | Must be explicit: the app default contains `wealthcompass.db`, which the seed guard refuses by design |
| `SNAPTRADE_*` | **absent** | No brokerage credentials reach the cloud until Stage 3 |

That `DATABASE_URL` note is not hypothetical — leaving it unset fails the boot seed rather than
silently running against a file named after the real database. The guard catching its own
misconfiguration is the intended behaviour.

---

## 6. Cost

**$0.** Render's free plan: 750 instance-hours/month, no payment details. The trade is that the
service sleeps after ~15 minutes idle, so the first visit after a quiet spell waits for the platform
to wake the container — typically 30–60s, on top of the app's own 2s.

If that becomes intolerable, the migration targets in rough order of cost: Koyeb (free, reportedly
no sleep), Fly (~$5/mo, always-on, `fly.toml` already written), Cloud Run (generous free tier, but
billing must be enabled).

---

## 7. Known gaps

Things that are true and undone. None block the demo; all matter before real data is involved.

1. **No `user_id` backfill migration.** `db/wealthcompass.db` predates the scoping work, so
   `design/cloud-launch` **refuses to open it** — `_assert_schema_current()` reports 14 tables
   missing `user_id`, plus `users` missing `is_test_user`.
   The guard is working correctly and modifies nothing, but it means `./server.sh start`
   against real data works **only on `main`**, and this branch cannot be merged until the migration
   exists. Every existing row belongs to user 1. Take a backup first.
2. **Postgres dialect work skipped.** `core/database.py` passes `check_same_thread` unconditionally
   and does not rewrite `postgres://` or set `pool_pre_ping`; `main.py`'s startup block emits
   SQLite-only DDL. Both would need doing before this could run on Postgres.
3. **`prices.py` uses a process-local `threading.Lock`.** Single worker only. More than one worker or
   machine and concurrent refreshes duplicate holdings again. Must become a per-user database
   advisory lock before scaling.
4. **No rate limit on `/auth/login`.** Unauthenticated and unthrottled. Acceptable while the only
   accounts hold fabricated data and their passwords are published; not acceptable in Stage 3.
5. **Bundle is 797 kB** (220 kB gzipped), mostly Recharts. Fine for a demo; code-splitting is the fix.

---

## 8. Stage 3 — the shape, not the detail

Full design lives in `ARCHITECTURE.md` §10–§12. This is the first stage where a real portfolio would
exist in the cloud, so it is the first where the threat model stops being theoretical: session-key
encryption, invite-gated registration, per-user SnapTrade credentials, per-user rate limits, cookie
sessions with server-side revocation, encrypted off-host backups.

Two items easy to forget and expensive to retrofit:

- Gap 3 above (the process-local lock) becomes a correctness bug rather than a constraint.
- The demo accounts' shared, published password is fine while their data is fake. Under an
  encryption model it stays fine — a demo DEK unwrapped by a public password protects data nobody
  cares about — but those accounts must be explicitly excluded from any "your data is private" claim
  in the UI. `is_test_user` already marks them.

---

## 9. Deploying

The branch is pushed. Nothing is deployed yet.

1. Sign up at render.com — free, no card. Authorize GitHub (the repo is private).
2. **New → Blueprint** → select the repo → **set the branch to `design/cloud-launch`**. It defaults
   to `main`, which has none of this.
3. Render reads `render.yaml`. The first build compiles the frontend, installs Python dependencies,
   and seeds the demo database.

Fallback if Blueprints misbehave on the free plan: **New → Web Service**, Docker runtime, same
branch, then set `WC_DEMO_MODE` and `JWT_SECRET` by hand.

Render auto-deploys on push to the tracked branch, which replaces the "deploy trigger" open question
from the original plan — no GitHub Action or API token needed.

### Verify after deploying

Against the public URL, not localhost: `/healthz` returns ok; the two demo accounts return disjoint
holdings; `POST /auth/register` returns 403; `POST /import/parse-statement` returns 503; brokerage
routes return 503; and the page loads no third-party scripts.
