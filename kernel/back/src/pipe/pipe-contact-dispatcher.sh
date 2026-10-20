#!/usr/bin/env bash
# Versioned second-stage contact dispatcher. The stable main cPanel pipe sets
# the selected target and release before passing it the original message.
set -euo pipefail

: "${TUCHO_CONTACT_TARGET:?main contact dispatcher target missing}"
: "${TUCHO_CONTACT_RELEASE_DIR:?main contact dispatcher release missing}"
[[ "$TUCHO_CONTACT_TARGET" =~ ^(preprod|prod)$ ]] || exit 0
log() { :; }

raw_file="$(mktemp "${TMPDIR:-/tmp}/pipe-contact-dispatcher.XXXXXX")"
trap 'rm -f "$raw_file"' EXIT
cat >"$raw_file"

# Missing setting is empty, not a bounce — same as an unset forward address.
read_plugin_setting() {
  local plugin_id="$1"
  local key="$2"
  local node_runtime=''
  for candidate in "$HOME"/nodevenv/private_html/"${TUCHO_CONTACT_TARGET}"/current/*/bin/node; do
    [[ -x "$candidate" ]] && node_runtime="$candidate" && break
  done
  [[ -n "$node_runtime" ]] || return 0
  APP_TARGET="$TUCHO_CONTACT_TARGET" TUCHO_RELEASE_DIR="$TUCHO_CONTACT_RELEASE_DIR" \
    "$node_runtime" "${TUCHO_CONTACT_RELEASE_DIR}/readReleaseConfig.cjs" --plugin "$plugin_id" "$key" 2>/dev/null || true
}

is_product_request=no
if grep -Eqi 'TUCHO-REQUEST:[A-F0-9]{8}:[A-F0-9]{24}:' "$raw_file"; then
  is_product_request=yes
fi

is_chat_reply="$(awk 'BEGIN { IGNORECASE=1 }
  /^In-Reply-To:[[:space:]]*/ { if ($0 ~ /tuucho-chat\./) { print "yes"; exit } }
  /^References:[[:space:]]*/ { if ($0 ~ /tuucho-chat\./) { print "yes"; exit } }
  /^Subject:[[:space:]]*/ { if ($0 ~ /#[A-F0-9]{8}-[A-F0-9]{24}/) { print "yes"; exit } }' "$raw_file")"

if [[ "$is_product_request" == yes || "$is_chat_reply" == yes ]]; then
  if [[ "$is_product_request" == yes ]]; then
    handler="${TUCHO_CONTACT_RELEASE_DIR}/pipe/pipe-program-product-request-handler.sh"
  else
    handler="${TUCHO_CONTACT_RELEASE_DIR}/pipe/pipe-program-chat-handler.sh"
  fi
  [[ -x "$handler" ]] || exit 0
  export TUCHO_CHAT_RELEASE_DIR="$TUCHO_CONTACT_RELEASE_DIR"
  export TUCHO_CHAT_TARGET="$TUCHO_CONTACT_TARGET"
  "$handler" <"$raw_file" || log "versioned handler failed"
  exit 0
fi

forward_recipient="$(read_plugin_setting tuucho-contact forwardRecipient)"
[[ -n "$forward_recipient" ]] || exit 0

# Re-inject the exact original RFC 5322 message through cPanel's local mail
# transfer agent. The configured recipient must be external to the piped
# mailbox to avoid a forwarding loop.
sendmail -oi "$forward_recipient" <"$raw_file" || log "forward failed"
exit 0
