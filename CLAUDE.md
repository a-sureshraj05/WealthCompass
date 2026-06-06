# WealthCompass — Claude Code Instructions

## Project Overview
WealthCompass is a personal portfolio tracker. Backend is FastAPI + SQLite. Frontend is React + TypeScript + Vite.

## Running the App

```bash
# Start both servers (opens new Terminal windows on macOS)
./server.sh start

# Kill servers
./server.sh kill
```

- **Backend**: `http://localhost:8000` — `python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000`
- **Frontend**: `http://localhost:5173` — `cd frontend && npm run dev`
- Frontend proxies `/api/v1/*` to backend (configured in `vite.config.ts`)

## Project Structure

```
WealthCompass/
├── backend/
│   └── app/
│       ├── main.py                  # FastAPI app, router registration, startup migrations
│       ├── api/                     # Route handlers
│       │   ├── auth.py
│       │   ├── transactions.py
│       │   ├── manual_import.py
│       │   ├── snaptrade.py
│       │   ├── brokerage.py
│       │   ├── lot_assignments.py
│       │   ├── options.py
│       │   ├── splits.py
│       │   └── analyst.py
│       ├── core/
│       │   ├── process.py           # Main processing pipeline (gains + holdings recompute)
│       │   ├── statement_parser.py  # CSV → Transaction parser
│       │   ├── brokerage_configs.py # Per-brokerage CSV column mappings
│       │   ├── stock_fetcher.py     # yfinance price fetching (equities + options via OCC symbol)
│       │   ├── stock_split_utils.py # Adjust lots for stock splits
│       │   ├── stock_split_seeds.py # Seed data for known historical splits
│       │   ├── transaction_actions.py
│       │   ├── utils/
│       │   │   ├── asset_type.py
│       │   │   └── ticker.py
│       │   └── table_loader/        # Recompute derived tables from transactions
│       │       ├── realized_gain_loader.py
│       │       ├── unrealized_gain_loader.py
│       │       ├── holding_loader.py
│       │       └── ticker_reference_loader.py
│       └── db/
│           └── schema.py            # SQLAlchemy models (single source of truth)
├── frontend/
│   ├── App.tsx
│   ├── types.ts
│   ├── services/apiService.ts       # All fetch calls to backend
│   ├── components/                  # One file per view
│   ├── contexts/
│   ├── hooks/
│   └── utils/
├── db/
│   └── wealthcompass.db             # SQLite database file
└── server.sh                        # Start/kill script
```

## Architecture: Data Flow

```
CSV upload / SnapTrade sync
        │
        ▼
manual_raw_transactions / snaptrade_transactions   ← raw source tables
        │
        ▼  (process_transactions)
    transactions                                   ← normalized, unified
        │
        ├──► realized_gains
        ├──► unrealized_gains
        └──► holdings
```

`process_transactions()` in `core/process.py` is the entry point for recomputing all derived tables. It is called after any import, sync, edit, or reset.

## Database
- SQLite at `./db/wealthcompass.db` (also `./wealthcompass.db` at root — legacy)
- No migration framework — schema changes are handled via inline `ALTER TABLE` in `main.py` startup
- `Base.metadata.create_all()` runs on every startup

## Supported Brokerages (CSV import)
Configured in `core/brokerage_configs.py`:
- **Robinhood** — comma-delimited, date format `%m/%d/%Y`
- **Schwab** — comma-delimited, date format `%Y-%m-%d`

SnapTrade supports: Robinhood, Schwab, Fidelity (via API sync).

## Key Conventions
- All API routes are prefixed `/api/v1`
- Auth uses JWT Bearer tokens; all routes except `/api/v1/login` and `/api/v1/register` require auth
- `Transaction.raw_id` links a normalized transaction back to its raw source row
- `Transaction.is_backend_verified` is set only via `PATCH /transactions/{id}/verify` — never by loaders
- OCC option symbols are stored as-is (spaces stripped) on `Transaction.option_symbol` and `SnaptradeTransaction.option_symbol`
- Lot assignments (`lot_assignments` table) are explicit sell→buy lot mappings; the gain loader respects them

## Environment Variables
Backend reads from `.env` in the project root and `.gemini/.env`:
- `DATABASE_URL` — defaults to `sqlite:///./db/wealthcompass.db`
- `SNAPTRADE_CLIENT_ID`, `SNAPTRADE_CONSUMER_KEY`, `SNAPTRADE_USER_ID`, `SNAPTRADE_USER_SECRET`
- `GEMINI_API_KEY` — used by the analyst feature

## Tests
```bash
cd backend
python -m pytest tests/
```
