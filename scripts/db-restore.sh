#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <backup-file.db>"
  exit 1
fi

BACKUP_FILE="$1"
DB_PATH="${DATABASE_PATH:-./data/band-chat.db}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"
cp "$BACKUP_FILE" "$DB_PATH"
echo "Database restored to: $DB_PATH"
