# User Behavior: Data Upload Flow

This document outlines the step-by-step process of how data uploaded by a user flows through the WealthCompass application, from the frontend interaction to its persistence in the database.

## Uploading Data

1.  **User Action:**
    *   The user interacts with the "Import Data" section in the frontend (rendered by `frontend/components/ImportPanel.tsx`).
    *   They either select a file (CSV/text) via the file input or paste text content into the textarea.
    *   They choose a `Brokerage` name.
    *   They click either "Select File" (triggering `handleFileUpload`) or "Parse with Gemini AI" (triggering `handleManualImport`).

2.  **Frontend Processing (`frontend/components/ImportPanel.tsx`):**
    *   The chosen file's content (or pasted text) is extracted.
    *   The `parseStatement` function from `../services/apiService.ts` is called with the extracted text and the selected brokerage name.

3.  **Frontend Service Layer (`frontend/services/apiService.ts`):**
    *   The `parseStatement` function constructs an HTTP `POST` request.
    *   This request is sent to the backend endpoint `/api/v1/manual/parse-statement`.
    *   The request body contains the `text` content of the statement and the `brokerageName`.

4.  **Backend API Endpoint (`backend/app/api/manual.py`):**
    *   The `/api/v1/manual/parse-statement` endpoint (handled by `parse_statement_manual_endpoint` in `backend/app/api/manual.py`) receives the `POST` request.
    *   It first uses `db.query(DBTransaction).filter(DBTransaction.brokerage == request.brokerageName).delete()` to remove any existing transactions for the specified brokerage, ensuring data freshness and avoiding duplicates.
    *   It then calls the `parse_statement_manually` function from `backend/app/api/manual_parser.py`, passing the statement text and brokerage name for parsing.

5.  **Backend Parsing Logic (`backend/app/api/manual_parser.py`):**
    *   The `parse_statement_manually` function processes the raw text content.
    *   It uses predefined configurations specific to the `brokerage_name` (loaded from `backend/app/core/brokerage_configs.py`) to understand the CSV format, map columns, and extract relevant data points (e.g., ticker, quantity, cost). The output is structured to fit the `Transaction` schema.
    *   It returns a list of dictionaries, each representing a parsed transaction, conforming to the expected `Transaction` schema.

6.  **Backend Data Persistence (`backend/app/api/manual.py`):**
    *   Back in `parse_statement_manual_endpoint`, the list of parsed transactions is iterated through.
    *   For each parsed transaction, a new `DBTransaction` object (an instance of the SQLAlchemy model defined in `backend/app/db/schema.py`) is created.
    *   These `DBTransaction` objects are added to the SQLAlchemy session (`db.add(db_transaction)`).
    *   Finally, `db.commit()` is called, which permanently saves these new records into the `transactions` table in the `db/wealthcompass.db` SQLite database.

7.  **Backend Response & Frontend Update:**
    *   The backend returns a success response, including the newly added transactions, to the frontend.
    *   The frontend's `ImportPanel.tsx` receives this response.
    *   The `onAddHoldings` callback (passed from `App.tsx`) is invoked with the extracted transactions (now treated as holdings for display purposes), updating the application's state.
    *   A success prompt is displayed to the user via the `showSuccessPrompt` state in `ImportPanel.tsx`.
