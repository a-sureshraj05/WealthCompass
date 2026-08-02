#!/bin/bash
#
# Nightly backup of the WealthCompass SQLite database.
#
# Uses sqlite3's online .backup rather than cp: it takes a consistent snapshot
# while the app holds the database open, and picks up any un-checkpointed WAL
# content. A plain cp of a live SQLite file can capture a torn page.
#
# Every backup is integrity-checked before it is kept, so a corrupt source
# can't quietly overwrite good history with bad.
#
# Destination defaults to ~/Backups/WealthCompass. Point WC_BACKUP_DIR at an
# external drive or a synced folder to get the copy off this machine:
#
#   WC_BACKUP_DIR=/Volumes/Backup/WealthCompass ./scripts/backup_db.sh
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${WC_DB_PATH:-$REPO_DIR/db/wealthcompass.db}"
DEST_DIR="${WC_BACKUP_DIR:-$HOME/Backups/WealthCompass}"
KEEP="${WC_BACKUP_KEEP:-30}"     # how many backups to retain
LOG="$DEST_DIR/backup.log"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG" >&2; }

mkdir -p "$DEST_DIR"

if [[ ! -f "$SRC" ]]; then
  log "FAIL: source database not found at $SRC"
  exit 1
fi

STAMP="$(date '+%Y%m%d-%H%M%S')"
TMP="$DEST_DIR/.wealthcompass-$STAMP.db"
OUT="$DEST_DIR/wealthcompass-$STAMP.db.gz"

# Remove the partial file if we die partway through.
trap 'rm -f "$TMP"' EXIT

sqlite3 "$SRC" ".backup '$TMP'"

# A backup that doesn't open cleanly is worse than no backup — it looks like
# protection you don't have. Verify before keeping it.
INTEGRITY="$(sqlite3 "$TMP" 'PRAGMA integrity_check;' 2>&1 | head -1)"
if [[ "$INTEGRITY" != "ok" ]]; then
  log "FAIL: integrity check on snapshot returned '$INTEGRITY' — discarding"
  exit 1
fi

# Sanity-check that the tables that matter actually have rows, so an empty or
# reset database doesn't silently become the newest "good" backup.
COUNTS="$(sqlite3 "$TMP" "select (select count(*) from transactions), (select count(*) from unrealized_gains), (select count(*) from lot_assignments);")"
TXNS="${COUNTS%%|*}"
if [[ "$TXNS" -eq 0 ]]; then
  log "FAIL: snapshot contains 0 transactions — discarding (source may have been reset)"
  exit 1
fi

gzip -c "$TMP" > "$OUT"
rm -f "$TMP"
trap - EXIT

SIZE="$(du -h "$OUT" | cut -f1)"
log "OK: $OUT ($SIZE) — transactions/unrealized/lot_assignments = $COUNTS"

# Retention: keep the newest $KEEP, delete the rest.
# Written for bash 3.2, which is what macOS ships — no mapfile/readarray.
PRUNED=0
while IFS= read -r f; do
  [[ -n "$f" ]] || continue
  rm -f "$f"
  PRUNED=$((PRUNED + 1))
done < <(ls -1t "$DEST_DIR"/wealthcompass-*.db.gz 2>/dev/null | tail -n "+$((KEEP + 1))")
if [[ "$PRUNED" -gt 0 ]]; then
  log "pruned $PRUNED backup(s) older than the newest $KEEP"
fi
