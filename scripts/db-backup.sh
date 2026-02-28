#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${DATABASE_PATH:-./data/band-chat.db}"
BACKUP_DIR="${1:-./backups}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database file not found: $DB_PATH"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/band-chat-$STAMP.db"

cp "$DB_PATH" "$BACKUP_FILE"
echo "Backup created: $BACKUP_FILE"
