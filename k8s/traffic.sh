#!/usr/bin/env bash
# Шлёт непрерывный трафик через Envoy-прокси и печатает версию, которая ответила.
# Находит сервис прокси и пробрасывает локальный порт, как в docs/demo/traffic.sh.
#
# Использование:
#   bash k8s/traffic.sh                        # Ctrl-C — стоп
#   bash k8s/traffic.sh 100 | tee traffic.log   # 100 запросов с записью лога
#   USER_GROUP=beta LOCAL_PORT=8889 bash k8s/traffic.sh
set -euo pipefail

NS="${NS:-raincheck}"
EG_NS="${EG_NS:-envoy-gateway-system}"
LOCAL_PORT="${LOCAL_PORT:-8888}"
RATE="${RATE:-0.2}"
REQUEST_PATH="${REQUEST_PATH:-/api/version}"
COUNT="${1:-0}"   # 0 = бесконечно

# Находим Envoy-прокси, созданный для Gateway eg.
SVC="$(kubectl get svc -n "$EG_NS" \
  -l "gateway.envoyproxy.io/owning-gateway-name=eg,gateway.envoyproxy.io/owning-gateway-namespace=$NS" \
  -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [[ -z "$SVC" ]]; then
  echo "Envoy proxy service not found for Gateway $NS/eg. Check: kubectl get gateway -n $NS eg" >&2
  exit 1
fi

echo "Forwarding local port $LOCAL_PORT -> $EG_NS/svc/$SVC:80"
PF_LOG="$(mktemp)"
kubectl port-forward -n "$EG_NS" "svc/$SVC" "${LOCAL_PORT}:80" --address 127.0.0.1 >"$PF_LOG" 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true; wait "$PF_PID" 2>/dev/null || true; rm -f -- "$PF_LOG"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for _ in $(seq 1 30); do
  grep -Fq "Forwarding from 127.0.0.1:$LOCAL_PORT ->" "$PF_LOG" && break
  kill -0 "$PF_PID" 2>/dev/null || break
  sleep 0.5
done
if ! grep -Fq "Forwarding from 127.0.0.1:$LOCAL_PORT ->" "$PF_LOG"; then
  cat "$PF_LOG" >&2
  echo "Could not open port-forward on port $LOCAL_PORT." >&2
  exit 1
fi

GW="http://127.0.0.1:${LOCAL_PORT}${REQUEST_PATH}"
HEADERS=()
if [[ -n "${HOST_HEADER:-}" ]]; then HEADERS+=(-H "Host: $HOST_HEADER"); fi
if [[ -n "${USER_GROUP:-}" ]]; then HEADERS+=(-H "X-User-Group: $USER_GROUP"); fi
echo "Traffic to $GW (delay ${RATE}s, group ${USER_GROUP:-default}). Press Ctrl+C to stop."

i=0
while :; do
  response="$(curl -s --max-time 2 "${HEADERS[@]}" -w '\n%{http_code} %header{x-app-version}' "$GW")" || response=$'\n000'
  read -r status version <<< "${response##*$'\n'}"
  body="${response%%$'\n'*}"
  # Версия берётся из заголовка, а в демо она уже есть в теле ответа.
  if [[ -n "$version" || "$body" != 'Host: '*', Version: '* ]]; then
    body="Version: ${version:-unknown}"
  fi
  printf '%s | HTTP %s | %s\n' "$(date +%H:%M:%S)" "$status" "$body"
  i=$((i + 1))
  if [[ "$COUNT" -gt 0 && "$i" -ge "$COUNT" ]]; then break; fi
  sleep "$RATE"
done
