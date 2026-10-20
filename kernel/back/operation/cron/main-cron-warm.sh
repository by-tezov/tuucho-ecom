#!/usr/bin/env bash
# =============================================================================
# Production cron: keep-warm pings, liveness check, outage alert and restore
# =============================================================================
#
#   >>> PERIOD: EVERY MINUTE, PINGING EVERY 5 SECONDS <<<
#       cron expression: * * * * * (server time)
#
# Flag:     ENABLED_CRON_WARM
# Log:      PRIVATE_LOG_CRON_WARM_FILE (inside PRIVATE_DIR): one healthz_timing
#           line per run (~1,440 a day), plus the failure path
# Pref:     cronWarmLogEnabled (remote log read/clear only)
# State:    $PRIVATE_DIR/warm-outage/ (run.lock + per-outage alert markers)
#
# What it does:
#   - GETs {URL_API_BASE}/healthz without auth, through the real path (edge,
#     Apache, Passenger, Node). No database access. Happy path writes one timing line.
#   - After a healthy first probe, keeps pinging every 5s until ~54s into
#     the run, so the next run takes over without hitting the lock. Passenger
#     on LWS reaps an idle app after a few seconds (measured 2026-10-06):
#     pings 10s apart lost the process, 5s apart kept it alive.
#   - Unlike the other crons, it never starts opsServer.js and never calls
#     /operation/*: booting a second Node process every minute would cost
#     more than it saves.
#
# Failure path (a flock skips the run if the previous one is still going):
#   1. Retries /healthz 5 times about 24s apart (~2 minutes).
#   2. If all fail: logs healthz_failed and sends a website_down owner spy via
#      warmOutageSpy.js (SMTP one-shot, bypasses Passenger), once per outage.
#   3. Ensures 'PassengerEnabled on' in ~/public_html/api/.htaccess, runs
#      cloudlinux-selector restart on private_html/prod/current, then polls
#      /healthz for up to 120s.
#   4. Still down: sends a website_restore_failed spy once per outage and
#      exits 1. Later ticks keep probing and restoring without re-alerting.
#   5. The first healthy /healthz clears the markers so the next outage can
#      alert again. There is no "recovered" mail.
#
# Install: `deploy --prod` copies this file to ~/bin/main-cron-warm.sh,
# substitutes the active release path below, and adds the crontab entry
# on every production deploy.
# Preproduction never installs it.
#
# Manual run: ssh lws_shop_example '$HOME/bin/main-cron-warm.sh'
# Reference:  docs/cron/README.md (Keep-warm cron)
# =============================================================================
set -euo pipefail

release_dir='__TUCHO_RELEASE_DIR__'
if [[ ! -d "$release_dir/config" ]]; then
  printf 'Keep-warm release path was not installed.\n' >&2
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
cron_log_file="$(read_release paths.logs.cronWarm)"
api_base_url="$(read_release http.apiBaseUrl)"

: "${private_dir:?paths.privateDir is missing from kernel JSON}"
: "${cron_log_file:?paths.logs.cronWarm is missing from kernel JSON/plugin settings}"
: "${api_base_url:?http.apiBaseUrl is missing from kernel JSON}"

cron_log_relative="${cron_log_file#/}"
if [[ -z "$cron_log_relative" || "$cron_log_relative" == *'..'* ]]; then
  printf '%s must stay within PRIVATE_DIR.\n' 'paths.logs.cronWarm' >&2
  exit 1
fi
cron_log_path="${private_dir%/}/$cron_log_relative"
state_dir="${private_dir%/}/warm-outage"
mkdir -p "$(dirname "$cron_log_path")" "$state_dir"

# Non-blocking lock: a slow restore+poll must not overlap the next tick.
exec 9>"$state_dir/run.lock"
if ! flock -n 9; then
  exit 0
fi

healthz_url="${api_base_url%/}/healthz"
PROBE_ATTEMPTS=5
# After the first success, ping every KEEPALIVE_GAP_SEC until the run has
# lasted KEEPALIVE_UNTIL_SEC, so the next run (one minute after this one
# started) takes over without hitting the lock and skipping.
KEEPALIVE_GAP_SEC=5
KEEPALIVE_UNTIL_SEC=54
PROBE_GAP_SEC=24
CURL_MAX_TIME=30
RESTART_POLL_TIMEOUT_SEC=120
RESTART_POLL_INTERVAL_SEC=2
APP_ROOT='private_html/prod/current'
HTACCESS_PATH="${HOME}/public_html/api/.htaccess"

last_http_code='0'
last_curl_status='0'
# curl's total time of the last probe, in seconds ("0" when it never ran).
last_time_sec='0'

append_json() {
  mkdir -p "$(dirname "$cron_log_path")"
  printf '%s\n' "$1" >>"$cron_log_path"
}

clear_inhibit() {
  rm -f "$state_dir/down_alerted" "$state_dir/restore_failed_alerted"
}

probe_once() {
  set +e
  local out
  out="$(/usr/bin/curl --silent --output /dev/null --write-out '%{http_code} %{time_total}' \
    --max-time "$CURL_MAX_TIME" "$healthz_url" 2>/dev/null)"
  last_curl_status=$?
  set -e
  last_http_code="${out%% *}"
  last_time_sec="${out##* }"
  [[ "$last_time_sec" =~ ^[0-9]+(\.[0-9]+)?$ ]] || last_time_sec='0'
  if [[ "$last_curl_status" -eq 0 && "$last_http_code" == "200" ]]; then
    return 0
  fi
  return 1
}

probe_with_retries() {
  local attempt
  for ((attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++)); do
    if probe_once; then
      return 0
    fi
    if ((attempt < PROBE_ATTEMPTS)); then
      sleep "$PROBE_GAP_SEC"
    fi
  done
  return 1
}

ensure_passenger_enabled() {
  local htaccess="$HTACCESS_PATH"
  if [[ ! -f "$htaccess" ]]; then
    printf 'Passenger .htaccess missing: %s\n' "$htaccess" >&2
    return 1
  fi
  if ! grep -qE '^[[:space:]]*PassengerEnabled[[:space:]]+on[[:space:]]*$' "$htaccess"; then
    printf '%s\n' 'PassengerEnabled on' >>"$htaccess"
  fi
  chmod 644 "$htaccess" || true
}

restart_passenger() {
  ensure_passenger_enabled
  cloudlinux-selector restart --interpreter nodejs --app-root "$APP_ROOT" --json >/dev/null
}

poll_until_healthy() {
  local deadline=$((SECONDS + RESTART_POLL_TIMEOUT_SEC))
  while ((SECONDS < deadline)); do
    if probe_once; then
      return 0
    fi
    sleep "$RESTART_POLL_INTERVAL_SEC"
  done
  return 1
}

find_node_runtime() {
  local candidate
  for candidate in "$HOME"/nodevenv/private_html/prod/current/*/bin/node; do
    if [[ -x "$candidate" ]]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

send_spy() {
  local kind="$1"
  local note="${2:-}"
  local node_runtime spy_js
  node_runtime="$(find_node_runtime)" || {
    append_json '{"success":false,"error":"node_runtime_missing","phase":"spy"}'
    return 1
  }
  spy_js="$release_dir/warmOutageSpy.js"
  if [[ ! -f "$spy_js" ]]; then
    append_json '{"success":false,"error":"warm_outage_spy_missing","phase":"spy"}'
    return 1
  fi
  set +e
  APP_TARGET=prod "$node_runtime" "$spy_js" \
    --kind "$kind" \
    --url "$healthz_url" \
    --http-status "$last_http_code" \
    --curl-status "$last_curl_status" \
    ${note:+--note "$note"}
  local status=$?
  set -e
  return "$status"
}

if probe_with_retries; then
  clear_inhibit
  # One timing line per run: the first response is the one a cold start
  # shows up in (~1-4s against ~0.1s warm); the slowest ping catches a
  # process reaped mid-run. One line per minute, not one per ping.
  first_sec="$last_time_sec"
  max_sec="$last_time_sec"
  pings=1
  # A failed keep-alive ping is left to the next run, which retries and
  # takes the failure path itself.
  while ((SECONDS + KEEPALIVE_GAP_SEC <= KEEPALIVE_UNTIL_SEC)); do
    sleep "$KEEPALIVE_GAP_SEC"
    probe_once || break
    pings=$((pings + 1))
    if awk -v a="$last_time_sec" -v b="$max_sec" 'BEGIN { exit !(a > b) }'; then
      max_sec="$last_time_sec"
    fi
  done
  append_json "$(printf '{"success":true,"event":"healthz_timing","at":"%s","firstSec":%s,"maxSec":%s,"pings":%s}' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$first_sec" "$max_sec" "$pings")"
  exit 0
fi

append_json "$(printf '{"success":false,"error":"healthz_failed","at":"%s","url":"%s","httpStatus":%s,"curlStatus":%s,"lastSec":%s,"attempts":%s}' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$healthz_url" "${last_http_code:-0}" "${last_curl_status:-0}" "$last_time_sec" "$PROBE_ATTEMPTS")"

if [[ ! -f "$state_dir/down_alerted" ]]; then
  if send_spy website_down "Échec après ${PROBE_ATTEMPTS} tentatives sur environ 2 minutes."; then
    : >"$state_dir/down_alerted"
    append_json '{"success":true,"event":"spy_website_down_sent"}'
  else
    append_json '{"success":false,"error":"spy_website_down_failed"}'
  fi
else
  append_json '{"success":true,"event":"spy_website_down_skipped"}'
fi

set +e
restart_passenger
restart_status=$?
set -e
if [[ "$restart_status" -ne 0 ]]; then
  append_json "{\"success\":false,\"error\":\"passenger_restart_failed\",\"status\":${restart_status}}"
else
  append_json '{"success":true,"event":"passenger_restart_requested"}'
fi

if poll_until_healthy; then
  clear_inhibit
  append_json '{"success":true,"event":"restored_after_restart"}'
  exit 0
fi

append_json "$(printf '{"success":false,"error":"still_unhealthy_after_restart","httpStatus":%s,"curlStatus":%s}' \
  "${last_http_code:-0}" "${last_curl_status:-0}")"

if [[ ! -f "$state_dir/restore_failed_alerted" ]]; then
  if send_spy website_restore_failed 'cloudlinux-selector restart exécuté; /healthz reste en échec.'; then
    : >"$state_dir/restore_failed_alerted"
    append_json '{"success":true,"event":"spy_website_restore_failed_sent"}'
  else
    append_json '{"success":false,"error":"spy_website_restore_failed_mail_failed"}'
  fi
else
  append_json '{"success":true,"event":"spy_website_restore_failed_skipped"}'
fi

exit 1
