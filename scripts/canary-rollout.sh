#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.production.yml}"

CANARY_PHASES="${CANARY_PHASES:-5,25,100}"
CANARY_PHASE_WAIT_SEC="${CANARY_PHASE_WAIT_SEC:-20}"
CANARY_PHASE_SMOKE_RETRIES="${CANARY_PHASE_SMOKE_RETRIES:-4}"
CANARY_PHASE_SMOKE_INTERVAL_SEC="${CANARY_PHASE_SMOKE_INTERVAL_SEC:-5}"
CANARY_SMOKE_TIMEOUT="${CANARY_SMOKE_TIMEOUT:-5}"

CANARY_FULL_API_REPLICAS="${CANARY_FULL_API_REPLICAS:-2}"
CANARY_FULL_MINIAPP_REPLICAS="${CANARY_FULL_MINIAPP_REPLICAS:-2}"

CANARY_API_URL="${CANARY_API_URL:-${API_BASE_URL:-http://localhost:3000}}"
CANARY_APP_URL="${CANARY_APP_URL:-}"
CANARY_ADMIN_URL="${CANARY_ADMIN_URL:-}"
CANARY_PORTAL_URL="${CANARY_PORTAL_URL:-}"

log() {
  echo "[canary] $*"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if [ -z "$CANARY_APP_URL" ] && [ -n "${DOMAIN:-}" ]; then
  CANARY_APP_URL="https://app.${DOMAIN}"
fi

if [ -z "$CANARY_ADMIN_URL" ] && [ -n "${DOMAIN:-}" ]; then
  CANARY_ADMIN_URL="https://admin.${DOMAIN}"
fi

if [ -z "$CANARY_PORTAL_URL" ] && [ -n "${DOMAIN:-}" ]; then
  CANARY_PORTAL_URL="https://portal.${DOMAIN}"
fi

phase_to_replicas() {
  local percent="$1"
  local full="$2"
  local replicas
  replicas=$(( (full * percent + 99) / 100 ))
  if [ "$replicas" -lt 1 ]; then
    replicas=1
  fi
  echo "$replicas"
}

check_url() {
  local url="$1"
  local name="$2"
  if [ -z "$url" ]; then
    log "SKIP ${name}: url is not configured"
    return 0
  fi

  local code
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$CANARY_SMOKE_TIMEOUT" "$url" || true)"
  if [ "$code" = "200" ] || [ "$code" = "302" ]; then
    log "OK ${name} ${url} (${code})"
    return 0
  fi
  log "FAIL ${name} ${url} (${code})"
  return 1
}

phase_smoke() {
  local phase="$1"
  local attempt=1
  while [ "$attempt" -le "$CANARY_PHASE_SMOKE_RETRIES" ]; do
    log "Phase ${phase}% smoke attempt ${attempt}/${CANARY_PHASE_SMOKE_RETRIES}"
    if BASE_URL="$CANARY_API_URL" TIMEOUT="$CANARY_SMOKE_TIMEOUT" "$ROOT_DIR/scripts/smoke-check.sh" \
      && check_url "$CANARY_APP_URL" "app" \
      && check_url "$CANARY_ADMIN_URL" "admin" \
      && check_url "$CANARY_PORTAL_URL" "portal" \
      && "$ROOT_DIR/scripts/check-error-budget.sh"; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep "$CANARY_PHASE_SMOKE_INTERVAL_SEC"
  done
  return 1
}

current_api_replicas="$(compose ps --format '{{.Service}}' 2>/dev/null | awk '$1=="api"{c++} END{print c+0}')"
current_miniapp_replicas="$(compose ps --format '{{.Service}}' 2>/dev/null | awk '$1=="miniapp"{c++} END{print c+0}')"
rollback_api_replicas="${CANARY_ROLLBACK_API_REPLICAS:-$current_api_replicas}"
rollback_miniapp_replicas="${CANARY_ROLLBACK_MINIAPP_REPLICAS:-$current_miniapp_replicas}"

if [ "$rollback_api_replicas" -lt 1 ]; then
  rollback_api_replicas="$CANARY_FULL_API_REPLICAS"
fi
if [ "$rollback_miniapp_replicas" -lt 1 ]; then
  rollback_miniapp_replicas="$CANARY_FULL_MINIAPP_REPLICAS"
fi

for phase in ${CANARY_PHASES//,/ }; do
  if ! [[ "$phase" =~ ^[0-9]+$ ]]; then
    log "Invalid phase value: ${phase}"
    exit 1
  fi
  if [ "$phase" -lt 1 ] || [ "$phase" -gt 100 ]; then
    log "Phase is out of range 1..100: ${phase}"
    exit 1
  fi

  api_replicas="$(phase_to_replicas "$phase" "$CANARY_FULL_API_REPLICAS")"
  miniapp_replicas="$(phase_to_replicas "$phase" "$CANARY_FULL_MINIAPP_REPLICAS")"
  log "Applying phase ${phase}% (api=${api_replicas}, miniapp=${miniapp_replicas})"
  compose up -d --remove-orphans --scale "api=${api_replicas}" --scale "miniapp=${miniapp_replicas}"
  sleep "$CANARY_PHASE_WAIT_SEC"

  if ! phase_smoke "$phase"; then
    log "Phase ${phase}% failed. Rolling back to api=${rollback_api_replicas}, miniapp=${rollback_miniapp_replicas}"
    compose up -d --remove-orphans --scale "api=${rollback_api_replicas}" --scale "miniapp=${rollback_miniapp_replicas}"
    exit 1
  fi
done

log "Canary rollout completed"
