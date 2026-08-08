# WealthCompass — Cloud Launch Plan (Fly.io, staged)

> **Data hygiene.** Like `ARCHITECTURE.md`, this file contains no real portfolio data and must not
> acquire any. Demo fixtures described here are fabricated and deliberately unrelated to the
> owner's actual holdings.

**Companion document:** `docs/ARCHITECTURE.md` — V1 describes the system as built, V2 the
multi-user target. This file is the deployment plan that gets V2 onto the internet in stages.

---

## 0. The local-data guarantee

The live database at `db/wealthcompass.db` is not touched by anything in this plan. That is not a
convention to remember — it is enforced four ways:

| Guarantee | Mechanism |
|---|---|
| Cloud never reads the local file | The cloud instance is a **separate, empty Postgres**. No script, migration, or deploy step references the local path. Nothing is copied up. |
| Local keeps running exactly as today | `DATABASE_URL` keeps its SQLite default. The legacy startup-migration block stays active for SQLite (§3.3), so local boot behaviour is byte-identical after the changes. |
| Seed/reset scripts **cannot** target local | Fail-closed guard: the script aborts unless `WC_DEMO_MODE=true` **and** the dialect is not SQLite **and** the URL does not contain `wealthcompass.db`. All three must pass. A destructive script that is incapable of pointing at the local file is stronger than one that merely doesn't. |
| Schema work happens on a copy | Stage 2's multi-tenancy migration is developed against a **copy** of the database, never the live file, and only lands locally after it is proven in the cloud. |

**Before the first code change lands**, take a snapshot:

```bash
./scripts/backup_db.sh          # verified, integrity-checked, → ~/Backups/WealthCompass
```

Stage 1 changes no schema at all, so this is belt-and-braces — but it costs seconds and the
existing script already refuses to keep a snapshot containing zero transactions.

---

## 1. The staged plan

| Stage | What ships | Real user data involved | Gate to proceed |
|---|---|---|---|
| **1. Demo** | Public URL, fake data, one shared demo login, hourly auto-reset | **None.** The cloud database holds only fabricated rows. | Deploy pipeline works; reset job proven; no real credentials in the cloud. |
| **2. Multi-tenant** | `user_id` scoping throughout; per-user recompute; leak test in CI | Still none in cloud — developed against fixtures | Cross-tenant leak test passes: a second seeded user sees zero rows of the first. |
| **3. Real accounts** | Session-key encryption, invite-gated signup, per-user SnapTrade credentials | Yes — this is the first stage that touches real portfolios | Ciphertext confirmed in a DB dump; restore-from-backup verified; per-user rate limits live. |

Stage 1 is deliberately worth shipping on its own: it proves the Dockerfile, the Postgres port, the
static-serving path, secrets handling, and the deploy loop **while there is nothing to lose**. Every
subsequent stage lands against infrastructure already known to work.

---

## 2. Stage 1 target architecture

```
                        Internet
                            │  HTTPS (Fly-managed cert, automatic)
                            ▼
        ┌──────────────── Fly.io app: wealthcompass ────────────────┐
        │                                                            │
        │   Machine "web"  (always-on, shared-cpu-1x)                │
        │   ┌────────────────────────────────────────────────┐      │
        │   │ uvicorn → FastAPI                              │      │
        │   │   /api/v1/*   → routers (demo mode: brokerage  │      │
        │   │                 + register disabled → 503/403) │      │
        │   │   /healthz    → liveness + DB ping             │      │
        │   │   /*          → built React SPA (static files) │      │
        │   └────────────────────────────────────────────────┘      │
        │                                                            │
        │   Machine "reset"  (scheduled, hourly)                     │
        │   └── python -m backend.scripts.seed_demo --reset          │
        │                                                            │
        └───────────────────────────┬────────────────────────────────┘
                                    │  DATABASE_URL (injected secret)
                                    ▼
                    Fly **Managed** Postgres  (automated backups)
                                    │
                                    ▼
                    yfinance → Yahoo Finance (public quotes only)
```

Single origin: the API and the frontend are the same host, so **CORS never enters the picture** —
which is how it works locally today, except the Vite dev proxy is replaced by FastAPI serving the
built assets.

**Not present in Stage 1:** SnapTrade credentials, Anthropic API key, any real user's data,
registration, encryption (there is nothing to encrypt).

> ⚠️ **Use Fly *Managed* Postgres, not the legacy "Fly Postgres" app.** The older offering is a
> Postgres container running in your own org — Fly is explicit that it is not managed, and backups
> and failover are yours to configure. People have lost data assuming otherwise.

---

## 3. What must change in the codebase

Four things block containerization today. All four are Stage 1 work, and none of them alters local
behaviour.

### 3.1 There is no dependency manifest — blocker

`backend/` has no `requirements.txt` and the repo has no `pyproject.toml`. Dependencies currently
live in whatever Python the machine happens to have. A container cannot be built from that.

Create `backend/requirements.txt` with **pinned** versions covering what the code actually imports:

```
fastapi · uvicorn[standard] · sqlalchemy · pydantic
python-jose[cryptography] · bcrypt · python-dotenv
pyyaml · pandas · yfinance · snaptrade-client
psycopg[binary]          # new — Postgres driver
```

`vertexai` is excluded deliberately: its only importer is `api/archive/ai_import.py`, which is not
registered as a router and must not be imported at startup. Pin exact versions (`==`) rather than
ranges — a container that builds differently next month is not reproducible.

### 3.2 `check_same_thread` is SQLite-only — blocker

`core/database.py` passes `connect_args={"check_same_thread": False}` unconditionally. psycopg
rejects it. Also, Fly hands out `DATABASE_URL` in `postgres://` form, which SQLAlchemy 2.x no longer
accepts as a driver name.

```python
url = os.getenv("DATABASE_URL", "sqlite:///./db/wealthcompass.db")
if url.startswith("postgres://"):                      # Fly's form → SQLAlchemy's form
    url = url.replace("postgres://", "postgresql+psycopg://", 1)

connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True)
```

`pool_pre_ping` matters on a hosted database: idle connections get dropped by the network, and
without it the first request after an idle period fails.

### 3.3 Startup migrations emit SQLite-only DDL — blocker

`main.py::startup_event` runs `CREATE TABLE ... id INTEGER PRIMARY KEY AUTOINCREMENT` — valid SQLite,
a syntax error on Postgres. The `ALTER TABLE ... BOOLEAN NOT NULL DEFAULT 0` blocks are also
SQLite-flavoured.

None of it is needed on a fresh cloud database: `Base.metadata.create_all()` already produces the
current schema. Gate the legacy block on the dialect:

```python
if engine.dialect.name == "sqlite":
    ...the existing ~100 lines of guarded ALTER/CREATE, unchanged...
```

This is the change that makes the local-behaviour guarantee literal: for SQLite the block still runs
exactly as it does today, so nothing about local startup changes. (Stage 2 replaces the whole block
with Alembic; carrying hand-written DDL across two dialects is not sustainable.)

### 3.4 The frontend is not production-built — blocker

`index.html` loads **Tailwind from a CDN** (`cdn.tailwindcss.com`, which is explicitly not intended
for production) and declares an **importmap pointing React, Recharts, and `@google/genai` at
esm.sh**. In a hosted deployment that means every page load depends on two third parties, and the
importmap can shadow what Vite bundled.

Stage 1 work:
- Add Tailwind as a real build dependency and generate a CSS file at build time.
- Remove the `esm.sh` importmap so Vite bundles React and Recharts into the app.
- Drop the `@google/genai` entry — nothing imports it.
- Serve the result from FastAPI:

```python
app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")          # registered LAST, after every router
def spa(full_path: str):
    return FileResponse("frontend/dist/index.html")
```

The catch-all must be registered after the API routers, or it swallows `/api/v1/*`. Since the app
has no client-side router, a plain `index.html` fallback is sufficient.

### 3.5 Demo mode (new)

A single env flag, `WC_DEMO_MODE=true`, that:

- returns **503** from every `/api/v1/brokerage/*` route and `/buying-power` — there are no SnapTrade
  credentials in Stage 1, and a 503 with a clear message beats a stack trace;
- returns **403** from `POST /auth/register` — the demo instance never accepts signups;
- surfaces a persistent banner in the UI: *demo data, resets hourly, not a real portfolio*;
- unlocks the seed/reset script (§0 — the script refuses to run without it).

### 3.6 Health check (new)

Fly needs a liveness endpoint. `GET /` currently returns `{"Hello": "World"}`, and in Stage 1 it
becomes the SPA. Add `GET /healthz` that runs `SELECT 1` and returns 200 — a health check that
doesn't touch the database will happily report green while every request 500s.

---

## 4. Demo data design

### 4.1 It must be generated *through the app*, not inserted

The demo fixture is a **CSV** committed at `backend/fixtures/demo_statement.csv`, loaded by running
it through the real import path — `csv_data_parse()` → ledger → `process_transactions()`. Hand-
inserting rows into `holdings` and `unrealized_gains` would let the demo drift into a state the
pipeline can't actually produce, and the demo would then be lying about what the app does.

### 4.2 What the fixture should contain

Enough to exercise every view, and nothing else:

| Element | Why it's in the fixture |
|---|---|
| 2 brokerages, ~8 tickers | Populates the brokerage filter and account grouping |
| ~40 transactions across ~3 years | Gives the gains views a real date range |
| Buys and partial sells | Exercises FIFO lot matching and realized gains |
| One long-term and one short-term closed lot | Both tax classifications visible |
| One position with a stock split before it | Exercises `stock_split_utils` |
| One options position (OCC symbol) | Populates OptionsView and the calculator |
| A sell at a loss with a repurchase inside 30 days | Makes the wash-sale columns non-empty |
| Cash deposits/withdrawals | Gives a non-zero cash balance |

**Tickers must be real, well-known large-caps** so yfinance returns genuine quotes and the charts
look alive — but **quantities, dates, and cost bases are entirely fabricated**, and the ticker set
must be chosen so it does **not** mirror the owner's actual holdings. A demo that accidentally
reproduces the real portfolio's shape is a data leak wearing a costume.

### 4.3 The hourly reset

A **separate Fly scheduled machine** runs `python -m backend.scripts.seed_demo --reset` every hour:

```
1. verify guards (demo mode + non-SQLite + not the local filename)  ← aborts otherwise
2. truncate every data table
3. re-import the fixture CSV through the normal import path
4. run process_transactions()
5. create the demo user with the published demo password
```

A separate machine rather than an in-process timer, so an app restart mid-reset cannot leave the
demo half-seeded, and so the reset keeps running independently of web traffic.

Because Stage 1 has no `user_id` scoping yet, "reset" means *wipe everything* — which is precisely
why the guards in §0 exist and why this script must never be runnable against SQLite.

---

## 5. Configuration and secrets

Set via `fly secrets set` (encrypted at rest, injected as env vars at runtime — this also closes the
P1 "secrets sitting in `.env`" gap from `ARCHITECTURE.md` §8.2):

| Name | Stage 1 | Notes |
|---|---|---|
| `DATABASE_URL` | auto | Injected by Fly when Managed Postgres is attached |
| `JWT_SECRET` | **required** | Must be pinned — the random per-process fallback would log every demo visitor out on each deploy |
| `JWT_EXPIRE_MINUTES` | optional | Shorter than local's 24h is fine for a demo |
| `WC_DEMO_MODE` | `true` | Gates §3.5 behaviour and unlocks the reset script |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | **required** | Published on the login page — deliberately public |
| `SNAPTRADE_*` | **absent** | No brokerage credentials reach the cloud until Stage 3 |
| `ANTHROPIC_API_KEY` | **absent** | Chat is not in Stage 1 |

`fly.toml` pins: one always-on `web` machine (do **not** scale to zero — a stopped machine runs no
scheduled work and gives visitors a cold-start delay), the `/healthz` check, and `force_https`.

---

## 6. Cost

Approximate, and worth verifying at signup since pricing moves:

| Item | Monthly |
|---|---|
| `web` machine, shared-cpu-1x, 512MB, always-on | ~$3–7 |
| `reset` scheduled machine (runs seconds per hour) | negligible |
| Fly Managed Postgres, smallest tier | ~$10–30 |
| **Total** | **~$15–35** |

Fly bills by the second, so the reset machine costs almost nothing. Postgres is the floor.

---

## 7. Stages 2 and 3 — the shape, not the detail

Full design lives in `ARCHITECTURE.md` §10–§12; this is how it lands on the deployed instance.

**Stage 2 — multi-tenancy.** `user_id` on every user-data table; a scoped query layer that makes an
unfiltered query hard to write; per-user loaders; Alembic replacing the startup DDL block; the
cross-tenant leak test in CI. Deployed to the same Fly app, still demo-only — the demo user simply
becomes *a* user rather than *the* user. Nothing about the local database changes until this is
proven in the cloud, and even then it lands locally only against a backup.

**Stage 3 — real accounts.** Session-key encryption (`ARCHITECTURE.md` §11), invite-gated
registration, per-user SnapTrade credentials, per-user rate limits, cookie sessions with server-side
revocation, encrypted off-host backups. This is the first stage where a real portfolio exists in the
cloud, so it is also the first stage where the §11 threat model stops being theoretical.

Two Stage 3 items that are easy to forget and expensive to retrofit:

- The `threading.Lock` in `prices.py` is process-local. The moment there is more than one machine or
  worker, concurrent refreshes duplicate holdings again. It must become a **per-user database
  advisory lock**.
- The demo user's shared, published password is fine while its data is fake. Under Stage 3's
  encryption model that is still fine — the demo DEK is unwrapped by a public password, protecting
  data nobody cares about — but the demo account must be explicitly excluded from any "your data is
  private" claim in the UI.

---

## 8. Work breakdown — Stage 1

| # | Task | Notes |
|---|---|---|
| 1 | `./scripts/backup_db.sh` | Before anything else |
| 2 | `backend/requirements.txt`, pinned | §3.1 — the hard blocker |
| 3 | Dialect-aware `database.py` | §3.2 |
| 4 | Gate startup DDL on `dialect == "sqlite"` | §3.3 — keeps local identical |
| 5 | Tailwind as a build dep; remove esm.sh importmap | §3.4 |
| 6 | Serve `frontend/dist` from FastAPI + SPA fallback | §3.4 — catch-all registered last |
| 7 | `GET /healthz` with a DB ping | §3.6 |
| 8 | `WC_DEMO_MODE` gating | §3.5 |
| 9 | `Dockerfile` (multi-stage: node build → python runtime) + `.dockerignore` | Must exclude `db/`, `data/`, `.env` |
| 10 | `backend/fixtures/demo_statement.csv` | §4.2 — fabricated, unrelated to real holdings |
| 11 | `backend/scripts/seed_demo.py` with the three fail-closed guards | §0 + §4.3 |
| 12 | `fly.toml`; `fly launch`; attach Managed Postgres; set secrets | §5 |
| 13 | Scheduled reset machine | §4.3 |
| 14 | Verify: local app still starts against SQLite, unchanged | The real acceptance test |

Item 14 is not a formality. After items 2–8 land, the local app must boot against the existing
SQLite file and show identical numbers. If it doesn't, stop and fix that before deploying anything.

---

## 9. Open items

1. **Region.** Fly deploys to a chosen primary region; pick the one nearest the intended audience.
2. **Custom domain.** Fly gives a `*.fly.dev` hostname free; a custom domain needs a DNS record and
   a Fly-issued certificate. Not required for Stage 1.
3. **Deploy trigger.** Manual `fly deploy` initially. A GitHub Action on push to `main` is a Stage 2
   nicety, and needs a `FLY_API_TOKEN` repository secret.
4. **`config/tickers.yml` in the cloud.** The pipeline honours this allowlist when present. The cloud
   image must ship the **demo** ticker list, never the owner's — the `.dockerignore` and the
   still-outstanding P0 fix from `ARCHITECTURE.md` §8.2 both bear on this.
