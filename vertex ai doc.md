# WealthCompass Vertex AI Integration Documentation

This document outlines the architecture, setup, and operational procedures for the WealthCompass application, with a focus on its integration with Google's Vertex AI.

## 1. Project Overview

WealthCompass is a web application designed to consolidate and analyze personal stock and ETF holdings. It uses AI to parse brokerage statements and provide insights into the user's portfolio.

## 2. Architecture

The application follows a modern client-server architecture:

*   **Frontend:** A React application built with Vite. It provides the user interface for uploading statements and viewing portfolio data.
*   **Backend:** A Python backend built with the FastAPI framework. It serves as a secure intermediary between the frontend and the Vertex AI API.

### AI Integration Flow

To ensure security and proper credential management, the application does not call Google Cloud services directly from the browser. Instead:

1.  The **React frontend** sends the text content of a user's brokerage statement to our own FastAPI backend.
2.  The **FastAPI backend** securely calls the Vertex AI API, using proper Google Cloud authentication (Application Default Credentials), to parse the text.
3.  The backend receives the structured data (a list of holdings) from Vertex AI and sends it back to the frontend for display.

## 3. Project Setup and Configuration

### Backend Setup (`/backend`)

*   **Dependencies:** All required Python packages are listed in `backend/requirements.txt`. Key libraries include `fastapi`, `uvicorn`, and `google-cloud-aiplatform`.
*   **Environment Variables:** The backend requires a central `.env` file located at `/.gemini/.env` in the project root. This file must contain:
    ```
    GOOGLE_GENAI_USE_VERTEXAI=true
    GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
    GOOGLE_CLOUD_LOCATION="us-central1"
    GEMINI_MODEL="gemini-2.5-flash"
    ```
*   **Authentication:** The application uses **Application Default Credentials (ADC)** to authenticate with Google Cloud. This must be configured in your local environment by running the following command once:
    ```bash
    gcloud auth application-default login
    ```

### Frontend Setup (`/frontend`)

*   **Dependencies:** All required Node.js packages are listed in `frontend/package.json`.
*   **API Proxy:** To allow the frontend (running on port `5173`) to communicate with the backend (on port `8000`), the `frontend/vite.config.js` file is configured to proxy all requests starting with `/api` to the backend.

## 4. Running the Application

A single script, `server.sh`, is provided to manage the development servers.

*   **To Start Servers:** Kills any running processes and starts the backend and frontend in new, separate terminal windows.
    ```bash
    ./server.sh start
    ```
*   **To Stop Servers:** Finds and kills any running server processes.
    ```bash
    ./server.sh kill
    ```

## 5. Google Cloud Project Troubleshooting

For the Vertex AI integration to work, the following must be configured in your Google Cloud project:

1.  **Billing Enabled:** Your project must be linked to an active billing account.
2.  **Vertex AI API Enabled:** The "Vertex AI API" must be enabled. [Direct Link](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com?project=wealthcompass-486007)
3.  **Cloud Resource Manager API Enabled:** The "Cloud Resource Manager API" must also be enabled, as it is a dependency for the Vertex AI SDK. [Direct Link](https://console.developers.google.com/apis/api/cloudresourcemanager.googleapis.com/overview?project=wealthcompass-486007)
