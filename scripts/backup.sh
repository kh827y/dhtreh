#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-${ENV_FILE:-.env.production}}"
COMPOSE_FILE="${2:-${COMPOSE_FILE:-docker-compose.production.yml}}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ENV_FILE not found: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "COMPOSE_FILE not found: $COMPOSE_FILE" >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm backup
