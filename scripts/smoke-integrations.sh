#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${API_BASE_URL:-http://localhost:3000}}"
API_KEY="${INTEGRATION_API_KEY:-${API_KEY:-}}"
TIMEOUT="${TIMEOUT:-5}"

SMOKE_USER_TOKEN="${SMOKE_USER_TOKEN:-}"
SMOKE_CUSTOMER_ID="${SMOKE_CUSTOMER_ID:-}"
SMOKE_PHONE="${SMOKE_PHONE:-}"
SMOKE_OUTLET_ID="${SMOKE_OUTLET_ID:-}"
SMOKE_DEVICE_ID="${SMOKE_DEVICE_ID:-}"
SMOKE_MANAGER_ID="${SMOKE_MANAGER_ID:-}"

SMOKE_TOTAL="${SMOKE_TOTAL:-1000}"
SMOKE_ITEM_ID="${SMOKE_ITEM_ID:-smoke-item}"
SMOKE_ITEM_NAME="${SMOKE_ITEM_NAME:-Smoke item}"
SMOKE_ITEM_PRICE="${SMOKE_ITEM_PRICE:-1000}"
SMOKE_ITEM_QTY="${SMOKE_ITEM_QTY:-1}"

SMOKE_ALLOW_MUTATIONS="${SMOKE_ALLOW_MUTATIONS:-0}"
SMOKE_ITERATIONS_READ="${SMOKE_ITERATIONS_READ:-3}"
SMOKE_ITERATIONS_MUTATIONS="${SMOKE_ITERATIONS_MUTATIONS:-1}"

SMOKE_MAX_MS_CODE="${SMOKE_MAX_MS_CODE:-800}"
SMOKE_MAX_MS_CALC_ACTION="${SMOKE_MAX_MS_CALC_ACTION:-1200}"
SMOKE_MAX_MS_CALC_BONUS="${SMOKE_MAX_MS_CALC_BONUS:-1200}"
SMOKE_MAX_MS_BONUS="${SMOKE_MAX_MS_BONUS:-1500}"
SMOKE_MAX_MS_REFUND="${SMOKE_MAX_MS_REFUND:-1500}"

fail=0
tmp_files=()

cleanup() {
  for f in "${tmp_files[@]:-}"; do
    rm -f "$f"
  done
}
trap cleanup EXIT

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env: ${name}"
    exit 1
  fi
}

require_env "API_KEY"

bail_if_failed() {
  if [ "$fail" -ne 0 ]; then
    exit 1
  fi
}

make_items_json() {
  if [ -n "${SMOKE_ITEMS_JSON:-}" ]; then
    printf '%s' "$SMOKE_ITEMS_JSON"
    return
  fi
  printf '[{"id_product":"%s","qty":%s,"price":%s,"name":"%s"}]' \
    "$SMOKE_ITEM_ID" \
    "$SMOKE_ITEM_QTY" \
    "$SMOKE_ITEM_PRICE" \
    "$SMOKE_ITEM_NAME"
}

percentile() {
  local p="$1"
  shift
  printf '%s\n' "$@" | sort -n | awk -v p="$p" '
    { a[NR] = $1 }
    END {
      if (NR == 0) exit 1;
      idx = int((p * NR + 99) / 100);
      if (idx < 1) idx = 1;
      if (idx > NR) idx = NR;
      print a[idx];
    }'
}

post_json() {
  local name="$1"
  local path="$2"
  local body="$3"
  local max_ms="$4"
  local iterations="$5"
  local times=()
  local last_file=""

  for i in $(seq 1 "$iterations"); do
    local tmp
    tmp="$(mktemp)"
    tmp_files+=("$tmp")
    local meta
    meta=$(
      curl -sS -o "$tmp" -w "%{http_code} %{time_total}" \
        --max-time "$TIMEOUT" \
        -H "X-Api-Key: ${API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "${BASE_URL}${path}" || true
    )
    local code secs
    code="${meta%% *}"
    secs="${meta##* }"
    local ms
    ms=$(awk -v s="$secs" 'BEGIN { printf "%d", s * 1000 }')
    if [ "$code" != "200" ]; then
      echo "FAIL ${name} ${path} (${code}) ${ms}ms"
      cat "$tmp"
      fail=1
      last_file="$tmp"
      break
    fi
    times+=("$ms")
    last_file="$tmp"
  done

  if [ "${#times[@]}" -gt 0 ]; then
    local p95
    p95=$(percentile 95 "${times[@]}")
    local max
    max=$(printf '%s\n' "${times[@]}" | sort -n | tail -n 1)
    if [ "$max_ms" -gt 0 ] && [ "$p95" -gt "$max_ms" ]; then
      echo "FAIL ${name} p95=${p95}ms max=${max}ms threshold=${max_ms}ms"
      fail=1
    else
      echo "OK  ${name} p95=${p95}ms max=${max}ms"
    fi
  fi

  SMOKE_LAST_RESPONSE_FILE="$last_file"
}

json_get() {
  local file="$1"
  local expr="$2"
  python - "$file" "$expr" <<'PY'
import json
import sys
path = sys.argv[2].split(".")
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    print("")
    raise SystemExit(0)
cur = data
for key in path:
    if isinstance(cur, dict) and key in cur:
        cur = cur[key]
    else:
        print("")
        raise SystemExit(0)
if cur is None:
    print("")
elif isinstance(cur, (str, int, float)):
    print(cur)
else:
    print("")
PY
}

if [ -z "$SMOKE_USER_TOKEN" ]; then
  echo "Missing SMOKE_USER_TOKEN (required for /code)"
  exit 1
fi

items_json="$(make_items_json)"

post_json "code" "/api/integrations/code" \
  "{\"user_token\":\"${SMOKE_USER_TOKEN}\"}" \
  "$SMOKE_MAX_MS_CODE" \
  "$SMOKE_ITERATIONS_READ"
code_resp="$SMOKE_LAST_RESPONSE_FILE"
customer_id="${SMOKE_CUSTOMER_ID:-}"
if [ -z "$customer_id" ] && [ -n "$code_resp" ]; then
  customer_id="$(json_get "$code_resp" "client.id_client")"
fi
if [ -z "$customer_id" ]; then
  echo "FAIL code response: missing client.id_client"
  fail=1
fi
bail_if_failed

if [ -z "$customer_id" ] && [ -z "$SMOKE_PHONE" ]; then
  echo "Missing customer context: set SMOKE_CUSTOMER_ID or SMOKE_PHONE"
  exit 1
fi

calc_action_body="{\"items\":${items_json}"
if [ -n "$customer_id" ]; then
  calc_action_body="${calc_action_body},\"id_client\":\"${customer_id}\""
elif [ -n "$SMOKE_PHONE" ]; then
  calc_action_body="${calc_action_body},\"phone\":\"${SMOKE_PHONE}\""
fi
if [ -n "$SMOKE_OUTLET_ID" ]; then
  calc_action_body="${calc_action_body},\"outlet_id\":\"${SMOKE_OUTLET_ID}\""
fi
calc_action_body="${calc_action_body}}"
post_json "calculate_action" "/api/integrations/calculate/action" \
  "$calc_action_body" \
  "$SMOKE_MAX_MS_CALC_ACTION" \
  "$SMOKE_ITERATIONS_READ"
calc_action_resp="$SMOKE_LAST_RESPONSE_FILE"
calc_action_status="$(json_get "$calc_action_resp" "status")"
if [ "$calc_action_status" != "ok" ]; then
  echo "FAIL calculate_action response: status=${calc_action_status:-missing}"
  fail=1
fi
bail_if_failed

calc_bonus_body="{\"total\":${SMOKE_TOTAL}"
if [ -n "$SMOKE_USER_TOKEN" ]; then
  calc_bonus_body="${calc_bonus_body},\"user_token\":\"${SMOKE_USER_TOKEN}\""
elif [ -n "$customer_id" ]; then
  calc_bonus_body="${calc_bonus_body},\"id_client\":\"${customer_id}\""
elif [ -n "$SMOKE_PHONE" ]; then
  calc_bonus_body="${calc_bonus_body},\"phone\":\"${SMOKE_PHONE}\""
fi
if [ -n "$SMOKE_OUTLET_ID" ]; then
  calc_bonus_body="${calc_bonus_body},\"outlet_id\":\"${SMOKE_OUTLET_ID}\""
fi
calc_bonus_body="${calc_bonus_body}}"
post_json "calculate_bonus" "/api/integrations/calculate/bonus" \
  "$calc_bonus_body" \
  "$SMOKE_MAX_MS_CALC_BONUS" \
  "$SMOKE_ITERATIONS_READ"
calc_bonus_resp="$SMOKE_LAST_RESPONSE_FILE"
calc_bonus_status="$(json_get "$calc_bonus_resp" "status")"
if [ "$calc_bonus_status" != "ok" ]; then
  echo "FAIL calculate_bonus response: status=${calc_bonus_status:-missing}"
  fail=1
fi
bail_if_failed

if [ "$SMOKE_ALLOW_MUTATIONS" = "1" ]; then
  if [ -z "$SMOKE_OUTLET_ID" ] && [ -z "$SMOKE_DEVICE_ID" ] && [ -z "$SMOKE_MANAGER_ID" ]; then
    echo "Missing outlet/device/manager for bonus (set SMOKE_OUTLET_ID or SMOKE_DEVICE_ID or SMOKE_MANAGER_ID)"
    exit 1
  fi
  idem_key="${SMOKE_IDEMPOTENCY_KEY:-smoke_$(date +%s)_$RANDOM}"
  bonus_body="{\"total\":${SMOKE_TOTAL},\"idempotency_key\":\"${idem_key}\""
  if [ -n "$SMOKE_USER_TOKEN" ]; then
    bonus_body="${bonus_body},\"user_token\":\"${SMOKE_USER_TOKEN}\""
  elif [ -n "$customer_id" ]; then
    bonus_body="${bonus_body},\"id_client\":\"${customer_id}\""
  elif [ -n "$SMOKE_PHONE" ]; then
    bonus_body="${bonus_body},\"phone\":\"${SMOKE_PHONE}\""
  fi
  if [ -n "$SMOKE_OUTLET_ID" ]; then
    bonus_body="${bonus_body},\"outlet_id\":\"${SMOKE_OUTLET_ID}\""
  fi
  if [ -n "$SMOKE_DEVICE_ID" ]; then
    bonus_body="${bonus_body},\"device_id\":\"${SMOKE_DEVICE_ID}\""
  fi
  if [ -n "$SMOKE_MANAGER_ID" ]; then
    bonus_body="${bonus_body},\"manager_id\":\"${SMOKE_MANAGER_ID}\""
  fi
  bonus_body="${bonus_body}}"
  post_json "bonus" "/api/integrations/bonus" \
    "$bonus_body" \
    "$SMOKE_MAX_MS_BONUS" \
    "$SMOKE_ITERATIONS_MUTATIONS"
  bonus_resp="$SMOKE_LAST_RESPONSE_FILE"
  bonus_result="$(json_get "$bonus_resp" "result")"
  if [ "$bonus_result" != "ok" ]; then
    echo "FAIL bonus response: result=${bonus_result:-missing}"
    fail=1
  fi
  bail_if_failed
  order_id="$(json_get "$bonus_resp" "order_id")"
  if [ -z "$order_id" ]; then
    echo "FAIL bonus response: missing order_id"
    fail=1
  else
    refund_body="{\"order_id\":\"${order_id}\"}"
    post_json "refund" "/api/integrations/refund" \
      "$refund_body" \
      "$SMOKE_MAX_MS_REFUND" \
      "$SMOKE_ITERATIONS_MUTATIONS"
    refund_resp="$SMOKE_LAST_RESPONSE_FILE"
    refund_result="$(json_get "$refund_resp" "result")"
    if [ "$refund_result" != "ok" ]; then
      echo "FAIL refund response: result=${refund_result:-missing}"
      fail=1
    fi
  fi
else
  echo "SKIP bonus/refund (set SMOKE_ALLOW_MUTATIONS=1 to enable)"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
