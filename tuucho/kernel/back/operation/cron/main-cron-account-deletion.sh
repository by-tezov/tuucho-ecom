#!/usr/bin/env bash
# =============================================================================
# Production cron: scheduled account deletion
# =============================================================================
#
#   >>> PERIOD: ONCE A DAY, at 04:17 <<<
#       cron expression: 17 4 * * * (server time)
#
# Flag:     ENABLED_CRON_ACCOUNT_DELETION
# Log:      PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE (inside PRIVATE_DIR)
# Pref:     cronAccountDeletionLogEnabled (log write/read only)
#
# What it does (POST /operation/process-account-deletions):
#   - Sends a reminder email to accounts whose pending deletion is
#     DELETION_REMINDER_DAYS_BEFORE days away.
#   - Hard-deletes accounts already past deletion_scheduled_for.
#   - Idempotent: a re-run only touches accounts still due.
#
# How it runs:
#   1. Reads PRIVATE_DIR and PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE
#      from kernel JSON (`config/`) and resolves the jsonl path
#      inside PRIVATE_DIR (rejects any '..'). Reads OPS_TOKEN from kernel
#      private JSON (`ops.token`). The token is
#      sent as a Bearer header and is never written to the journal.
#   2. Starts a throwaway opsServer.js (APP_TARGET=prod) on a random loopback
#      port 40000-49999 with the cPanel Node runtime, and waits up to 30s for
#      its /healthz. The process is killed on exit (trap).
#   3. POSTs /operation/process-account-deletions (180s max) with that
#      Bearer header and appends the JSON result. The line keeps `at` and
#      `event` (filled here when the body omits them) plus the counters
#      when the log preference is on. A failure is one JSON line with `at`
#      (ops_token_missing, ops_server_exited, ops_server_not_ready,
#      ops_unauthorized, ops_request_failed) and the script exits 1.
#   The job always processes when it runs; the admin preference only gates
#   whether the detailed result is written to / readable from the log.
#
# Install: `deploy --prod` copies this file to
#   ~/bin/main-cron-account-deletion.sh
# substitutes the active release path below, and adds the crontab entry
# on every production deploy.
# Preproduction never installs it.
#
# Manual run: ssh lws_shop_example '$HOME/bin/main-cron-account-deletion.sh'
# Reference:  docs/cron/README.md
# =============================================================================
set -euo pipefail

release_dir='__TUCHO_RELEASE_DIR__'
if [[ ! -d "$release_dir/config" ]]; then
  printf 'Account-deletion release path was not installed.\n' >&2
  exit 1
fi

node_runtime=''
for candidate in "$HOME"/nodevenv/private_html/prod/current/*/bin/node; do
  [[ -x "$candidate" ]] && node_runtime="$candidate" && break
done
: "${node_runtime:?cPanel Node runtime is missing}"

read_release() {
  APP_TARGET=prod TUCHO_RELEASE_DIR="$release_dir" "$node_runtime" "$release_dir/readReleaseConfig.cjs" "$@"
}

private_dir="$(read_release paths.privateDir)"
cron_log_file="$(read_release paths.logs.cronAccountDeletion)"

: "${private_dir:?paths.privateDir is missing from kernel JSON}"
: "${cron_log_file:?paths.logs.cronAccountDeletion is missing from kernel JSON/plugin settings}"

cron_log_relative="${cron_log_file#/}"
if [[ -z "$cron_log_relative" || "$cron_log_relative" == *'..'* ]]; then
  printf '%s must stay within PRIVATE_DIR.\n' 'paths.logs.cronAccountDeletion' >&2
  exit 1
fi
cron_log_path="${private_dir%/}/$cron_log_relative"
mkdir -p "$(dirname "$cron_log_path")"

append_json() {
  printf '%s\n' "$1" >>"$cron_log_path"
}

# Fills at and event when the operations body omits them, so the journal
# card always has a run time and a name. Does not rewrite a body that
# already carries them.
append_stamped_body() {
  "$node_runtime" - "$ops_body" "$cron_log_path" "$1" <<'JS'
const fs = require('fs');
const bodyPath = process.argv[2];
const logPath = process.argv[3];
const event = process.argv[4];
const raw = fs.readFileSync(bodyPath, 'utf8').trim();
let line = raw;
try {
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (typeof parsed.at !== 'string' || parsed.at.length === 0) parsed.at = new Date().toISOString();
    if (typeof parsed.event !== 'string' || parsed.event.length === 0) parsed.event = event;
    line = JSON.stringify(parsed);
  }
} catch {
  /* keep the raw body */
}
fs.appendFileSync(logPath, line.endsWith('\n') ? line : `${line}\n`);
JS
}

ops_token="$(read_release ops.token)"
if [[ -z "$ops_token" || "$ops_token" == *$'\n'* || "$ops_token" == *'"'* || "$ops_token" == *\\* ]]; then
  append_json "$(printf '{"success":false,"error":"ops_token_missing","at":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  exit 1
fi

ops_port="$((40000 + RANDOM % 10000))"
ops_body="$(mktemp)"
ops_auth="$(mktemp)"
chmod 600 "$ops_body" "$ops_auth"
printf 'header = "Authorization: Bearer %s"\n' "$ops_token" >"$ops_auth"
unset ops_token
APP_TARGET=prod PAM_OPS_PORT="$ops_port" "$node_runtime" "$release_dir/opsServer.js" >/dev/null 2>&1 &
ops_pid=$!
trap 'kill "$ops_pid" 2>/dev/null || true; rm -f "$ops_body" "$ops_auth"' EXIT
ready=0
for _ in {1..300}; do
  if /usr/bin/curl --silent --fail --max-time 1 "http://127.0.0.1:${ops_port}/healthz" >/dev/null 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$ops_pid" 2>/dev/null; then
    append_json "$(printf '{"success":false,"error":"ops_server_exited","at":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
    exit 1
  fi
  sleep 0.1
done
if [[ "$ready" -ne 1 ]]; then
  append_json "$(printf '{"success":false,"error":"ops_server_not_ready","at":"%s"}' "$(date -u +%Y-%m-%dT%H:%M:%SZ)")"
  exit 1
fi
set +e
http_code="$(/usr/bin/curl --silent --config "$ops_auth" --output "$ops_body" --write-out '%{http_code}' --max-time 180 --request POST \
  "http://127.0.0.1:${ops_port}/operation/process-account-deletions")"
curl_status=$?
set -e
rm -f "$ops_auth"
if [[ "$curl_status" -eq 0 && "$http_code" == "200" && -s "$ops_body" ]]; then
  append_stamped_body 'account_deletion'
else
  case "$http_code" in
    ''|*[!0-9]*) http_code=0 ;;
  esac
  http_code=$((10#$http_code))
  error_code='ops_request_failed'
  if [[ "$http_code" -eq 401 ]]; then
    error_code='ops_unauthorized'
  fi
  append_json "$(printf '{"success":false,"error":"%s","at":"%s","httpStatus":%s,"curlStatus":%s}' \
    "$error_code" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$http_code" "$curl_status")"
  exit 1
fi
