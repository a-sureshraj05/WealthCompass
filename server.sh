#!/bin/bash

# --- Kill Function ---
kill_servers() {
    echo "Checking for and killing existing server processes..."
    lsof -t -i:8000 | xargs kill -9 2>/dev/null
    lsof -t -i:5173 | xargs kill -9 2>/dev/null

    echo "Closing all Terminal windows..."
    # Note: osascript commands might not work in all environments or without user interaction
    # For CLI automation, consider alternatives if this causes issues.
    osascript -e 'tell application "Terminal" to close every window' &> /dev/null
    sleep 2 # Give Terminal a moment to close windows
    echo "Done."
}

# --- Start Function ---
start_servers() {
    # Get the current directory
    CWD=$(pwd)

    echo "Launching servers in new terminal windows..."

    # Start the backend in a new terminal window with explicit host/port and in background
    osascript -e "tell application \"Terminal\" to do script \"cd ${CWD} && echo '--- Starting Backend ---' && python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 &\""

    # Start the frontend in a new terminal window and in background
    osascript -e "tell application \"Terminal\" to do script \"cd ${CWD}/frontend && echo '--- Starting Frontend ---' && npm run dev &\""

    echo "The servers should now be running in new terminal windows."
}

# --- Main Logic ---
case "$1" in
    start)
        kill_servers
        start_servers
        ;;
    kill)
        kill_servers
        ;;
    *)
        echo "Usage: $0 {start|kill}"
        exit 1
        ;;
esac