#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"

info() {
  echo "[preflight] $*"
}

warn() {
  echo "[preflight][WARN] $*" >&2
}

fail() {
  echo "[preflight][ERROR] $*" >&2
  exit 1
}

if [ ! -f "$ENV_FILE" ]; then
  fail "Env file not found: $ENV_FILE"
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  fail "Compose file not found: $COMPOSE_FILE"
fi

if ! command -v docker >/dev/null 2>&1; then
  fail "docker not found"
fi

if ! docker info >/dev/null 2>&1; then
  fail "docker daemon not running"
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "docker compose not available"
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

missing=0
required=(DATABASE_URL ADMIN_KEY API_KEY)
for key in "${required[@]}"; do
  if [ -z "${!key:-}" ]; then
    warn "Missing $key"
    missing=1
  fi
done

if [ "${NODE_ENV:-}" = "production" ]; then
  required_prod=(QR_JWT_SECRET ADMIN_SESSION_SECRET PORTAL_JWT_SECRET PORTAL_REFRESH_SECRET CORS_ORIGINS)
  for key in "${required_prod[@]}"; do
    if [ -z "${!key:-}" ]; then
      warn "Missing $key"
      missing=1
    fi
  done
fi

is_placeholder() {
  case "$1" in
    *change_me*|*dev_change_me*|*generate_strong*|*replace_with*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [ "${NODE_ENV:-}" = "production" ]; then
  for key in QR_JWT_SECRET ADMIN_SESSION_SECRET PORTAL_JWT_SECRET PORTAL_REFRESH_SECRET ADMIN_KEY API_KEY; do
    val="${!key:-}"
    if [ -n "$val" ] && is_placeholder "$val"; then
      warn "$key looks like a placeholder value"
      missing=1
    fi
  done
fi

if [ "$missing" -ne 0 ]; then
  fail "Preflight failed"
fi

info "Preflight OK"
