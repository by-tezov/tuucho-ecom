#!/usr/bin/env bash
# Versioned cPanel chat handler. The stable dispatcher selects this file.
set -euo pipefail

: "${TUCHO_CHAT_RELEASE_DIR:?The dispatcher must select a release}"
: "${TUCHO_CHAT_TARGET:?The dispatcher must select a target}"

# Deliberately silent in production. Keep the function for a no-op operational
# hook without exposing email contents, API responses, or credentials.
log() { :; }
log "handler started target=${TUCHO_CHAT_TARGET} release=${TUCHO_CHAT_RELEASE_DIR}"

read_plugin_setting() {
  local plugin_id="$1"
  local key="$2"
  local node_runtime=''
  for candidate in "$HOME"/nodevenv/private_html/"${TUCHO_CHAT_TARGET}"/current/*/bin/node; do
    [[ -x "$candidate" ]] && node_runtime="$candidate" && break
  done
  [[ -n "$node_runtime" ]] || return 0
  APP_TARGET="$TUCHO_CHAT_TARGET" TUCHO_RELEASE_DIR="$TUCHO_CHAT_RELEASE_DIR" \
    "$node_runtime" "${TUCHO_CHAT_RELEASE_DIR}/readReleaseConfig.cjs" --plugin "$plugin_id" "$key" 2>/dev/null || true
}

raw_file="$(mktemp "${TMPDIR:-/tmp}/pipe-program-chat.XXXXXX")"
response_file=""
trap 'rm -f "$raw_file" "${response_file:-}"' EXIT
cat >"$raw_file"

# The site sends this owner notification into the piped mailbox whenever a
# user writes. This is not an admin reply for the API: it replaces the former
# direct cPanel forward and must reach the owner through sendmail.
if awk 'BEGIN { IGNORECASE=1 }
  /^X-Tuucho-Chat-Message:[[:space:]]*/ { found=1; exit }
  END { exit(found ? 0 : 1) }' "$raw_file"; then
  forward_recipient="$(read_plugin_setting tuucho-contact forwardRecipient)"
  [[ -n "$forward_recipient" ]] || exit 0
  sendmail -oi "$forward_recipient" <"$raw_file" || log 'user notification forward failed'
  exit 0
fi

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

response_file="$(mktemp "${TMPDIR:-/tmp}/pipe-program-chat-response.XXXXXX")"
b64="$(base64 -w0 "$raw_file" 2>/dev/null || base64 "$raw_file" | tr -d '\n')"
log "posting loopback operations endpoint payload_base64_bytes=${#b64}"
if http_status="$(curl -sS -o "$response_file" -w '%{http_code}' -X POST \
  -H "Content-Type: application/json" \
  -d "{\"rawBase64\":\"${b64}\"}" \
  "http://127.0.0.1:${ops_port}/operation/chat/inbound")"; then
  if [[ "$http_status" =~ ^2[0-9][0-9]$ ]]; then
    response_body="$(head -c 1000 "$response_file" | tr '\r\n' '  ')"
    log "API response HTTP ${http_status}: ${response_body}"
    exit 0
  fi
  response_body="$(head -c 1000 "$response_file" | tr '\r\n' '  ')"
  log "API response HTTP ${http_status}: ${response_body}"
  log "API returned HTTP ${http_status}"
  exit 1
else
  log 'API request failed before receiving an HTTP response'
  exit 1
fi
