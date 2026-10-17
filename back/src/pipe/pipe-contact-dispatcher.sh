#!/usr/bin/env bash
# Versioned second-stage contact dispatcher. The stable main cPanel pipe sets
# the selected target and release before passing it the original message.
set -euo pipefail

: "${PAMSURIN_CONTACT_TARGET:?main contact dispatcher target missing}"
: "${PAMSURIN_CONTACT_RELEASE_DIR:?main contact dispatcher release missing}"
[[ "$PAMSURIN_CONTACT_TARGET" =~ ^(preprod|prod)$ ]] || exit 0
log() { :; }

raw_file="$(mktemp "${TMPDIR:-/tmp}/pipe-contact-dispatcher.XXXXXX")"
trap 'rm -f "$raw_file"' EXIT
cat >"$raw_file"

# Missing file/key is empty, not a bounce — same as an unset forward address.
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

is_product_request=no
if grep -Eqi 'PAMSURIN-REQUEST:[A-F0-9]{8}:[A-F0-9]{24}:' "$raw_file"; then
  is_product_request=yes
fi

is_chat_reply="$(awk 'BEGIN { IGNORECASE=1 }
  /^In-Reply-To:[[:space:]]*/ { if ($0 ~ /pamsurin-chat\./) { print "yes"; exit } }
  /^References:[[:space:]]*/ { if ($0 ~ /pamsurin-chat\./) { print "yes"; exit } }
  /^Subject:[[:space:]]*/ { if ($0 ~ /#[A-F0-9]{8}-[A-F0-9]{24}/) { print "yes"; exit } }' "$raw_file")"

if [[ "$is_product_request" == yes || "$is_chat_reply" == yes ]]; then
  if [[ "$is_product_request" == yes ]]; then
    handler="${PAMSURIN_CONTACT_RELEASE_DIR}/pipe/pipe-program-product-request-handler.sh"
  else
    handler="${PAMSURIN_CONTACT_RELEASE_DIR}/pipe/pipe-program-chat-handler.sh"
  fi
  [[ -x "$handler" ]] || exit 0
  export PAMSURIN_CHAT_RELEASE_DIR="$PAMSURIN_CONTACT_RELEASE_DIR"
  export PAMSURIN_CHAT_TARGET="$PAMSURIN_CONTACT_TARGET"
  "$handler" <"$raw_file" || log "versioned handler failed"
  exit 0
fi

forward_recipient="$(read_env_value "${PAMSURIN_CONTACT_RELEASE_DIR}/.env/.public.env" EMAIL_CONTACT_FORWARD_RECIPIENT)"
target_forward="$(read_env_value "${PAMSURIN_CONTACT_RELEASE_DIR}/.env/${PAMSURIN_CONTACT_TARGET}/.public.env" EMAIL_CONTACT_FORWARD_RECIPIENT)"
forward_recipient="${target_forward:-$forward_recipient}"
[[ -n "$forward_recipient" ]] || exit 0

# Re-inject the exact original RFC 5322 message through cPanel's local mail
# transfer agent. The configured recipient must be external to the piped
# mailbox to avoid a forwarding loop.
sendmail -oi "$forward_recipient" <"$raw_file" || log "forward failed"
exit 0
