#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup.sql|backup.sql.gz>" >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi

if [[ "$FILE" == *.gz ]]; then
  if ! command -v gzip >/dev/null 2>&1; then
    echo "gzip not found" >&2
    exit 1
  fi
  gzip -t "$FILE"
  uncompressed_size=$(gzip -l "$FILE" | awk 'NR==2 {print $2}')
  if [ -n "${uncompressed_size:-}" ] && [ "$uncompressed_size" -gt 0 ]; then
    echo "Backup OK: $FILE (${uncompressed_size} bytes uncompressed)"
  else
    echo "Backup OK: $FILE"
  fi
else
  if [ ! -s "$FILE" ]; then
    echo "Backup file is empty: $FILE" >&2
    exit 1
  fi
  echo "Backup OK: $FILE"
fi
