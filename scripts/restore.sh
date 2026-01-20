#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"
DB_USER="${DB_USER:-loyalty}"
DB_NAME="${DB_NAME:-loyalty}"

if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup.sql|backup.sql.gz>" >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "Backup file not found: $FILE" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "ENV_FILE not found: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "COMPOSE_FILE not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ "$FILE" == *.gz ]]; then
  gunzip -c "$FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres psql -U "$DB_USER" "$DB_NAME"
else
  cat "$FILE" | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres psql -U "$DB_USER" "$DB_NAME"
fi
