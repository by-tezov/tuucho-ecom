#!/usr/bin/env bash
set -euo pipefail
: "${TUCHO_CHAT_RELEASE_DIR:?dispatcher release missing}"
: "${TUCHO_CHAT_TARGET:?dispatcher target missing}"
raw="$(cat)"
b64="$(printf '%s' "$raw" | base64 -w0 2>/dev/null || printf '%s' "$raw" | base64)"
node_runtime=''
for candidate in "$HOME"/nodevenv/private_html/"${TUCHO_CHAT_TARGET}"/current/*/bin/node; do
  [[ -x "$candidate" ]] && node_runtime="$candidate" && break
done
: "${node_runtime:?cPanel Node runtime is missing}"
ops_port="$((40000 + RANDOM % 10000))"
APP_TARGET="$TUCHO_CHAT_TARGET" PAM_OPS_PORT="$ops_port" "$node_runtime" "$TUCHO_CHAT_RELEASE_DIR/opsServer.js" >/dev/null 2>&1 &
ops_pid=$!
trap 'kill "$ops_pid" 2>/dev/null || true' EXIT
for _ in {1..50}; do
  curl -fsS "http://127.0.0.1:${ops_port}/healthz" >/dev/null && break
  sleep 0.1
done
curl -fsS -o /dev/null -X POST -H 'Content-Type: application/json' -d "{\"rawBase64\":\"${b64}\"}" "http://127.0.0.1:${ops_port}/operation/chat/inbound"
