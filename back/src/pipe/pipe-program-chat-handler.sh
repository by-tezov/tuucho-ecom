#!/usr/bin/env bash
# Versioned cPanel chat handler. The stable dispatcher selects this file.
set -euo pipefail

: "${PAMSURIN_CHAT_RELEASE_DIR:?The dispatcher must select a release}"
: "${PAMSURIN_CHAT_TARGET:?The dispatcher must select a target}"

# Deliberately silent in production. Keep the function for a no-op operational
# hook without exposing email contents, API responses, or credentials.
log() { :; }
log "handler started target=${PAMSURIN_CHAT_TARGET} release=${PAMSURIN_CHAT_RELEASE_DIR}"

read_env_value() {
  local file="$1"
  local key="$2"
  [[ -r "$file" ]] || return 0
  awk -v key="$key" '
    index($0, key "=") == 1 {
      value = substr($0, length(key) + 2)
      sub(/\r$/, "", value)
      if ((value ~ /^".*"$/) || (value ~ /^\047.*\047$/)) value = substr(value, 2, length(value) - 2)
      print value
      exit
    }
  ' "$file"
}

raw_file="$(mktemp "${TMPDIR:-/tmp}/pipe-program-chat.XXXXXX")"
response_file=""
trap 'rm -f "$raw_file" "${response_file:-}"' EXIT
cat >"$raw_file"

# The site sends this owner notification into the piped mailbox whenever a
# user writes. This is not an admin reply for the API: it replaces the former
# direct cPanel forward and must reach the owner through sendmail.
if awk 'BEGIN { IGNORECASE=1 }
  /^X-PamSurin-Chat-Message:[[:space:]]*/ { found=1; exit }
  END { exit(found ? 0 : 1) }' "$raw_file"; then
  forward_recipient="$(read_env_value "${PAMSURIN_CHAT_RELEASE_DIR}/.env/.public.env" EMAIL_CONTACT_FORWARD_RECIPIENT)"
  target_forward="$(read_env_value "${PAMSURIN_CHAT_RELEASE_DIR}/.env/${PAMSURIN_CHAT_TARGET}/.public.env" EMAIL_CONTACT_FORWARD_RECIPIENT)"
  forward_recipient="${target_forward:-$forward_recipient}"
  [[ -n "$forward_recipient" ]] || exit 0
  sendmail -oi "$forward_recipient" <"$raw_file" || log 'user notification forward failed'
  exit 0
fi

node_runtime=''
for candidate in "$HOME"/nodevenv/private_html/"${PAMSURIN_CHAT_TARGET}"/current/*/bin/node; do
  [[ -x "$candidate" ]] && node_runtime="$candidate" && break
done
: "${node_runtime:?cPanel Node runtime is missing}"
ops_port="$((40000 + RANDOM % 10000))"
APP_TARGET="$PAMSURIN_CHAT_TARGET" PAM_OPS_PORT="$ops_port" "$node_runtime" "$PAMSURIN_CHAT_RELEASE_DIR/opsServer.js" >/dev/null 2>&1 &
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
