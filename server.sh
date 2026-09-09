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
# $1 (optional): environment prefix applied to the backend command only.
# Used by demo mode to point the backend at a throwaway database. The frontend
# is identical either way — it only ever talks to the backend over the proxy.
start_servers() {
    CWD=$(pwd)
    BACKEND_ENV="$1"

    echo "Launching servers in new terminal windows..."

    osascript -e "tell application \"Terminal\" to do script \"cd ${CWD} && echo '--- Starting Backend ---' && ${BACKEND_ENV}python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000\""

    osascript -e "tell application \"Terminal\" to do script \"cd ${CWD}/frontend && echo '--- Starting Frontend ---' && npm run dev\""

    echo "The servers should now be running in new terminal windows."
}

# --- Demo Function ---
# Runs against db/demo.db — a throwaway database seeded with fabricated data.
# The real database is never opened: DATABASE_URL is set explicitly here, and
# nothing in demo mode falls back to the default path.
start_demo() {
    DEMO_DB="./db/demo.db"

    if [ ! -f "$DEMO_DB" ]; then
        echo "No demo database found at $DEMO_DB."
        echo "Create one with:"
        echo ""
        echo "    WC_DEMO_MODE=true DATABASE_URL=sqlite:///${DEMO_DB} \\"
        echo "        python3 -m backend.scripts.seed_demo --yes"
        echo ""
        read -r -p "Continue anyway with an empty demo database? [y/N] " reply
        case "$reply" in
            [yY]*) ;;
            *) echo "Aborted."; exit 1 ;;
        esac
    fi

    echo "--- DEMO MODE ---"
    echo "database : $DEMO_DB   (your real data is not opened)"
    echo "login    : demouser / welcome"
    echo ""

    start_servers "DATABASE_URL='sqlite:///${DEMO_DB}' WC_DEMO_MODE=true "
}

# --- Main Logic ---
case "$1" in
    start)
        kill_servers
        start_servers ""
        ;;
    demo)
        kill_servers
        start_demo
        ;;
    kill)
        kill_servers
        ;;
    *)
        echo "Usage: $0 {start|demo|kill}"
        echo ""
        echo "  start   run against the real database (db/wealthcompass.db)"
        echo "  demo    run against db/demo.db with fabricated data"
        echo "  kill    stop both servers"
        exit 1
        ;;
esac
