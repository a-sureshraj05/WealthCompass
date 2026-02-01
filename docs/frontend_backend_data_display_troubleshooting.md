# Frontend-Backend Data Display Troubleshooting

This document summarizes the common pitfalls and resolutions encountered when setting up the WealthCompass frontend to fetch and display data from the backend.

## Problem: "No holdings found. Import your data to get started." (Initial Load) and `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**Description:**
The frontend displayed a "No holdings found" message on initial load, and the browser console showed `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON` when attempting to fetch data from `/holdings`. This occurred despite the backend API (`/holdings`) returning valid JSON data when directly accessed via `curl`. After importing data via CSV, the holdings would sometimes appear, but not on fresh page loads.

**Root Causes:**

1.  **Vite Proxy Configuration (Primary Issue):**
    *   The Vite development server was not correctly configured to proxy API requests from the frontend to the backend.
    *   Initially, there was no `proxy` configuration in `frontend/vite.config.ts`. This caused `fetch("/holdings")` requests (and any other API calls) to be handled by the Vite dev server itself, which, not recognizing them as static assets, served the `index.html` file. The frontend then tried to parse this HTML as JSON, leading to the `SyntaxError`.
    *   Subsequent attempts to configure the proxy (e.g., generic `/` proxy, or specific `/api` and `/holdings` rules) were initially met with continued `SyntaxError`s or `404 Not Found` errors from the backend.

2.  **Backend Server Startup Inconsistencies:**
    *   The `server.sh` script, used for starting the backend, was using `python3 -m uvicorn backend.app.main:app --reload`.
    *   The `--reload` flag, while useful, can sometimes interfere with consistent port binding.
    *   Crucially, the script was *not* explicitly specifying `--host 0.0.0.0 --port 8000` for the backend. This meant Uvicorn might have been binding to a different IP address (e.g., `127.0.0.1`) or a random port, preventing the frontend's proxy (configured for `http://localhost:8000`) from successfully connecting. This led to `404 Not Found` errors when the proxy finally *was* working.

3.  **FastAPI Router Prefix Mismatch:**
    *   Once the proxy was correctly forwarding requests, the backend FastAPI application was still returning `404 Not Found` because the frontend was sending requests to `/api/v1/holdings` (due to frontend service changes), but the FastAPI router was only configured for `/holdings` (at the root).

4.  **Frontend Data Rendering Errors (`HoldingsTable` Component Crash):**
    *   After the proxy and backend routing issues were resolved, the `HoldingsTable` component was crashing. This was due to numerical operations (e.g., `toFixed(2)`, division) being performed on potentially `undefined` or `null` values (`h.avgPrice`, `h.currentPrice`) which are derived from `costPerShare` (which itself could be zero).

**Resolution:**

1.  **Configured Vite Proxy (`frontend/vite.config.ts`):**
    *   A specific proxy rule was added for `/api/v1` with a `rewrite` function to strip the prefix before forwarding to the backend. This ensures that `http://localhost:5173/api/v1/holdings` is correctly proxied and rewritten to `http://localhost:8000/holdings`.
    *   ```typescript
        // frontend/vite.config.ts
        export default defineConfig(...) {
          server: {
            proxy: {
              '/api/v1': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
                rewrite: (path) => path.replace(/^\/api\/v1/, ''),
              },
            },
          },
          // ...
        }
        ```

2.  **Updated Frontend Service Calls (`frontend/services/geminiService.ts`):**
    *   All API fetch calls were updated to include the `/api/v1` prefix (e.g., `fetch("/api/v1/holdings")`).
    *   ```typescript
        // frontend/services/geminiService.ts
        export const fetchHoldings = async (): Promise<StockHolding[]> => {
          const response = await fetch("/api/v1/holdings");
          // ...
        };
        ```

3.  **Corrected Backend Server Startup (`server.sh`):**
    *   The `server.sh` script was modified to explicitly specify `--host 0.0.0.0 --port 8000` for the Uvicorn command and remove the `--reload` flag, ensuring the backend consistently listens on the expected address.
    *   ```bash
        # server.sh
        # ...
        osascript -e "tell application \"Terminal\" to do script \"cd ${CWD} && echo '--- Starting Backend ---' && python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &\""
        # ...
        ```

4.  **FastAPI Router Prefixing (`backend/app/main.py`):**
    *   The `transactions.router` and `manual.router` were included with `prefix="/api/v1"` in `backend/app/main.py` to match the incoming requests after the Vite proxy rewrite.
    *   ```python
        # backend/app/main.py
        app.include_router(transactions.router, prefix="/api/v1")
        app.include_router(manual.router, prefix="/api/v1")
        ```

5.  **Robust Frontend Rendering (`frontend/components/HoldingsTable.tsx`):**
    *   All numerical operations (`toFixed`, arithmetic calculations) on potentially `undefined` or `null` values (`avgPrice`, `currentPrice`) were safeguarded using the nullish coalescing operator (`?? 0`) and pre-calculated variables to prevent runtime crashes (e.g., division by zero).
    *   ```typescript
        // frontend/components/HoldingsTable.tsx
        // ...
        const avgPrice = h.avgPrice ?? 0;
        const currentPrice = h.currentPrice ?? 0;
        const gainLoss = currentPrice - avgPrice;
        const gainLossPercentage = avgPrice === 0 ? 0 : (gainLoss / avgPrice) * 100;
        // ... use avgPrice, currentPrice, gainLoss, gainLossPercentage
        ```

## What to Make Sure Of Going Forward:

*   **Consistent API Paths:** Always ensure that the API paths used in your frontend `fetch` calls exactly match the paths expected by your backend, taking into account any proxy rewrites or router prefixes.
*   **Vite Proxy Verification:** If encountering `SyntaxError` (HTML response) on API calls, it's almost always a proxy configuration issue. Use `console.log` within the `rewrite` function of `vite.config.ts` (and inspect the terminal where Vite is running) to verify the path being forwarded.
*   **Backend Port and Host:** Always explicitly specify `--host 0.0.0.0 --port <PORT_NUMBER>` when starting development servers, especially when working with proxies, to avoid binding issues.
*   **Robust Frontend Data Handling:** When receiving data from an API, always anticipate `undefined` or `null` values for properties, especially when performing mathematical operations or formatting. Use nullish coalescing (`??`), optional chaining (`?.`), or conditional rendering to prevent runtime errors.
*   **Full Console Output:** When debugging, providing the *entire* console output (both browser and server terminal) is crucial, as errors can cascade or provide context that isolated messages miss.
