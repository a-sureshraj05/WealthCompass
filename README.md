# WealthCompass: AI-Powered Portfolio Consolidator

WealthCompass is a web application designed to consolidate and analyze personal stock and ETF holdings. It uses AI to parse brokerage statements and provide a unified view of your portfolio.

## Technology Stack

*   **Backend:** Python with [FastAPI](https://fastapi.tiangolo.com/)
*   **Frontend:** TypeScript with [React](https://reactjs.org/) (built with [Vite](https://vitejs.dev/))
*   **AI:** Google Cloud [Vertex AI](https://cloud.google.com/vertex-ai) (Gemini models)
*   **Database:** [SQLAlchemy](https://www.sqlalchemy.org/) ORM (SQLite for local development)

## Folder Structure

The project is organized into two main parts:

```
/
├── backend/         # Contains the Python FastAPI server
│   ├── app/
│   │   ├── api/     # API endpoint definitions (AI, transactions)
│   │   ├── db/      # SQLAlchemy database schema and SQLite file (wealthcompass.db)
│   │   └── main.py  # Main FastAPI application
│   └── requirements.txt
├── frontend/        # Contains the React user interface
│   ├── src/         # Main React source code
│   ├── components/  # React components
│   └── services/    # Frontend API services
└── server.sh        # Script to manage development servers
```

## Setup and Installation

Follow these steps to get the application running locally.

### 1. Prerequisites

*   Python 3.9+
*   Node.js 18+
*   `gcloud` CLI

### 3. Backend Setup

```bash
# Install Python dependencies
pip install -r backend/requirements.txt
# Ensure uvicorn is installed for running the server
pip install "uvicorn[standard]"
```

### 6. Google Cloud Authentication

The backend authenticates with Google Cloud using Application Default Credentials (ADC). Run this command once in your terminal and follow the login instructions:

```bash
gcloud auth application-default login
```

**Important:** Ensure the following APIs are enabled for your Google Cloud project:
*   **Vertex AI API**
*   **Cloud Resource Manager API**

## Running the Application

A convenient script, `server.sh`, manages the development environment.

*   **To Start the Servers:**
    This command kills any old processes, closes all `Terminal.app` windows, and starts the backend and frontend in new, clean windows.
    The backend will run on `http://0.0.0.0:8000` (accessible via `http://localhost:8000`).
    The frontend will run on `http://localhost:5173`.

    ```bash
    ./server.sh start
    ```

*   **To Stop the Servers:**
    This command terminates the server processes and closes their associated `Terminal.app` windows.

    ```bash
    ./server.sh kill
    ```

Once started:
*   The backend will be running at `http://localhost:8000`.
*   The frontend will be running at `http://localhost:5173`.