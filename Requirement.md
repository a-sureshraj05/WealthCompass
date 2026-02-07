# WealthCompass Requirement Document

## 1. Project Overview

WealthCompass is a web application designed for consolidating and viewing stock information. It features a backend (likely Python FastAPI) and a frontend (likely TypeScript/React). The primary goal is to process brokerage statements to extract and display stock holdings and transactions.

## 2. Backend Architecture

The backend is built with FastAPI and is responsible for:
*   Providing API endpoints for data management.
*   Parsing brokerage statements.
*   Interacting with a database to store holdings and transactions.

### 2.1 API Endpoints

The main entry point is `backend/app/main.py`, which sets up the FastAPI application and includes routers for different functionalities.

Key API functionalities include:
*   **Transactions:** Handled by `backend/app/api/transactions.py`.
*   **Manual Parsing:** Handled by `backend/app/api/manual.py`, allowing for manual processing of brokerage statements.

### 2.2 Data Parsing

Two primary methods for parsing brokerage statements are identified:

#### 2.2.1 Manual CSV Parser (Active)
*   Implemented in `backend/app/api/manual_parser.py`.
*   Parses CSV brokerage statements based on predefined configurations.
*   Configurations for different brokerage firms (including CSV column mapping and data transformation rules) are defined in `backend/app/core/brokerage_configs.py`.
*   The `parse_statement_manual_endpoint` in `backend/app/api/manual.py` handles requests for manual parsing, calls the parser, and saves data to the database.

#### 2.2.2 AI-Powered Parser (Under Development/Experimental)
*   Implemented in `backend/app/api/ai.py`.
*   Utilizes Google's Vertex AI for experimental, AI-powered statement parsing functionality.
*   This feature is not yet fully integrated, but functions like `parse_statement` and `parse_portfolio_func` are present.

### 2.3 Database Schema

The database schema is defined using SQLAlchemy in `backend/app/db/schema.py`. Key tables include:
*   `Holding`: Stores information about stock holdings.
*   `Transaction`: Stores information about stock transactions.

## 3. Frontend (Partial Analysis)

Based on the file structure, the frontend appears to be a standard web application built with:
*   **Framework:** React (TypeScript)
*   **Build Tool:** Vite
*   **Package Management:** npm/yarn (indicated by `package.json`, `package-lock.json`)

Key frontend components identified:
*   `App.tsx`, `index.tsx`, `main.tsx`: Core application entry points and routing.
*   `components/`: Contains various UI components such as `AIInsights.tsx`, `Dashboard.tsx`, `HoldingsTable.tsx`, `ImportPanel.tsx`, `Navbar.tsx`, `PortfolioVisuals.tsx`, `Sidebar.tsx`, `SummaryCards.tsx`.
*   `services/geminiService.ts`: Suggests interaction with Gemini-related services.

## 4. Development Tools/Conventions

*   **Version Control:** Git (indicated by `.git/` directory).
*   **Environment Variables:** The presence of environment variable loading (`.gemini` directory) suggests usage for configuration.
*   **AI Studio Integration:** The `.gemini` directory and the mention of "google ai studio some base code" indicate that Google AI Studio was likely used for generating some initial code or for integrating AI functionalities.

## 5. Future Considerations

*   Full integration and testing of the AI-powered parsing capabilities.
*   Expansion of brokerage configurations for the manual parser.
*   Detailed documentation of frontend components and data flow.
*   Refinement of error handling and user feedback mechanisms.
