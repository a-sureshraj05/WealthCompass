#!/bin/bash

# --- Configuration ---
BACKEND_PORT=8000
UVICORN_CMD="python3 -m uvicorn backend.app.main:app --reload"
BROKERAGE_NAME="Robinhood"

# --- Functions ---
start_backend() {
    echo "Starting backend server..."
    # Start uvicorn in the background and capture its PID
    $UVICORN_CMD &> /tmp/uvicorn_output.log &
    UV_PID=$!
    echo "Backend started with PID: $UV_PID"
    echo "Waiting for server to start (5 seconds)..."
    sleep 5 # Give the server a moment to fully start
    echo "Server should be up."
}

kill_backend() {
    if [ -n "$UV_PID" ]; then
        echo "Stopping backend server (PID: $UV_PID)..."
        kill -9 $UV_PID 2>/dev/null
        wait $UV_PID 2>/dev/null # Wait for process to terminate
        echo "Backend stopped."
    fi
}

# --- Main Logic ---

# Trap to ensure backend is killed on exit/interrupt
trap kill_backend EXIT

# Check for CSV file argument
if [ -z "$1" ]; then
    echo "Usage: $0 <path_to_csv_file>"
    exit 1
fi

CSV_FILE="$1"

if [ ! -f "$CSV_FILE" ]; then
    echo "Error: CSV file not found at '$CSV_FILE'"
    exit 1
fi

# Start backend
start_backend

# Read CSV content and send request
CSV_CONTENT=$(cat "$CSV_FILE")

echo "Sending POST request to parser..."
    RESPONSE=$(curl -s -X POST "http://localhost:$BACKEND_PORT/api/ai/parse-statement" \
         -H "Content-Type: application/json" \
         -d "{\"text\": $(echo "$CSV_CONTENT" | python3 -c 'import json, sys; print(json.dumps(sys.stdin.read()))'), \"brokerageName\": \"$BROKERAGE_NAME\"}")
echo "\n--- API Response ---"
echo "$RESPONSE"

# The trap will handle killing the backend on script exit

exit 0
