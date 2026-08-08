# WealthCompass — Architecture (V1 as built, V2 as planned)

> **Document hygiene.** This file describes *structure*, never *contents*. It contains no real
> tickers, share counts, cost bases, balances, account names or IDs, credentials, or personal
> identifiers, and it must not acquire any. All examples use placeholders (`TICK`, `<brokerage>`,
> `<account>`). This is the file most likely to be shared or made public — keep it data-free.

**How to read this.** §1–§5 describe **V1**, the system that exists today: single-user,
localhost-only, unencrypted. §6–§11 describe **V2**, the target: multiple users, hosted on a
server, with an AI chat that reviews portfolio performance — and a security model where the
person running the server cannot read another user's holdings. §12 sequences the work. Nothing
in the V2 sections is built yet.

---

# Part I — V1: the system as built

## 1. What V1 is

A single-user, self-hosted portfolio tracker. It ingests brokerage activity (CSV export or API
sync), normalizes it into one transaction ledger, and derives tax lots, realized and unrealized
gains, holdings, and cash position from that ledger.

Three design commitments shape everything below:

| Commitment | Consequence |
|---|---|
| **The transaction ledger is the only source of truth.** | Every other table is a projection that can be dropped and rebuilt by `process_transactions()`. |
| **Runs entirely on the owner's machine.** | SQLite file, no hosted database, no telemetry, no analytics. |
| **Manual corrections outrank imported data.** | Reset/re-import snapshots user edits and replays them onto freshly seeded rows. |

**V1 non-goals (by construction, not omission):** multi-user hosting, real-time streaming quotes,
order execution, tax filing output.

## 2. Topology

```
┌─────────────────────────── the owner's machine ───────────────────────────┐
│                                                                            │
│   Browser (React 19 + Vite dev server :5173)                               │
│      │  fetch /api/v1/*   — JWT bearer from localStorage                   │
│      │  vite proxy → localhost:8000                                        │
│      ▼                                                                     │
│   FastAPI (uvicorn :8000)                                                  │
│      ├── api/        route handlers, Pydantic request/response models      │
│      ├── core/       processing pipeline, parsers, price fetch             │
│      └── db/         SQLAlchemy models (single source of schema truth)     │
│      │                                                                     │
│      ▼                                                                     │
│   SQLite  ./db/wealthcompass.db      (unencrypted file on disk)            │
│                                                                            │
└────────────┬──────────────────────────┬─────────────────────┬─────────────┘
             │                          │                     │
             ▼                          ▼                     ▼
      SnapTrade API             Yahoo Finance             CDNs, from the
   (brokerage read-only      (yfinance: quotes,          browser only:
    connections, activity,    prev close, analyst        tailwindcss,
    balances, positions)      targets, sector)           esm.sh, fonts
```

Both servers bind `0.0.0.0`, so the app is reachable from the LAN and from the tailnet
(`allowedHosts` in `vite.config.ts` permits `.ts.net`). Nothing is port-forwarded to the public
internet.

## 3. Backend

### 3.1 Stack

FastAPI · SQLAlchemy (declarative, no ORM relationships) · SQLite · `python-jose` (JWT) ·
`bcrypt` · `yfinance` · `snaptrade_client` · `PyYAML` · `python-dotenv`.

No Alembic. Schema changes are applied as guarded `ALTER TABLE` blocks in
`main.py::startup_event`, which runs after `Base.metadata.create_all()` on every boot. Each block
checks the live column list before altering, so startup is idempotent.

### 3.2 Module map

```
backend/app/
├── main.py                     app construction, startup migrations, router registration
├── api/                        one module per resource; all return Pydantic models
│   ├── auth.py                 register / login / me / status, JWT issue + verify
│   ├── transactions.py         ledger CRUD, reset & replay, derived-table reads, buying power
│   ├── manual_import.py        CSV text → raw rows → ledger
│   ├── brokerage.py            SnapTrade connections, accounts, sync trigger
│   ├── snaptrade.py            SnapTrade client wrapper (NOT a router — imported by brokerage.py)
│   ├── prices.py               live re-quote of open lots (lock-serialised)
│   ├── analyst.py              yfinance analyst targets / sector, cached in DB
│   ├── lot_assignments.py      explicit sell → buy lot mapping
│   ├── options.py              open option positions, retain quantities, breakeven calculator
│   ├── splits.py               stock split CRUD
│   ├── preferences.py          schemaless cross-device UI prefs
│   └── archive/ai_import.py    unregistered; Vertex AI statement parsing (dormant)
├── core/
│   ├── process.py              process_transactions() — the recompute entry point
│   ├── statement_parser.py     CSV text → dicts, driven by brokerage_configs
│   ├── brokerage_configs.py    per-brokerage column map, delimiter, date format
│   ├── stock_fetcher.py        yfinance quotes; OCC option symbol parse + chain lookup
│   ├── stock_split_utils.py    apply split ratios to historical lots
│   ├── stock_split_seeds.py    well-known historical splits, seeded each startup
│   ├── transaction_actions.py  canonical action vocabularies (BUY/SELL/TRANSFER/…)
│   ├── utils/{asset_type,ticker}.py
│   └── table_loader/           the four projection builders (§5.2)
└── db/schema.py                every table, every column
```

### 3.3 API surface

All routes are under `/api/v1`. Everything except the four `auth` routes is wrapped in
`Depends(get_current_user)` at registration time in `main.py`.

| Group | Routes |
|---|---|
| **Auth** | `POST /auth/register` (first user only) · `POST /auth/login` · `GET /auth/me` · `GET /auth/status` |
| **Ledger** | `GET /transactions` · `PATCH /transactions/{id}` · `POST /transactions/{id}/revert` · `POST /transactions/{id}/split` · `PATCH /transactions/{id}/verify` · `PATCH /transactions/{id}/hidden` · `PATCH /transactions/account/bulk` · `DELETE /transactions/{id}` · `DELETE /transactions/raw` |
| **Recompute** | `POST /transactions/reset` (re-seed from raw + replay edits) · `POST /transactions/clear` · `POST /realized-gains/process` |
| **Derived reads** | `GET /holdings` · `GET /realized-gains` · `GET /unrealized-gains` · `GET /cash-balance` |
| **Import** | `POST /import/parse-statement` |
| **Brokerage** (`/brokerage`) | `GET /connect-url` · `GET /connections` · `GET /accounts` · `PATCH /accounts/{id}` · `DELETE /accounts/{id}/ignore` · `DELETE /connections/{auth_id}` · `POST /sync` · `POST /backfill-account-ids` |
| **Market data** | `POST /prices/refresh` · `GET /analyst/{ticker}` · `POST /analyst/batch` · `GET /analyst/cached` · `GET /buying-power` · `GET /buying-power/cached` |
| **Lots & options** | `GET /lot-assignments` · `POST /lot-assignments` · `DELETE /lot-assignments/{id}` · `GET /lot-assignments/open-buys` · `GET /options/positions` · `PUT /options/retain` · `GET /options/calculator` |
| **Corporate actions** | `GET /splits` · `POST /splits` · `DELETE /splits/{id}` |
| **Preferences** | `GET /preferences` · `PUT /preferences` |

## 4. Data model (V1)

SQLite, 16 tables, defined once in `backend/app/db/schema.py`. No foreign-key constraints — links
are by convention (`raw_id`, `account_id`) and enforced in code.

### 4.1 Raw ingestion (append-only inputs)

| Table | Purpose | Notable columns |
|---|---|---|
| `manual_raw_transactions` | Verbatim rows parsed from an uploaded CSV, before normalization. | `brokerage`, `date`, `ticker`, `action`, `quantity`, `price`, `costPerShare`, `totalCost`, `assetType` |
| `snaptrade_transactions` | Verbatim activity pulled from SnapTrade. | `snaptrade_transaction_id` (unique — the dedupe key), `authorization_id`, `account_id`, `option_symbol`, `currency`, `amount` |

### 4.2 The ledger

| Table | Purpose |
|---|---|
| `transactions` | The normalized, unified ledger. Every derived number traces back here. |

Flag columns carry all the human judgment layered onto imported data:

| Column | Meaning |
|---|---|
| `raw_id` + `source` | Back-link to the originating raw row (`'manual'` \| `'snaptrade'`). |
| `is_deleted` | Soft-hide; excluded from every computation. |
| `is_override` | A field was hand-edited; `original_values` holds pre-edit JSON for revert. |
| `is_duplicate` | Same event arrived from two sources (typical for CSV history + API sync overlap). |
| `is_backend_verified` | Hand-curated seed lot. Set **only** via `PATCH /transactions/{id}/verify`; never by a loader or sync. Survives re-import and reset. |
| `current_brokerage` | Set when shares were transferred to another brokerage (ACATS), so the lot follows the position. |
| `option_symbol` | OCC symbol, spaces stripped (`TICK` + `YYMMDD` + `C`/`P` + 8-digit strike). |

### 4.3 Derived projections — rebuilt, never edited

| Table | Grain | Built by |
|---|---|---|
| `realized_gains` | one closed lot slice | `realized_gain_loader` |
| `unrealized_gains` | one open tax lot | `unrealized_gain_loader` |
| `holdings` | one position per `(brokerage, account, ticker)` | `holding_loader` |
| `ticker_references` | first-purchase date + price per ticker | `ticker_reference_loader` |

`realized_gains` carries `isLongTerm`, `is_wash_sale`, `wash_sale_disallowed_amount`.
`unrealized_gains` carries `prevClose` (drives daily P&L) plus two distinct wash-sale states:
`wash_sale_adjustment` / `wash_sale_clear_date` (this lot *absorbed* a disallowed loss) and
`wash_sale_at_risk` / `wash_sale_risk_trigger_date` (selling at a loss *today* would be disallowed).

### 4.4 User intent — preserved across every rebuild

| Table | Purpose |
|---|---|
| `lot_assignments` | Explicit sell→buy lot mapping. Overrides default FIFO matching. |
| `transaction_split_configs` | User-defined split of one raw row into pieces; replayed on reset. Unique on `(raw_id, source)`. |
| `options_retain` | Contracts to hold back per option lot. Unique on `(brokerage, ticker, buy_date)`. |
| `stock_splits` | Split ratios applied to pre-split lots. Unique on `(ticker, split_date)`. |

### 4.5 Reference and cache

| Table | Purpose |
|---|---|
| `users` | `email` + bcrypt `hashed_password`. Registration refuses a second row. |
| `brokerage_accounts` | Authoritative account-name reference, keyed by `snaptrade_account_id`. |
| `snaptrade_connections` | Brokerage authorizations (`authorization_id`). |
| `snaptrade_ignored_accounts` | Accounts excluded from sync. |
| `portfolio_summary` | **Single row, `id=1`.** Caches everything slow: `cash_balance`, `buying_power_json`, `analyst_json`, `ui_prefs_json`. |

> `portfolio_summary` is why page loads are instant: the browser never waits on SnapTrade or Yahoo
> during mount — it reads the last cached blob and refreshes in the background.

**No table has a `user_id` column.** The database is structurally single-tenant. This is the single
largest V1→V2 gap; see §7.

## 5. Data flow (V1)

### 5.1 Ingestion

```
CSV text ──► POST /import/parse-statement
              │  statement_parser + brokerage_configs (per-brokerage column map)
              ├─► manual_raw_transactions   (always: full verbatim record)
              └─► transactions              (only rows predating SnapTrade's coverage
                                             for that brokerage+ticker — manual fills
                                             history, API owns the recent window)

SnapTrade ──► POST /brokerage/sync
              │  dedupe on snaptrade_transaction_id
              ├─► snaptrade_transactions
              └─► transactions   (flagged is_duplicate when an authoritative manual or
                                  verified row already covers the same event)
```

Re-importing a CSV deletes that brokerage's prior manual rows — **except** `is_backend_verified`
ones, which are curated seed lots.

### 5.2 Recompute

`core/process.py::process_transactions(db, brokerage_name=None)` is the single entry point, called
after every import, sync, edit, split, or reset. Three loaders in fixed order, threading state:

```
realized_gain_load()      → returns open_lots_by_ticker
      │ walks the ledger chronologically, matches sells to buys
      │ honours lot_assignments first, FIFO for the remainder
      │ applies stock_splits to pre-split lots
      │ classifies long/short term, detects wash sales
      ▼
unrealized_gain_load(open_lots)  → returns prev_close_cache
      │ prices each surviving open lot (equity quote, or option chain via OCC symbol)
      ▼
holding_load(prev_close_cache)
      │ aggregates open lots into positions, reusing cached prev closes
      ▼
cash_balance   (full reprocess only — sums Cash-type ledger rows into portfolio_summary)
```

An optional `config/tickers.yml` allowlist restricts the pipeline to a named ticker set.

### 5.3 Reset and replay

`POST /transactions/reset` is destructive-then-restorative:

1. Snapshot every ledger row carrying user intent (`is_deleted`, `is_override`,
   `is_backend_verified`, `is_duplicate`, changed `current_brokerage`, edited fields, `account_id`),
   keyed by `(raw_id, source)`.
2. Wipe `transactions`.
3. Re-seed from the raw tables.
4. Replay the snapshot onto the new rows by that same key.
5. Run `process_transactions()`.

`lot_assignments`, `transaction_split_configs`, `options_retain`, and `stock_splits` live in their
own tables and are untouched by the wipe.

### 5.4 Price refresh

`POST /prices/refresh` re-quotes open lots and rebuilds `holdings` **without** touching lot
structure, lot assignments, or realized gains. Two properties matter:

- Serialised on a module-level `threading.Lock`. `holding_loader.load()` is delete-then-insert with
  a commit between; two concurrent refreshes interleave into duplicated holdings and a doubled
  portfolio total. The app is open on more than one device, so this is reachable in normal use.
  **This lock is process-local — it does not survive the move to multiple workers (§9).**
- Option expiry is decided from the OCC symbol's encoded expiry date, never from "yfinance returned
  nothing" — a rate limit must not mark a live position worthless.

Quotes are fetched through a bounded `ThreadPoolExecutor` (8 workers) to stay under Yahoo's rate
limiting.

## 6. Frontend (V1)

React 19 · TypeScript 5.8 · Vite 6 · Recharts. Tailwind loads from CDN in `index.html`;
React/Recharts resolve through an `importmap` pointing at `esm.sh`. `react-plaid-link` is a
dependency but Plaid is dead code (§14).

```
frontend/
├── index.html                 CDN tailwind, importmap, mobile viewport/safe-area CSS
├── App.tsx                    auth gate → AuthenticatedApp: all shared state lives here
├── types.ts                   shared domain types
├── services/apiService.ts     every fetch call; injects the bearer token, 401 → logout
├── components/
│   ├── Dashboard/{DashboardView,SummaryCards,PortfolioVisuals,AIInsights}.tsx
│   ├── HoldingsView · GainsLossesView · TransactionsView · OptionsView · ImportDataView
│   ├── Sidebar · MobileTabBar · Navbar · navItems.ts   (one nav list, two renderers)
│   └── TickerLogo · TrendIndicator · SortIndicator · ColumnOrderSheet
├── contexts/TickerTypeContext.tsx
├── hooks/{useSyncedColumnOrder,useClickOutside}.ts
└── utils/{finance,sort}.ts
```

State is deliberately centralized: `AuthenticatedApp` owns holdings, transactions, gains, cash,
buying power, accounts, and the cross-view filter set, and passes them down. No state library, no
router — `activeTab` selects the view.

**Load sequence.** Mount fires five parallel DB-only reads (`/holdings`, `/brokerage/accounts`,
`/cash-balance`, `/buying-power/cached`, `/analyst/cached`) — no external API on the critical path.
Analyst refresh and price refresh fire in the background. SnapTrade is hit only on explicit
sync/refresh. The full-screen spinner is reserved for import and processing, never normal page load.

**Preferences.** Column order and similar UI state round-trip through `GET`/`PUT /preferences` into
`portfolio_summary.ui_prefs_json`, so a phone and a laptop agree. The endpoint is intentionally
schemaless — adding a preference is a frontend-only change.

## 7. V1 external dependencies and egress

The privacy question reduces to this table. Every arrow leaving the machine is here.

| Destination | Triggered by | What leaves | What it can infer |
|---|---|---|---|
| **SnapTrade** | connect, `/brokerage/sync`, `/buying-power` | API credentials + user secret; requests scoped to connected accounts | Everything. SnapTrade holds the brokerage link and returns full activity, positions, and balances — it necessarily knows the portfolio. |
| **Yahoo Finance** (`yfinance`) | price refresh, analyst batch, processing | The list of ticker and OCC option symbols held | Which securities are held, and roughly how that set changes over time. **Not** share counts, cost basis, or account values. |
| **cdn.tailwindcss.com, esm.sh, fonts.googleapis.com** | every browser page load | Browser IP, user agent, referrer | That this machine loads this app. No portfolio data. |
| **Google Vertex AI** | — | Nothing. `archive/ai_import.py` is not registered as a router. | — |

Nothing else. No analytics, no error reporting, no crash telemetry, no outbound logging.
`getPortfolioInsights()` in `apiService.ts` is a stub returning a fixed string — the "AI Wealth
Intelligence" card sends nothing anywhere today.

**Secrets** live in `.env` (root) and `.gemini/.env`, both gitignored. Names only: `JWT_SECRET`,
`JWT_EXPIRE_MINUTES`, `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `SNAPTRADE_USER_ID`,
`SNAPTRADE_USER_SECRET`, `PLAID_*` (unused), `GOOGLE_CLOUD_*` / `GEMINI_MODEL` (Gemini CLI config,
not read by the app). `vite.config.ts` deliberately declines to `define` any API key, which would
inline it into the browser bundle.

## 8. V1 security posture

### 8.1 What is already right

- **Local-first.** The database never leaves the machine.
- **Secrets properly excluded.** `.gitignore` covers `.env`, `*.db`, `/db/`, `data/`, `.gemini/`.
  `git ls-files` confirms no database, `.env`, or CSV is tracked.
- **Auth correctly built.** bcrypt with per-password salt; JWT with expiry; every non-auth router
  gated at registration rather than per-handler, so a new route cannot be added unauthenticated by
  forgetting a decorator.
- **No key in the browser bundle**, explicitly reasoned about in `vite.config.ts`.
- **Registration closed after the first user.**
- **Backups verified, not assumed.** `scripts/backup_db.sh` uses SQLite's online `.backup`, runs
  `PRAGMA integrity_check`, and refuses to keep a snapshot with zero transactions — so a reset
  can't silently become the newest "good" backup.
- **Not exposed to the internet.** LAN and tailnet only.
- **Minimal egress.** Only symbols reach Yahoo; amounts never do.

### 8.2 V1 gaps, ranked

**P0 — real portfolio data is committed to this repository.** Two tracked files carry live
holdings: `context.md` (a verification table with tickers, share counts, and average cost per
share, plus brokerage attribution) and `config/tickers.yml` (the full tracked-ticker list). Both
are in git history, so deleting them now does not remove them. This is the one finding that is
*already* a disclosure rather than a risk of one. Fix: move both to gitignored `data/`, ship
`config/tickers.example.yml`, and if the repo has ever been pushed anywhere non-private, rewrite
history (`git filter-repo`) and treat the old contents as disclosed.

**P1 — the database and its backups are unencrypted at rest.** `wealthcompass.db` is a plain file;
`backup_db.sh` writes gzipped (not encrypted) copies, and its own docs suggest pointing
`WC_BACKUP_DIR` at a synced folder — which would push an unencrypted dossier to a cloud provider.
FileVault covers the powered-off case only. Fix: pipe the existing `.backup` output through `age`
or `gpg` — a three-line change that keeps the integrity check and makes off-machine copies safe.

**P1 — plaintext HTTP over the LAN/tailnet.** Credentials and the bearer token cross the network
unencrypted. On a tailnet WireGuard covers the transport; on shared Wi-Fi nothing does. The JWT
lives in `localStorage` with a 24-hour default lifetime, no refresh, and no revocation list.

**P1 — `JWT_SECRET` falls back to a random per-process value.** `os.getenv("JWT_SECRET") or
secrets.token_hex(32)` is the right *default* (fail-safe, not fail-open), but a missing env var
silently invalidates every token on restart with no warning. Pin it in `.env` and log a startup
warning when the fallback fires.

**P2 — no rate limiting or lockout on `POST /auth/login`.** bcrypt makes brute force slow, not
impossible, and failed attempts are not logged.

**P2 — structurally single-tenant** (see §9). Registration blocks a second user, so this is safe
*today*, but it is a schema-wide change, not a feature.

**P2 — no CORS middleware is configured.** Correct for the current setup (the Vite proxy makes
requests same-origin) and it fails closed. Recorded here so nobody "fixes" it with
`allow_origins=["*"]`.

**P2 — verbose transaction logging to stdout.** `snaptrade.py` prints per-transaction detail
(ticker, amount, units, account ID) during sync, so terminal scrollback contains trade data. Drop
these to `logger.debug`.

---

# Part II — V2: multi-user, hosted, with AI chat

## 9. What V2 changes, and why the three changes are coupled

V2 has three headline features. They are listed separately but must land in a specific order,
because each is unsafe without the one before it.

| Change | What it means | Blocked by |
|---|---|---|
| **Multi-tenancy** | Several people have accounts; each sees only their own portfolio. | Nothing — this is first. |
| **Hosting** | The app runs on a server reachable over the internet, not just `localhost`/tailnet. | Multi-tenancy **and** encryption. Hosting a single-tenant app with more than one login means user B sees user A's entire portfolio. |
| **AI chat** | A conversational assistant that reviews portfolio performance, concentration, gains, and wash-sale exposure. | Multi-tenancy (scoping the digest) and per-user cost controls. |

Plus the security property the whole design is built around:

> **Target: the person operating the server cannot read another user's holdings.**

That sentence is achievable, but only with a precise definition of *cannot* — §11 gives three
tiers, what each actually stops, and what each costs. Handwaving it produces a system that sounds
private and isn't.

## 10. V2 multi-tenancy

### 10.1 The scoping change

Every table that holds user data gains a `user_id` column and every query is filtered by it.
Concretely:

| Table | V2 change |
|---|---|
| `transactions`, `manual_raw_transactions`, `snaptrade_transactions` | add `user_id`, index `(user_id, ticker)`, `(user_id, date)` |
| `holdings`, `realized_gains`, `unrealized_gains`, `ticker_references` | add `user_id`; loaders delete/insert **within one user's scope only** |
| `lot_assignments`, `transaction_split_configs`, `options_retain` | add `user_id`; uniqueness constraints become `(user_id, …)` |
| `brokerage_accounts`, `snaptrade_connections`, `snaptrade_ignored_accounts` | add `user_id`; `snaptrade_account_id` uniqueness becomes `(user_id, snaptrade_account_id)` |
| `portfolio_summary` | drop the `id=1` singleton; primary key becomes `user_id` |
| `stock_splits` | **stays global.** Split ratios are public reference data, identical for every user. |
| `users` | gains `snaptrade_user_id`, `snaptrade_user_secret_enc`, `created_at`, `is_active` |

### 10.2 The part that is not a schema change

`process_transactions()` and the four loaders recompute by delete-then-insert today, and each
loader's `delete()` is unfiltered unless a `brokerage_name` is passed — the default path is
`db.query(Holding).delete()`, i.e. the whole table. Each one needs per-user scoping, and a single missed filter silently
mixes two people's tax lots into one set of numbers, with no error and no obvious symptom. This is
the highest-risk part of V2.

Three defences, all of them cheap:

1. **Make the unfiltered query impossible to write.** Route every user-data query through a helper
   that takes a `UserScope` and injects the filter, and make the raw `db.query(Model)` path fail
   review. A repository/`scoped_session` layer that *cannot* produce an unscoped statement is worth
   more than a code-review convention.
2. **Assert on write.** Every loader's `delete()` and `insert()` asserts a non-null `user_id`.
   Fail closed: a missing scope raises, never defaults to "all rows".
3. **A cross-tenant leak test in CI.** Seed two users with distinct fixture ledgers, run the full
   pipeline for user A, and assert user B's derived tables are byte-identical before and after.
   This single test catches the entire class of bug.

### 10.3 Per-user brokerage credentials

Today SnapTrade credentials are module-level env vars in `snaptrade.py` (`USER_ID`,
`USER_SECRET`). In V2 each user has their own SnapTrade user + secret, created at first connect
and stored encrypted on the `users` row. `SNAPTRADE_CLIENT_ID` / `CONSUMER_KEY` stay
application-level (they identify the app to SnapTrade, not the user).

### 10.4 Database

SQLite is fine for a handful of users on one process with WAL enabled. It stops being fine when
the write pattern is the one this app has: `holding_loader` and the gain loaders do
delete-then-insert of whole table slices, which holds a write lock for the duration. With N users
recomputing concurrently, that serialises everything.

**Recommendation: move to PostgreSQL at hosting time**, not before. The SQLAlchemy models port
essentially unchanged; the work is in the startup-migration blocks, which should become Alembic
migrations in the same change (`ALTER TABLE` guards accumulate badly across two engines). Keep
SQLite as the local-development database.

### 10.5 Concurrency correctness that stops working when hosted

`prices.py` guards against duplicated holdings with a module-level `threading.Lock`. That lock is
per-process. The moment the app runs under multiple uvicorn workers or more than one container,
two refreshes can run concurrently again and re-introduce the doubled-portfolio bug. Replace it
with a database-level advisory lock keyed by `user_id` (Postgres `pg_advisory_xact_lock`), so the
guarantee holds across processes and is per-user rather than global.

## 11. V2 security: "even the host can't read your data"

### 11.1 What is at stake

The database is a complete financial dossier: every trade with date, price, and quantity; cost
basis and unrealized position per security; realized gains and tax character; cash and margin
balances per account; account names; and login credentials. Compromise is not recoverable by
rotation — you can rotate a key, not a trade history. Once the app is hosted, the operator becomes
part of the threat model whether or not that is comfortable to say out loud.

### 11.2 Three tiers, and what each actually stops

| Adversary | T0: plaintext (today) | T1: server-held keys | T2: session-held keys **(recommended)** | T3: end-to-end encrypted |
|---|:--:|:--:|:--:|:--:|
| Someone steals a backup or disk snapshot | ❌ | ✅ | ✅ | ✅ |
| Someone dumps the database (SQL injection, stolen DB creds, cloud console) | ❌ | ✅ | ✅ | ✅ |
| The hosting provider reads the volume | ❌ | ✅ | ✅ | ✅ |
| The operator runs `SELECT * FROM transactions` | ❌ | ❌ | ✅ | ✅ |
| A subpoena served on stored data returns readable holdings | ❌ | ❌ | ✅ | ✅ |
| The operator modifies the running server to capture keys as users log in | ❌ | ❌ | ❌ | ✅ |

- **T1 — envelope encryption with server-held keys.** Per-user data key (DEK), wrapped by a master
  key in a KMS or env var. The app decrypts on every request. Stops offline theft; does **not** stop
  anyone with server access, because the server can decrypt at will. This is what most products
  mean by "encrypted at rest" — worth having, insufficient for the stated goal.

- **T2 — per-user DEK wrapped by a password-derived key (recommended).** At registration, generate
  a random DEK. Derive a key-encryption key (KEK) from the user's password with Argon2id, wrap the
  DEK with it, store only the wrapped blob. At login, the password unwraps the DEK, which is held
  **in the session only** — memory, or a short-lived encrypted session token — and never written to
  disk. Sensitive columns are encrypted with the DEK.
  At rest, the database holds only ciphertext for those columns, and the server has no way to
  decrypt them for a user who is not currently logged in. `SELECT *` returns ciphertext.

- **T3 — end-to-end.** The browser holds the key and does the encrypting; the server stores opaque
  blobs and performs no computation on portfolio data. This is the only tier that stops a *malicious*
  operator, because it never gives the server plaintext at all — but it means moving the entire
  gains/lots pipeline into the browser (WASM SQLite or equivalent) and reduces the server to a sync
  store. It also breaks server-side background jobs and complicates the AI chat.

**Recommendation: build T2.** It delivers the property the user asked for in every practical sense —
the operator cannot read stored data, backups, or dumps — and it does so without turning the server
into a dumb blob store. Then be precise in the product copy: *"we cannot read your data at rest;
a malicious operator who modifies the server could capture keys of users who log in afterwards"* is
honest. *"Zero-knowledge"* would not be, and claiming it while running T2 is worse than claiming
nothing.

### 11.3 What to encrypt — and what deliberately not to

Encrypting every column would break the app: the pipeline needs to sort by date, filter by ticker,
and aggregate by account. The split follows what is actually sensitive.

| Encrypt (per-user DEK) | Leave plaintext | Why |
|---|---|---|
| `quantity`, `price`, `costPerShare`, `totalCost`, `amount` | `date`, `action`, `assetType`, `source`, flag columns | The pipeline sorts and branches on these; none of them reveals position size or wealth. |
| `averageCostPerShare`, `marketValue`, `cash_balance`, `buying_power_json` | `currentPrice`, `previousClose`, `prevClose` | **Quotes are public market data.** Encrypting them buys nothing and blocks background refresh. |
| `brokerage_accounts.name`, SnapTrade user secret | `brokerage`, `account_id` (an internal integer) | Account nicknames are identifying; a brokerage name is low-signal. |
| — | `ticker`, `option_symbol` | Deliberate trade-off; see below. |

**The ticker decision is the one real trade-off.** Leaving `ticker` in plaintext means the operator
learns *which securities* a user holds, but not how much, at what cost, or what it is worth.
Encrypting it means every lookup becomes a full-table decrypt-and-scan, the price-refresh job can
no longer determine which symbols to quote without a live session, and the split/analyst logic
loses its join key. **Recommendation: leave `ticker` plaintext in V2, and say so plainly in the
privacy note.** Revisit only if the threat model changes — an operator who knows the symbol set but
no quantities cannot value the portfolio.

### 11.4 Key lifecycle

```
register  →  DEK = random(32)
             KEK = Argon2id(password, salt)
             store: wrapped_dek = AEAD_encrypt(KEK, DEK), salt, params
             also:  recovery_wrapped_dek = AEAD_encrypt(recovery_key, DEK)
                    ↑ recovery key shown ONCE, never stored server-side

login     →  KEK = Argon2id(password, stored salt)
             DEK = AEAD_decrypt(KEK, wrapped_dek)     — fails ⇒ wrong password
             DEK held in session memory only

password  →  unwrap with old KEK, re-wrap with new KEK.
change       The DEK never changes, so no data is re-encrypted.

password  →  the DEK is unrecoverable from the password alone.
forgotten    Recovery key unwraps it. Without the recovery key the data is
             mathematically gone — this is the cost of T2 and must be stated
             at signup, not discovered at reset time.
```

Two hard consequences to design around, not around which to hand-wave:

1. **Password reset cannot recover data.** A one-time recovery key, shown at registration and
   confirmed by the user, is mandatory — not optional polish. An account-recovery flow that
   silently resets to an empty portfolio is a data-loss bug.
2. **Background jobs cannot touch encrypted data for a logged-out user.** This is why §11.3 keeps
   quotes plaintext: the nightly/interval price refresh only needs `(user_id, ticker)` and writes
   public prices, so it runs fine without any DEK. Anything that needs cost basis — recomputing
   gains, rebuilding holdings — is a **login-time or request-time** operation, not a cron job.
   Design the job schedule around that constraint from the start.

### 11.5 The rest of the hosting hardening

| Item | Requirement |
|---|---|
| TLS | Mandatory. Terminate at a reverse proxy with an automatically renewed certificate; HSTS on. Plaintext credentials over the internet is not a trade-off, it is a defect. |
| Secrets | Out of `.env` and into the platform's secret store. `JWT_SECRET` pinned and rotated deliberately; the random fallback logs a loud warning. |
| Sessions | Short-lived access token + refresh token; server-side revocation list so logout and compromise are actionable. Move the token out of `localStorage` into an `HttpOnly`, `Secure`, `SameSite=Strict` cookie — with encryption keys in play, an XSS that reads a token is now an XSS that reads a portfolio. |
| Registration | Reopened but gated — invite code or admin approval. An open signup on a personal server is an open invitation. |
| Rate limits | Per-IP and per-account on `/auth/login` and `/auth/register`; per-user on `/brokerage/sync`, `/prices/refresh`, `/analyst/batch`, and chat (§12), all of which cost money or third-party quota. |
| Logging | The per-transaction `print` calls become `logger.debug`. Nothing containing a quantity or an amount is logged at INFO in production. |
| Backups | Encrypted (`age`/`gpg`) before leaving the host, with the existing integrity check retained. Restore-tested — an untested backup is a hypothesis. |
| Dependencies | Vendor Tailwind and the `importmap` modules into local npm dependencies. On a hosted app, three third parties on every page load is an unnecessary supply-chain and privacy surface. |
| Isolation | One database role for the app with no DDL rights; migrations run as a separate role. |

## 12. V2 AI chat — portfolio performance review

### 12.1 What it does

A conversational panel (replacing the current `AIInsights` placeholder) that answers questions
about the user's own portfolio: concentration and diversification, realized vs unrealized
performance, long-term vs short-term gain mix, wash-sale exposure, and options positioning. It is
analysis over data the app already computes — not advice, not order entry, and not a market-data
oracle.

### 12.2 Architecture — one call, no agent

```
Browser  ──POST /api/v1/chat──►  FastAPI
                                   │ 1. resolve user scope (+ DEK from session)
                                   │ 2. build a portfolio digest from the user's
                                   │    holdings / lots / realized gains
                                   │ 3. scale every value to a percentage (§12.3)
                                   │ 4. single Messages API call, digest in the
                                   │    system prompt, cached (§12.4)
                                   ▼
                             Claude (Anthropic API) — server-side only, never the browser
                                   │
                                   ▼
                        response ──► frontend re-expands percentages to dollars locally
```

The whole portfolio fits comfortably in context, so **no agent, no tool-use loop, no RAG.** A
single request/response is the entire design. Transactions are excluded from the digest initially
(holdings, open lots, and realized gains carry the analysis; the full ledger roughly triples the
token count for marginal gain).

Chat is **ephemeral** — React state only, no `chat_messages` table. If conversation memory is added
later, memory rows must store **ratios only, enforced at write time**: a memory row is replayed
into every future request, so a dollar figure there is far worse than one in a single message.

### 12.3 Privacy: percentage-scaled digest

The digest sends **relative** values only — position weights and percentage returns, e.g.
`TICK 23.2% of portfolio, +91.0% unrealized, long-term` — never absolute dollars. The frontend
re-expands to currency locally when rendering. Anthropic can attribute API requests to the billing
account, but the request content never reveals net worth.

**Residual leak: the user's own typed messages.** The digest is scaled; free text is not. A user
who types a dollar figure sends a dollar figure. Mitigation is a visible note under the input plus
a client-side currency-pattern warning before send. **Do not silently rewrite the user's words** —
a privacy feature that edits what someone said without telling them is a worse bug than the leak.

Zero-data-retention is not available on self-serve accounts; do not plan around it.

### 12.4 Model, cost, and controls

| Decision | Value |
|---|---|
| Model | `claude-sonnet-5` — the recorded choice for this feature; strong enough for portfolio analysis at Sonnet pricing. `claude-opus-5` is the upgrade path if answer quality falls short. |
| Pricing | Sonnet 5: **$3 / $15** per million tokens in/out (introductory $2 / $10 through 2026-08-31). Opus 5: $5 / $25. |
| Context | 1M tokens — the digest is a rounding error against the window; size it for cost, not for fit. |
| Auth | `ANTHROPIC_API_KEY` server-side, from the platform secret store. **Never** the browser — an API key in a bundle is a public API key. A Claude.ai subscription does not cover API usage; this needs a Console account with credits. |
| Prompt caching | The digest sits in the system prompt and is stable across a conversation → mark it with `cache_control` so follow-up turns read the cached prefix at ~0.1× instead of re-paying for it. Put the stable digest first and the varying question last, or the cache never hits. Verify with `usage.cache_read_input_tokens`; if it is zero across turns, something volatile (a timestamp, an unsorted dict) is sitting in the prefix. |
| Streaming | Stream the response — a multi-second wait with no output reads as a hang. |
| Per-user cost cap | **Mandatory before hosting.** All users' chat usage bills to the operator's key. A monthly token or message budget per user, enforced server-side, with a clear message when it is reached. |
| Rate limit | Per-user requests/minute, independent of the budget, so one user cannot starve the others. |

Order-of-magnitude: at roughly 150 messages/month against a ~20k-token digest, the uncached cost
lands in the low single-digit dollars per user per month; prompt caching pulls the repeat-turn
portion down substantially. Measure with `count_tokens` against the real digest rather than
trusting an estimate — the digest size scales with position and lot count.

### 12.5 How encryption changes the chat

Under T2 (§11.2), the digest can only be built while the user's DEK is in session — i.e. inside a
request from a logged-in user. That is exactly when chat happens, so there is no conflict, but it
does rule out two things: pre-computing digests on a schedule, and any "email me a weekly portfolio
summary" feature that runs while the user is logged out. If a scheduled summary is ever wanted, it
needs its own design (a user-authorized, separately-wrapped digest key), not a workaround.

**Local models were considered and rejected** for the current hardware: an 8GB machine cannot hold
a 7B model plus a 20k-token KV cache alongside the dev servers, and a holdings-only digest that
would fit loses lot-level analysis. Worth revisiting on a 16GB+ host.

## 13. V2 sequencing

Order is not arbitrary — each phase makes the next one safe.

| Phase | Work | Gate before proceeding |
|---|---|---|
| **0. Repo hygiene** | Purge portfolio data from `context.md` and `config/tickers.yml`; ship `.example` templates; rewrite history if the repo has ever left the machine. | Fast, and independent of everything else. Do it first. |
| **1. Multi-tenancy** | `user_id` everywhere; scoped query layer; per-user loaders; per-user SnapTrade credentials; cross-tenant leak test in CI. | The leak test passes, and a second seeded user sees zero rows of the first. |
| **2. Encryption (T2)** | DEK/KEK lifecycle, recovery key, encrypted columns, session key handling, encrypted backups. | A database dump shows ciphertext for every sensitive column; restore-from-backup verified. |
| **3. Hosting** | Postgres + Alembic; TLS; secret store; cookie sessions with revocation; rate limits; gated registration; advisory locks replacing the in-process lock; vendored frontend deps. | A pen-test pass of the auth surface; the doubled-holdings bug provably unreachable with >1 worker. |
| **4. AI chat** | `/chat` endpoint, digest builder, percentage scaling, prompt caching, streaming UI, per-user budget and rate limit. | Budget enforcement demonstrated, and a digest inspected by hand to confirm no absolute currency values leave the host. |

Phases 1 and 2 can overlap; **3 cannot start before both are done**, and 4 should not ship before 3
(an unmetered chat endpoint on a hosted app is a billing incident waiting to happen).

## 14. Known issues and dead code (V1)

- **`GET /api/v1/analyst/cached` is shadowed.** `/analyst/{ticker}` is registered before
  `/analyst/cached` in `analyst.py`, and FastAPI matches in registration order — so the request
  resolves to `get_analyst_data(ticker="cached")` and performs a live yfinance lookup for the
  literal symbol `cached`. The response is a single object rather than the cached list; the
  frontend's `.length > 0` check is falsy on it, so sectors silently disappear from the first paint
  until the background `POST /analyst/batch` returns. Fix: move the `/analyst/cached` declaration
  above `/analyst/{ticker}`.
- **Plaid is dead code.** `createPlaidLinkToken`, `exchangePlaidToken`, and `syncPlaidTransactions`
  call `/api/v1/plaid/*` endpoints that no router provides; `react-plaid-link` and the `PLAID_*`
  env vars are unused. SnapTrade replaced it.
- **`AIInsights` renders a placeholder** — `getPortfolioInsights()` returns a fixed string. This is
  the component V2's chat replaces.
- **`archive/ai_import.py`** initializes `vertexai` at import but is never registered.
- **Two database files exist.** `./db/wealthcompass.db` is live; a zero-byte `./wealthcompass.db`
  at the repo root is a legacy artifact and can be deleted.
- **Startup migrations grow without bound.** ~100 lines of guarded `ALTER TABLE` run on every boot.
  Working and idempotent, but this is what Alembic replaces in Phase 3.
- **Test coverage is thin.** `backend/tests/` holds two modules. The gain/wash-sale/split logic —
  where a bug is a wrong tax number — is untested, and it is also the code multi-tenancy is about
  to touch. Tests here are a prerequisite for Phase 1, not a follow-up.

## 15. Operations (V1)

```bash
./server.sh start          # launches backend + frontend in new Terminal windows (macOS)
./server.sh kill           # frees ports 8000 and 5173

cd backend && python -m pytest tests/

./scripts/backup_db.sh                                   # → ~/Backups/WealthCompass
WC_BACKUP_DIR=/Volumes/Backup/WealthCompass ./scripts/backup_db.sh   # off-machine copy
```

Backend `http://localhost:8000` · Frontend `http://localhost:5173` · the Vite dev server proxies
`/api/v1/*` to the backend, which is why no CORS configuration is needed.

## 16. Open decisions

These change the V2 design and are the user's call, not the implementer's:

1. **Encryption tier** — T2 (recommended: operator cannot read stored data) or T3 (operator cannot
   read data at all, at the cost of moving the pipeline into the browser)?
2. **Ticker plaintext** — accept that the operator learns the symbol set but not the amounts
   (recommended), or encrypt tickers and give up background price refresh?
3. **Who pays for chat** — operator's API key with per-user budgets (simpler, has a cost ceiling
   problem), or each user supplies their own key (no billing risk, worse onboarding)?
4. **Recovery-key UX** — mandatory download at signup, or an explicit "I accept that a forgotten
   password destroys my data" checkbox? There is no third option under T2.
5. **Registration gate** — invite codes, admin approval, or allowlisted email domains?
