#!/usr/bin/env bash
set -euo pipefail

PROMETHEUS_URL="${PROMETHEUS_URL:-}"
PROMETHEUS_BEARER_TOKEN="${PROMETHEUS_BEARER_TOKEN:-}"
PROM_TIMEOUT_SEC="${PROM_TIMEOUT_SEC:-5}"

CANARY_MAX_5XX_RATIO="${CANARY_MAX_5XX_RATIO:-0.01}"
CANARY_MAX_STALE_WORKERS="${CANARY_MAX_STALE_WORKERS:-0}"
CANARY_MAX_OUTBOX_DEAD_DELTA="${CANARY_MAX_OUTBOX_DEAD_DELTA:-0}"

log() {
  echo "[error-budget] $*"
}

num_gt() {
  local left="$1"
  local right="$2"
  awk -v a="$left" -v b="$right" 'BEGIN { exit (a > b ? 0 : 1) }'
}

if [ -z "$PROMETHEUS_URL" ]; then
  log "PROMETHEUS_URL is not set, skipping error budget checks"
  exit 0
fi

prom_query() {
  local expr="$1"
  local encoded
  encoded="$(node -p "encodeURIComponent(process.argv[1])" "$expr")"

  local auth_args=()
  if [ -n "$PROMETHEUS_BEARER_TOKEN" ]; then
    auth_args=(-H "Authorization: Bearer ${PROMETHEUS_BEARER_TOKEN}")
  fi

  local response
  response="$(curl -fsS --max-time "$PROM_TIMEOUT_SEC" "${auth_args[@]}" \
    "${PROMETHEUS_URL%/}/api/v1/query?query=${encoded}")"

  node -e '
const payload = JSON.parse(process.argv[1]);
if (payload?.status !== "success") {
  console.log("nan");
  process.exit(0);
}
const result = payload?.data?.result ?? [];
if (!Array.isArray(result) || result.length === 0) {
  console.log("0");
  process.exit(0);
}
const value = result?.[0]?.value ?? [];
if (!Array.isArray(value) || value.length < 2) {
  console.log("0");
  process.exit(0);
}
const n = Number(value[1]);
console.log(Number.isFinite(n) ? String(n) : "nan");
' "$response"
}

five_xx_ratio="$(prom_query 'sum(rate(http_requests_total{status=~"5.."}[5m])) / clamp_min(sum(rate(http_requests_total[5m])), 1)')"
stale_workers="$(prom_query 'sum(max_over_time(loyalty_worker_stale[5m]))')"
outbox_dead_delta="$(prom_query 'increase(loyalty_outbox_dead_total[10m])')"

log "5xx_ratio=${five_xx_ratio} (max=${CANARY_MAX_5XX_RATIO})"
log "stale_workers=${stale_workers} (max=${CANARY_MAX_STALE_WORKERS})"
log "outbox_dead_delta=${outbox_dead_delta} (max=${CANARY_MAX_OUTBOX_DEAD_DELTA})"

failed=0
if num_gt "$five_xx_ratio" "$CANARY_MAX_5XX_RATIO"; then
  log "FAIL: 5xx ratio exceeds threshold"
  failed=1
fi

if num_gt "$stale_workers" "$CANARY_MAX_STALE_WORKERS"; then
  log "FAIL: stale workers exceed threshold"
  failed=1
fi

if num_gt "$outbox_dead_delta" "$CANARY_MAX_OUTBOX_DEAD_DELTA"; then
  log "FAIL: outbox dead delta exceeds threshold"
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi

log "Error budget checks passed"
