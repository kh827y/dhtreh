#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${API_BASE_URL:-http://localhost:3000}}"
TIMEOUT="${TIMEOUT:-5}"
METRICS_TOKEN="${METRICS_TOKEN:-}"

check() {
  local path="$1"
  local name="$2"
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}${path}" || true)
  if [ "$code" = "200" ]; then
    echo "OK  ${name} ${path} (${code})"
    return 0
  fi
  echo "FAIL ${name} ${path} (${code})"
  return 1
}

failed=0
check "/healthz" "healthz" || failed=1
check "/readyz" "readyz" || failed=1
check "/live" "live" || failed=1

if [ -n "$METRICS_TOKEN" ]; then
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -H "X-Metrics-Token: ${METRICS_TOKEN}" "${BASE_URL}/metrics" || true)
  if [ "$code" = "200" ]; then
    echo "OK  metrics /metrics (${code})"
  else
    echo "FAIL metrics /metrics (${code})"
    failed=1
  fi
else
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "${BASE_URL}/metrics" || true)
  if [ "$code" = "200" ]; then
    echo "OK  metrics /metrics (${code})"
  else
    echo "SKIP metrics /metrics (${code})"
  fi
fi

if [ "$failed" -ne 0 ]; then
  exit 1
fi
