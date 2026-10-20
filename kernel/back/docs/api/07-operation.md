# Operations

Loopback-only ops HTTP surface (`opsServer`) for `--ssh` / `--dev`. `--ftp`
reaches the same routes through the PHP gateway at `OPS_GATEWAY_URL`, which
authenticates with `OPS_TOKEN` then proxies `/operation/*` to that loopback
server (forwarding the Bearer header). Local CLIs start `opsServer` on
`127.0.0.1`; `--ssh` opens a short-lived SSH port forward. In every case,
`/operation/*` on the loopback server requires
`Authorization: Bearer <OPS_TOKEN>` (`/healthz` is the only open probe).
Ops CLIs never install the PHP gateway; without it, `--ftp` fails. Shell
access for deploys lives in that same PHP gateway on its own subdomain,
installed only by `npm run deploy` (`--ftp` deploy, or the standalone
`--ftp-ops` / `--ftp-ops-remove` commands; see
[command/README](../command/README.md#remote-transport)). The public API
never mounts `/ops-gateway` or `/operation/*`.

Every route under `/operation/*` is also rate-limited per IP via
`RATE_OPS` (`<window>:<count>`, default `60s:5` in
kernel `config/`; dev/preprod override a higher count). Only
**failed** (non-2xx) requests count (`skipSuccessfulRequests`), then `429`
until the window clears — not a hard lockout. A legitimate SSH-tunnelled
caller never trips it in normal use.

### Operator attribution headers (not authentication)

Ops CLIs may send these request headers so journal rows can name the
operator and host. They are **not** credentials: `Authorization: Bearer
<OPS_TOKEN>` remains the only auth gate.

| Header | Meaning |
| --- | --- |
| `x-pam-operator-user` | Local OS user (or `PAM_OPERATOR_USER`) |
| `x-pam-operator-host` | Hostname (or `PAM_OPERATOR_HOST`) |
| `x-pam-mode` | Target mode (`dev` / `preprod` / `prod`) |
| `x-pam-source-command` | Invoking CLI line (truncated) |

The ops server captures them into request ALS for
`recordOperatorActivityBestEffort` and for `POST /operation/activity`.

### `POST /operation/activity`

Best-effort append to the administration journal for operator bulk CLIs
and deploy finish. Body:

```json
{
  "category": "catalogue|orders|accounts|loyalty|gift|promotions|shipping|messaging|settings|operations|deploy",
  "action": "library.seed",
  "summary": "Import catalogue (library): aucun changement",
  "outcome": "success|failure",
  "targetType": "optional",
  "targetId": "optional",
  "targets": ["optional", "ids"],
  "detail": {}
}
```

`outcome` defaults to `success`. Attribution comes from the headers above
(or optional body fields). Response `201` `{ "success": true, "id": "..." }`.
A failed write must not undo the CLI action that posted it.

No `ALLOW_*` environment gate exists any more — see
[command safety gates](../command/00-safety.md). What actually gates this
surface:

- `OPS_TOKEN` on the loopback ops server and on the PHP gateway (when used),
  plus `--confirm` on `--prod` for every writing CLI command;
- the DB-backed admin preferences guarding log access — `apiLogEnabled`,
  `cronShipmentLogEnabled`, `cronAccountDeletionLogEnabled`,
  `cronGuestSavedCleanupLogEnabled`, `cronLoyaltyLogEnabled`, `cronGiftLogEnabled`,
  `cronGiftPurgeLogEnabled`, `cronPaymentAuthExpirySpyLogEnabled`,
  `cronWarmLogEnabled`. A route
  whose preference is off returns `403` with `{"success":false,"error":"string"}`;
- Production deploys always install the crontab entries. Plugin enable still
  gates gift/loyalty work. They never block a call at runtime.

### `GET /operation/log/api?lines=100`

The admin Journal page does not call this route. It uses `GET /admin/api-log`
and `POST /admin/api-log/clear`.

Returns up to 500 newest raw NDJSON diagnostic records. Writing is controlled by the admin preference
`apiLogEnabled` (seeded from `ENABLED_API_LOG`) in every target, including
production. Each record stores the request and the response body, bounded by
`API_LOG_BODY_MAX_BYTES`. This endpoint, and the admin journal read and clear,
are deliberately excluded from request logging so reading the tail cannot
recursively write the tail back into itself. Credentials, cookies, OTPs, secrets, and
payment/card identifiers are replaced with `[REDACTED]` everywhere. Production
also replaces personal data (email, phone, name, address, client IP).

### `GET /operation/log/email?lines=100`

The admin page uses `GET /admin/email-log`. `emailLogEnabled`, seeded from
`ENABLED_EMAIL_LOG`, gates writing and this read in every target, including
production. Up to 500 newest NDJSON lines. 404 while the preference is off.
Production anonymises personal data the same way as the API journal.
`POST /operation/log/email/clear` deletes the file and its rotations, with the
same gate.

### `GET /operation/log/cron-shipment?lines=100`

Admin preference `cronShipmentLogEnabled`. Returns up to 500 newest lines
from the private shipment-tracking cron log configured by
`PRIVATE_LOG_CRON_SHIPMENT_FILE`. Unlike API diagnostics, this endpoint is
available in production after the cron has run. Response:
`{"success":true,"data":{"lines":["...", "..."]}}`.

### `GET /operation/log/cron-account-deletion?lines=100`

Same shape as `cron-shipment`, gated by `cronAccountDeletionLogEnabled`,
path `PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE`.

### `GET /operation/log/cron-guest-saved-cleanup?lines=100`

Same shape as `cron-shipment`, gated by `cronGuestSavedCleanupLogEnabled`,
path `PRIVATE_LOG_CRON_GUEST_SAVED_CLEANUP_FILE`.

### `GET /operation/log/cron-loyalty?lines=100`

Same shape as `cron-shipment`, gated by `cronLoyaltyLogEnabled`,
path `PRIVATE_LOG_CRON_LOYALTY_FILE`.

### `GET /operation/log/cron-gift?lines=100`

Same shape as `cron-shipment`, gated by `cronGiftLogEnabled`,
path `PRIVATE_LOG_CRON_GIFT_FILE`.

### `GET /operation/log/cron-gift-purge?lines=100`

Same shape as `cron-shipment`, gated by `cronGiftPurgeLogEnabled`,
path `PRIVATE_LOG_CRON_GIFT_PURGE_FILE`.

### `GET /operation/log/cron-payment-auth-expiry?lines=100`

Same shape as `cron-shipment`, gated by `cronPaymentAuthExpirySpyLogEnabled`,
path `PRIVATE_LOG_CRON_PAYMENT_AUTH_EXPIRY_FILE`.

### `GET /operation/log/cron-warm?lines=100`

Same shape as `cron-shipment`, gated by `cronWarmLogEnabled`,
path `PRIVATE_LOG_CRON_WARM_FILE`. Failure-path only (happy keep-warm pings
write nothing).

### `POST /operation/log/api/clear`

Deletes the current API diagnostic log and every retained rotation generation, returning
`{ "clearedFiles": number }`. Available only while diagnostic logging is
enabled (dev/preprod); production returns `404`. This endpoint, like the read
endpoint, is excluded from diagnostic logging.

### `POST /operation/log/cron-shipment/clear`

Admin preference `cronShipmentLogEnabled`. Deletes the current
shipment-tracking cron log, returning `{ "clearedFiles": number }`. The next
cron run recreates the log file.

### `POST /operation/log/cron-account-deletion/clear`

Same as shipment, gated by `cronAccountDeletionLogEnabled`.

### `POST /operation/log/cron-guest-saved-cleanup/clear`

Same as shipment, gated by `cronGuestSavedCleanupLogEnabled`.

### `POST /operation/log/cron-loyalty/clear`

Same as shipment, gated by `cronLoyaltyLogEnabled`.

### `POST /operation/log/cron-gift/clear`

Same as shipment, gated by `cronGiftLogEnabled`.

### `POST /operation/log/cron-gift-purge/clear`

Same as shipment, gated by `cronGiftPurgeLogEnabled`.

### `POST /operation/log/cron-payment-auth-expiry/clear`

Same as shipment, gated by `cronPaymentAuthExpirySpyLogEnabled`.

### `POST /operation/log/cron-warm/clear`

Same as shipment, gated by `cronWarmLogEnabled`.

### `GET /operation/lock-probe?bytes=65536&nonce=…`

Returns `application/octet-stream` of exactly `bytes` length (clamped 64…2_000_000),
`Cache-Control: no-store`. No DB. Used by `npm run test -- lock --api` to
stress the API path independently of the front.

### `GET /operation/email-folder`

Dev and preprod only (production returns `404`). Reads whether outbound mail
is written under `DEV_DIR` instead of SMTP — this process's own current
`ROUTE_EMAIL_FOLDER` env var (`config.routeEmailFolder`), nothing else. There
is no DB override: what a process is doing is always exactly what it was
booted with.

Response: `{ "success": true, "data": { "enabled": true } }`.

### `PUT /operation/email-folder`

Preprod only (dev and production return `404`). Body
`{ "enabled": true | false }`. Sets the real `ROUTE_EMAIL_FOLDER` env var on
preprod's cPanel Node app via `cloudlinux-selector` and restarts it —
equivalent to an operator hand-editing the env var in cPanel, just scriptable
over `--ssh`/`--ftp`. Blocks for the few seconds the selector call and
restart take; the caller must then poll `/healthz` before relying on the
restarted app. Response includes `previousEnabled` so a caller can restore
it afterwards. This is what `npm run operation -- email-folder true|false
--preprod` calls. Never a public-API route.

### `GET /operation/email-folder/mails?kind=user|spy&to=&sinceMs=`

Dev and preprod only. Lists up to 40 newest folder HTML dumps (customer
`user` or owner `spy`), optionally filtered by `To` substring and `mtimeMs`.
Each item is `{ to, subject, html, mtimeMs }`. HTML larger than 200 KB is
skipped. Used by the preprod suite to read OTP and order-confirmation mail
over `--ftp`. Production returns `404`.

### `GET /operation/relax-rate-limits`

Dev and preprod only (production returns `404`). Reads whether HTTP rate
limiters are skipped. `enabled` is the effective value after
`app_preferences.relax_rate_limits` (missing key is false). `override` is
true when that preference row exists. Production never skips limiters, even
if the row is present.

Response: `{ "success": true, "data": { "enabled": true, "override": true } }`.

This does not change `AUTH_OTP_COOLDOWN` or other application send cooldowns.

### `PUT /operation/relax-rate-limits`

Body `{ "enabled": true | false }`. Upserts `app_preferences.relax_rate_limits`.
The public API picks the change up on the next `warmAppPreferences` (the
limiter `skip` path does that). Production returns `404`. Never a public-API
route.

### `DELETE /operation/relax-rate-limits`

Removes the preference row so the default (limiters on) applies again.
Production returns `404`.

### `POST /operation/database-migrate`

Runs any pending migrations (`node-pg-migrate`, tracked in its own
`pgmigrations` table; already-applied ones are skipped automatically).
Kernel schema is the single baseline `1738000000000_init` (the full current
schema plus its seeds, as a first deployment, including sealed
`plugins.secrets`). Plugin tables are not in that file. Later timestamped
files appear only when a new schema change lands after this reset. Fresh DBs
(or after `database-reset`) get that full current schema. `checkOrder` is off
so a database migrated before a squash, whose `pgmigrations` still lists
deleted intermediate names, does not block. Such a database does not receive
changes folded into `1738000000000_init` after it was applied: wipe it with
`database-reset` then migrate. This shop is the source of the baseline and
already has `1738000000000_init` in `pgmigrations`, so migrate skips it. The running app's `db/migrations/` directory must match the repo
(build wipes `dist/v<version>/` before copy). Stale pre-squash files left on
the server after a merge-deploy will be picked up by node-pg-migrate and can
fail (duplicate column/table).

Response `200`:
`{"success":true,"applied":["migration_name", "..."],"guestEmailLookupsBackfilled":number,"contactEmailLookupsBackfilled":number,"identityEventsBackfilled":number}`

After the migrations run, the handler backfills `orders.guest_email_lookup`
for any guest order that predates `1787380000001`. That column is an HMAC of
the plaintext address, so it cannot be computed in SQL (no pgcrypto on LWS) —
doing it here keeps "apply the schema" one deploy step. It is a no-op once
every guest order has one.

It likewise backfills `unconnected_contacts.email_lookup`, introduced for the
browser admin customer's exact-email anonymous-contact history. Contact
emails are encrypted, so this HMAC cannot be derived in SQL on LWS either;
the counter is zero once every existing contact has one.

It also seeds `user_identity_events` for accounts that predate that table:
one `account_created` per user (dated `users.created_at`) and one linked
event per currently attached Google/Facebook/Apple provider. Idempotent —
users that already have any history row are skipped. Pre-migration email
changes are not reconstructible.
(empty array if nothing was pending) or `500`
`{"success":false,"error":"string"}` with the Postgres/node-pg-migrate message.

### `POST /operation/database-reset`

Empties the `public` schema so the next `database-migrate` can apply the
init and gift migrations from a clean slate. Prefers
`DROP SCHEMA public CASCADE` + recreate when the DB role owns `public`
(local Docker); on managed hosts (LWS preprod/prod) the app role typically
does **not** own `public`, so it falls back to dropping every table /
sequence / view / function in `public` instead — same end state, no schema
ownership required. Body must be `{"confirm":true}` (`400` if
missing/false). The CLI additionally requires `--confirm` when targeting
`--prod`.

Response `200`:
`{"success":true,"reset":true,"message":"public schema emptied — run database-migrate next"}`
or `400`/`403`/`500` with `{"success":false,"error":"string"}`.

Does **not** re-seed catalogue data — only what the init migration inserts
(countries, `user`/`admin` roles, `home` network, loyalty singleton,
`payment_method_countries`). Re-run library/courier/voucher imports
afterward.

The CLI shortcut
`npm run operation -- database-reset-and-seed --dev|--preprod|--prod`
orchestrates this endpoint, `/operation/database-migrate`, then the standard
aggregate seed. It is intentionally a CLI workflow rather than an additional
HTTP endpoint, so the existing reset confirmation and each existing import
route remain the only write boundaries.

### `POST /operation/database-backup`

Backs `npm run operation -- database-backup`. Snapshots the whole target into
one `.tar` under `PRIVATE_BACKUP_DIR`: every `public` table's rows, every
sequence position, the applied migration list (names + file checksums), and
every media tree — `PUBLIC_MEDIA_DIR`, `PRIVATE_INVOICE_DIR`,
`PRIVATE_SHIPMENT_LABEL_DIR`, `PRIVATE_MEDIA_CONTACT_DIR`,
`PRIVATE_MEDIA_CHAT_DIR`. Media is never optional: rows hold relative paths.

There is no schema dump — `src/db/migrations/` reproduces the schema — so no
`pg_dump` binary is needed on the host. Rows are read inside one
`repeatable read` snapshot, so the archive is internally consistent and the
shop keeps serving while it runs.

Optional body `{"keep":3}` (default `3`): rotation runs straight after the
archive is written, deleting all but the newest `keep`.

Response `200`:
`{"success":true,"backup":{"id","path","pathFromHome","bytes","manifest"},"pruned":["id",…]}`.

### `GET /operation/database-backup`

Lists the archives held on the target, newest first, each with its manifest.
Also returns `directory` (`path` + `pathFromHome`), which is what lets the CLI
push a local archive back up without knowing the target's `PRIVATE_DIR`
layout. `pathFromHome` is the account-home-relative path an FTP or scp client
needs; `null` when the directory sits outside the account home
(`os.homedir()` — not only `$HOME`, which Apache leaves unset on the FTP
ops gateway).

### `GET /operation/database-backup/:id/verify?from=<mode>`

Read-only. Reads the archive's own manifest and runs the version gate against
the running release without touching the database. Backs
`database-backup-verify` and `database-restore --dry-run`.

Response `200`: `{"success":true,"entries":number,"manifest":{…},"verdict":{…}}`,
where `verdict` is either `{"ok":true,"rollForward":["migration",…],"warnings":[…]}`
or `{"ok":false,"reason":"string"}`. `404` when the archive is missing or
unreadable.

### `POST /operation/database-restore`

Backs `npm run operation -- database-restore`. Body
`{"id":"…","confirm":true,"from":"prod"?,"bypassPreflight":true?}` — `confirm`
must be `true` on every target (`400` otherwise), exactly like
`database-reset`; the CLI additionally requires `--confirm` when targeting
`--prod`.

Runs the whole restore with nothing to prepare beforehand and nothing to run
afterwards: version gate, `public` emptied, migrated to exactly the archive's
head, rows and sequences loaded, migrated forward to the running release,
media trees mirrored. Foreign keys are dropped for the load and recreated at
the end, which revalidates every row; user triggers are disabled meanwhile so
the schema's own guard triggers cannot reject rows they already accepted.

The version gate is the normal refusal path. The archive's migration list —
names **and** file checksums — must be a prefix of this release's: equal
restores as-is, older restores then migrates forward, newer is refused (no
down migrations exist), and a divergent name or checksum is refused with no
override. An archive from another target needs `from`.
`PII_ENCRYPTION_KEY` / `PII_LOOKUP_PEPPER` that differ from the archive are
refused **outright**, including when `bypassPreflight` is set — wrong keys
make sign-in and every encrypted column unusable while row counts still look
fine. A differing app version is a warning, never a refusal — the migration
head is the contract.

`bypassPreflight: true` skips the **schema/mode** gate only. The would-be
refusal is recorded as a warning; the empty DB is migrated to **this
release's full head**, then the archive rows are loaded into that schema.
Intended for operator-owned cases such as restoring after squashing
migrations into a single init. PII compatibility is still enforced.

Response `200`:
`{"success":true,"report":{"id","tables":[{"name","rows"}],"rolledForward":["migration",…],"media":{"restored","bytes"},"warnings":[…]}}`.
`409` with `{"success":false,"error":"string"}` when the version gate refuses
(and `bypassPreflight` was not set).

### `POST /operation/database-backup/prune`

Body `{"keep":3}`. Deletes all but the newest `keep` archives. Response
`{"success":true,"pruned":["id",…]}`.

### `POST /operation/process-account-deletions`

Meant to be hit by an external cron (daily, say) — no in-process scheduler
on this LWS plan, same reasoning as `database-migrate`. Idempotent: sends
each pending-deletion reminder at most once
(`DELETION_REMINDER_DAYS_BEFORE` out from `deletion_scheduled_for`) and only
hard-deletes accounts already past their own `deletion_scheduled_for`. Safe
to call as often as the cron likes. Response `200`:
`{"success":true,"remindersSent":number,"deleted":number,"failed":number,"orphanedOrders":number}`.
When the admin log preference is off, the JSON is `{ "success": true }` only.

Each account is deleted in **its own transaction**, so one failure leaves that
account due for the next run instead of aborting the batch (`failed` counts
them). Before the row goes, the account's orders are detached and marked
`owner_deleted_at` — `orphanedOrders` counts those. Orders are never deleted:
they carry invoice data that must be retained, and they snapshot who ordered
(`customer_email`, `customer_first_name`, `customer_last_name`) at insert, so
an orphan remains a complete record. An orphaned order is **permanently**
unclaimable — it has no `guest_email`, so registering a new account at the same
address will never be offered it. See
[schema: pricing/cart/orders](../schema/03-pricing-cart-orders.md).

### `POST /operation/process-one-time-cards`

Same cron pattern as `process-account-deletions`. Detaches Stripe payment
methods for `customer_card_retention` rows with `purpose = one_time` whose
`delete_after` is past, then deletes those rows. Retention length is
`ONE_TIME_CARD_RETENTION_DAYS` (public env), anchored at order `received`
(or `cancelled` when the order never reaches received). Response `200`:
`{"success":true,"deleted":number}`. There is no production crontab for this
endpoint yet.

### `POST /operation/process-guest-saved-cleanup`

Deletes unclaimed `guest_saved_addresses` / `guest_saved_cards` past
`delete_after`, detaches the PaymentMethod, and deletes the pending Stripe
customer. Idempotent. Response `200`:
`{"success":true,"addresses":number,"cards":number}` (or `{ "success": true }`
when the admin log preference is off).

### `POST /operation/loyalty-expire`

Releases expired loyalty checkout holds, then materializes wallet lot expiry
for active lots past `expires_at` (calendar cut-offs every N months from
1 March Europe/Paris, where N is `lot_duration_months`). Runs in a
transaction; idempotent. Response `200`:
`{"success":true,"expiredTotal":number,"holdsReleased":number}`.

### `POST /operation/loyalty-remind`

Reminds customers with credit inside the burn-notice window before lot expiry
(`burn_notice_weeks` before `expires_at`). Respects `reminder_interval_days` between sends for
each user/settlement pair (`user_preference`
`loyalty_expiry_reminder.{YYYY-MM-DD}` stores last-sent ISO timestamp).
Response `200`: `{"success":true,"remindersSent":number}`.

### `POST /operation/process-loyalty`

Production loyalty cron entrypoint (see [cron](../cron/README.md)). Runs
`loyalty-expire` (hold release + lot expiry) then `loyalty-remind`.
Response `200`:
`{"success":true,"expiredTotal":number,"holdsReleased":number,"remindersSent":number}`
(or `{ "success": true }` when `cronLoyaltyLogEnabled` is off).

### `POST /operation/process-gift`

Production gift cron entrypoint (see [cron](../cron/README.md)). Expires
`selecting` offers past `offer_expires_at`, releases expired
`purpose='gift'` stock holds (the offer stays payable until pay-by),
cancels unpaid `awaiting_payment`/`paying` offers past `pay_by_at` when no
PaymentIntent is linked, and sends idempotent hold/pay reminders. **Never**
captures or refunds Stripe. Response `200`:
`{"success":true,"expired":number,"holdsReleased":number,"cancelled":number,"remindersSent":number}`
(or `{ "success": true }` when `cronGiftLogEnabled` is off).

### `POST /operation/process-gift-purge`

Production gift-purge cron entrypoint (see [cron](../cron/README.md)).
Hard-deletes `cancelled` / `expired` gift offers (never `ordered`) whose
`created_at` is past `GIFT_PURGE_AFTER_DAYS` (default
396 days, ~13 months). Removes the giver's email/name/comment and the
receiver's name/destination; cascades to items, destination, lock/pin
sessions, and reminder-send rows, and drops any leftover gift cart first.
Idempotent. Response `200`: `{"success":true,"purged":number}` (or
`{ "success": true }` when `cronGiftPurgeLogEnabled` is off).

### `POST /operation/process-payment-auth-expiry-spy`

Production payment-auth-expiry-spy cron entrypoint (see
[cron](../cron/README.md)). Mails the owner once per order,
`PAYMENT_AUTH_EXPIRY_SPY_BEFORE` (currently `2d`) ahead of a still-
`authorized` order's authorization hold's **estimated** expiry
(`confirmed_at` plus an assumed card/PayPal hold window; Stripe exposes no
exact one for manual capture). **Never** captures, cancels, or refunds
Stripe. Idempotent via `payment_auth_expiry_spy_sends`. Response `200`:
`{"success":true,"notified":number}` (or `{ "success": true }` when
`cronPaymentAuthExpirySpyLogEnabled` is off).

## Loyalty programme numbers

Mounted at `/operation/loyalty` (`src/api/loyaltyOps.routes.ts`). Read-only.
The programme is always on. Numbers come from the running process
kernel `config/`. CLI: `npm run loyalty -- check`.

#### `GET /operation/loyalty`

```json
{
  "success": true,
  "loyalty": {
    "valuePer100": 10,
    "lotDurationMonths": 6,
    "burnNoticeWeeks": 6,
    "reminderIntervalDays": 7
  }
}
```

## Gift programme numbers

Mounted at `/operation/gift` (`src/api/giftOps.routes.ts`). Read-only.
`npm run gift -- check` prints the ceilings. New offers are always accepted.
`enabled` in the JSON is always `true`.

#### `GET /operation/gift`

```json
{
  "success": true,
  "settings": {
    "enabled": true,
    "receiverTokenTtlDays": 30,
    "lockSessionTtlHours": 2,
    "stockHoldTtlDays": 7,
    "giverPayTtlDays": 30,
    "visibilityAfterTerminalDays": 7,
    "maxBudgetCeiling": 500,
    "maxAccessoryBudgetCeiling": 100,
    "maxOpenPromisesPerGiver": 20,
    "pinFreeFailures": 5,
    "pinMaxFailures": 10
  }
}
```

### `POST /operation/process-shipment-tracking`

External-cron entrypoint for Mondial Relay shipments; see [cron](../cron/README.md). Requires
`ENABLED_CRON_SHIPMENT=true`. It selects only `to_send`, `sent`,
or `disponible` orders with a Mondial Relay shipment number whose tracking
cache is at least four hours old (maximum 25 SOAP fetches per run), fetches the official
WSI2 tracing in French, and caches the events. In-flight orders whose cache is
still fresh are not re-fetched, but those cached events still advance status —
opening `GET /account/orders/:id/tracking` or `GET /admin/orders/:id/tracking`
uses the same milestone walk, so a locker/delivery event stored from a tracking
view is not ignored until the next SOAP poll. A labelled `to_send` order
advances to `sent` only when SOAP includes `PRISE EN CHARGE POINT RELAIS`
(drop-off); a successful lookup alone does not. Carrier-confirmed milestones
advance the order forward only: `Disponible au Point Relais`,
`Colis disponible au point de retrait`, or locker availability
(`… retirer le colis en Locker`) sets a Point Relais/locker order to
`disponible`; `Livré`, `Colis livré au destinataire`, or WSI2 STAT `82`
sets a home-delivery order to
`received`, or advances a Point Relais order through `disponible` then
`received`. High-confidence unclaimed, refused, or return-to-sender labels
instead move a shipped order to `return_review` and create an idempotent
human-review case with the matched carrier evidence. They never cancel,
refund, restock, or send a final customer email. Transit, incident, unknown
labels, configuration errors, and individual carrier failures do not alter
the order status. The four-hour
cache gate protects the carrier's 4–6 calls/day/shipment limit even when the
cron is misconfigured to run more often. Response `200`:
`{"success":true,"tracking":{"skipped":boolean,"reason"?:"tracking_not_configured"|"mondial_relay_not_configured","candidates":number,"fetched":number,"webserviceCalls":[{"shipmentNumber":string,"url":string,"request":string,"responseStatus":number|null,"response":string|null,"error"?:string}],"sentMarked":number,"availableMarked":number,"receivedMarked":number,"returnReviewMarked":number,"failed":number}}`. The Mondial Relay SOAP request/response is included for each HTTP response; a timeout/network failure has null response fields and an error message. The request's `Security` signature is always redacted. Empty WSI2 `Tracing` padding rows are omitted from the logged response.

### Accounts

Backs `npm run user -- <command>` (see README) — there's no admin backoffice,
so this is the only way to browse the user base or lock/unlock an account.
Also backs `npm run faker -- account … --verified` via
`POST /operation/accounts/:idOrEmail/verify-email`.

#### `GET /operation/users`

Query params: `offset` (default 0), `limit` (optional, max 2000 — omitted
means no limit, every matching row is returned), `sort` (`last-connected`
default, `most-connected`, `least-connected`, or `order-value`),
`locked=true`, `withOrders=true`, `neverOrdered=true` (`withOrders`/
`neverOrdered` are mutually exclusive — `400 invalid_request` if both are
set), `search` (case-insensitive substring match on email), `ip` (exact
match against any of the account's `refresh_tokens.created_by_ip` values),
`createdAfter`/`createdBefore`/`lastConnectedAfter`/`lastConnectedBefore`
(ISO date strings, inclusive bounds on `created_at`/`last_connected_at`
respectively). Order aggregates (`orderCount`/`orderValueSum`) exclude
cancelled orders. See `npm run user -- list`'s own `--from`/`--to`
day-count/date-vs-index handling in [command](../command/README.md) — this endpoint itself only
ever sees plain `after`/`before` bounds, the CLI does that translation.

```json
{
  "success": true,
  "total": 42,
  "users": [
    {
      "id": "uuid",
      "email": "string",
      "firstName": null,
      "lastName": null,
      "status": "active",
      "role": "user",
      "emailVerified": true,
      "createdAt": "...",
      "lastConnectedAt": "...",
      "connectionCount": 12,
      "orderCount": 3,
      "orderValueSum": 87.5
    }
  ]
}
```

`connectionCount`/`lastConnectedAt` count both a manual login and a silent
session refresh — see `token.service.ts`'s `recordConnection`.

#### `POST /operation/accounts/:idOrEmail/lock`

Optional body: `{"reason":"string"}` — trimmed, 3–500 characters when
present. When omitted, stores the default operator message with
`lock_source = ops`. `:idOrEmail` accepts either a user id (uuid) or an email
address. Operator-initiated equivalent of the customer's own "this wasn't me"
email link (see `accountSecurityLock.service.ts`) — locks the account,
persists lock metadata, and revokes every active session.
`400 invalid_request` when a provided reason is invalid.
`404 not_found` if no matching account.

#### `POST /operation/accounts/:idOrEmail/unlock`

No body. Reverses either lock path above. `404 not_found` / `409 not_locked`.

#### `PUT /operation/accounts/:idOrEmail/role`

Backs `npm run user -- set-role <id-or-email> <role-code>`. Body:
`{"role":"<code>"}`, any existing `roles.code` (e.g. `super-admin`, `preparator`). The account then holds
exactly that one role (`user` clears every staff role, making it a
customer); several roles at once are assigned from the administration Users
page (`PUT /admin/users/:id/roles`). An unknown code is
`400 invalid_request`. Journaled as `account.set_role`.

#### `POST /operation/accounts/:idOrEmail/verify-email`

No body. Marks the account's current email verified without the
confirmation-email round trip (idempotent). Backs
`npm run faker -- account … --verified`. `404 not_found`.

#### `DELETE /operation/accounts/:idOrEmail`

Immediate hard-delete — backs `npm run user -- delete`. Skips the customer
grace period; works for any account status. Optional JSON body
`{"deleteOrders":true}`: permanently removes the account's orders (same DB
cleanup as `DELETE /operation/orders/:orderNumber` for each) instead of
orphaning them. Without that flag, orders are detached with
`owner_deleted_at` like `process-account-deletions`. Loyalty ledger rows for
the user are removed before the `users` delete (the FK cannot SET NULL).
Stripe customer delete is best-effort after the DB commit and never fails the
request. `404 not_found`. Response `200`:
`{"success":true,"userId","email","orphanedOrders","deletedOrders","orderNumbers"}`.

### Library import

Backs `npm run library -- <command>` (see README) — lets that CLI push
[catalog source](../../catalog import tree)'s library into any environment's DB
without a direct DB/filesystem connection (none is possible against
preprod/prod: no SSH on this LWS plan). JSON in/out except the photos
route.

#### `POST /operation/library-import/vocabulary`

Body:

```
{
  "shapes": {
    "almond": {
      "title": {"fr": "...", "en": "...", ...},
      "gender": {"fr": "f", "en": "", ...},
      "length": { "medium": { "value": "16", "title": {"fr": "...", ...}, "gender": {"fr": "m", ...} } }
    }
  },
  "colors": {"white": {"fr": "...", ...}},
  "variations": {
    "color": { "title": {"fr": "...", ...}, "options": [{ "key": "pink", "title": {"fr": "...", ...} }] }
  },
  "deleteMissing": false
}
```

`variations` is optional and only touched when present: it upserts
`variation_axes` / `variation_options` (option order = `sort_order`), and with
`deleteMissing` removes axes, and options of a listed axis, that are no longer
named. `npm run library-nail` sends it alone (empty `shapes`/`colors`,
`deleteMissing: false`) from catalog source's layered vocabulary, with
`$table.key` references already resolved. The response adds `variationAxes`,
`variationOptions` and `deletedVariations`.

Upserts each shape into `shapes` (label from its `title`, gender from its
`gender`) and each of its lengths into `shape_lengths` (same two fields);
lengths a shape no longer declares are deleted. `gender` is optional and
per language, one of `m`/`f`/`n`/`c` or `""` when the language does not mark
gender on that word; it is what lets a set's authored copy write `$shape`
instead of a literal shape word and still agree (see
`docs/api/06-gallery.md`). A non-string entry is dropped rather than
rejecting the shape: a missing gender only costs the unmarked variant. Colors upsert into `colors`
unchanged. A shape whose `title` isn't a valid trilingual is dropped whole;
a single malformed length is dropped on its own so one typo can't lose the
shape. `deleteMissing` defaults to false. When true, both maps must be
complete and valid; DB vocabulary entries absent from them are deleted after
a full set synchronization. Response `200`:
`{"success":true,"shapes":number,"colors":number,"deletedShapes":["key",...],"deletedColors":["key",...]}`.

#### `GET /operation/library-import/vocabulary`

No body. Raw, unlocalized shapes/colors vocabulary for `library --direction
local`, in the same nested form the POST accepts. Response `200`:
`{"success":true,"shapes":{"key":{"title":{"fr":"string",...},"gender":{"fr":"f",...},"length":{"medium":{"value":"string","title":{...},"gender":{...}}}}},"colors":{...}}`.

#### `POST /operation/library-import/accessory-vocabulary`

Body:

```
{
  "quantities": { "x5": {"fr": "×5", "en": "×5", ...}, "x10": {"fr": "×10", ...} },
  "deleteMissing": false
}
```

Upserts each pack-quantity label into `accessory_quantities` (same storage
shape as `colors`: `key` + `PartialTrilingual` `label`, no nested `title`).
Driven by `accessory -- seed` reading `product/accessory/data-common.json`
`quantity`. `deleteMissing` defaults to false. When true, the map must be
complete and valid; DB keys absent from it are deleted. Response `200`:
`{"success":true,"quantities":number,"deletedQuantities":["key",...]}`.

#### `GET /operation/library-import/accessory-vocabulary`

No body. Raw, unlocalized quantity vocabulary for `accessory --direction
local` / `check`, in the same form the POST accepts. Response `200`:
`{"success":true,"quantities":{"x5":{"fr":"×5",...}}}`.

#### `DELETE /operation/library-import/shapes/:key`

No body. Deletes one shape vocabulary key. It cascades to its
`shape_lengths` rows, its live `product_shapes`/`product_shape_lengths`
associations, and their variant-scoped dependent rows
(photos, availability, favorites, and cart). The gallery set and
historical orders remain. `404` if absent. Response `200`:
`{"success":true,"deleted":true}`.

#### `DELETE /operation/library-import/colors/:key`

No body. Deletes one color vocabulary key and cascades to live
`product_colors` associations. `404` if absent. Response `200`:
`{"success":true,"deleted":true}`.

#### `POST /operation/library-import/sets`

Body:

```
{
  "productUid": "string",
  "productType": "nail" | "accessory",
  "audience": "public" | "user-library",
  "users": ["account UUID or email", "..."],
  "title": {"fr": "string", ...}, "desc": {...}, "occasion": {...} | null,
  "shapeKeys": ["string"],
  "shapeLengths": {"shapeKey": ["lengthKey", ...]},
  "colorMainKeys": ["string"], "colorSecondaryKeys": ["string"],
  "hidden": boolean,
  "hiddenShapeLengths": [{"shapeKey": "string", "lengthKey": "string"}],
  "featuredFrom": "YYYY-MM-DD" | null, "featuredFor": number | null,
  "creationDate": "YYYY-MM-DD" | null,
  "price": number,
  "availability": object | number,
  "accessoryType": "default" | "byQuantity",
  "accessoryPacks": { "x5": 5, "x10": 10 },
  "accessoryPackPrices": { "x5": 2, "x10": 3 },
  "inCartCarousel": boolean,
  "update": boolean
}
```

`productType` defaults to `nail`. For nails, `productUid`/`title.fr`/
`desc.fr`/`occasion.fr` and at least one shape key are required (`400`
otherwise). For accessories, only `productUid`/`title.fr`/`desc.fr` are
required — occasion may be null, shapes/colors are empty, and
`availability` is a scalar quantity stored at `shape_key=''` /
`length_key=''` / `size=''` (`available.max` for `byQuantity`). For nails, `availability` is nested
shape → length → size → quantity, and `shapeLengths` names which lengths of
each offered shape the set is sold in (a shape absent from it, or with no
valid lengths, falls back to the single implicit `medium` length).
`accessoryType` defaults to `default`. `byQuantity` requires `accessoryPacks`
(at least one pack multiplier) and optional `accessoryPackPrices` (keys must
match the packs exactly; omit or `{}` to derive pack price from unit `price`
× multiplier). Invalid byQuantity payloads are rejected (`400`), never imported
as stock 0.
`inCartCarousel` defaults to false (nails are always false). When true on an
accessory, `GET /gallery/cart-accessories` includes it.
`creationDate` defaults to today (server-side) if omitted or malformed.
`audience` defaults to `public`. `user-library` is nail-only; its `users`
array is resolved to account IDs during import. Omit or leave it empty to
retain the set while exposing it to nobody; an unknown non-empty identifier
returns `400` rather than silently losing an assignment.
`price` (optional, >= 0): on a brand-new set it's
applied on creation same as every other field (no prior state for `update`
to gate against); on an _existing_ set it follows the same `update` gate as
the rest of the fields — a plain `seed` with no `update:true` never
touches an existing set's price, even if the incoming `price` differs from
what's on file. When it is applied (existing set + `update:true`, or a new
set), a new `product_prices` row is only written if the value actually
differs from the latest one on file (see [schema](../schema/README.md)) — reflected in the
response's `priceUpdated` flag, kept separate from `updated` (metadata)
since a price-only change does **not** wipe/re-require re-uploading photos
the way a metadata change does. **Idempotent by `productUid`**:

- no existing set with that `productUid` → created (price applied if given).
  Response `{"success":true,"created":true,"updated":false,"priceUpdated":boolean,"id":"uuid"}`.
- existing set, `update` not `true` → no-op, nothing touched at all
  (metadata _and_ price). Response
  `{"success":true,"created":false,"updated":false,"priceUpdated":false,"id":"uuid"}`.
- existing set, `update:true`, nothing actually differs — metadata
  (title/desc/occasion/shape/color keys+order/hidden/hidden shape-lengths/featured/creationDate)
  _and_ price both unchanged → same no-op response as above, **unless**
  `refreshPhotos: true` is set (the CLI sends it only when ordered photo
  counts/hashes differ): photo rows are wiped and `photosCleared: true` so
  the caller can re-upload.
- existing set, `update:true`, only `price` differs → price applied,
  metadata untouched (no photo wipe unless `refreshPhotos: true`). Response
  `{"success":true,"created":false,"updated":false,"priceUpdated":true,"id":"uuid"}`.
- existing set, `update:true`, metadata differs (price may or may not also
  differ) → updates the row **in place** (same id — not delete+recreate,
  since `GalleryItem.id` is `products.id` and is referenced by URLs).
  Photos remain intact unless `refreshPhotos:true`; `photosCleared` reports
  whether they were actually cleared. Response
  `{"success":true,"created":false,"updated":true,"photosCleared":boolean,"priceUpdated":boolean,"id":"uuid"}`.

Every set-import response also includes `changes: string[]`, listing each
field actually changed (`title`, `desc`, `occasion`, `shape`, `length`, color
roles, visibility/feature/date fields, `price`, `availability`) and
`photos-refreshed` when applicable. The CLI uses this for both its human table
and structured JSON report.

Single nails (`productType: "nail_single"`) may add `variationAxis` (axis
key), `variations` (`[{ "key": "pink", "price": number | null }]` in display
order, `price` overriding the product price for that option) and
`variationOff` (the data-static `variations` tree: option → `false`, or →
shape → `false`, or → length → `false`, or → size → `false`). Every option
must already exist in the axis vocabulary (`400` otherwise). The boolean
`availability` grid is then expanded to one boolean unit-offer row
per option, minus what `variationOff` switches off; `availabilityUpdated`
also reports a change of the option list.

Each `variations` entry may also carry the option's own product copy, since
each option is its own product: `title`, `desc`, `occasion` (required
together, French text required), optional `alt`, and `colorMainKeys` /
`colorSecondaryKeys`. They are stored on `product_variations` and as
`product_colors` rows keyed by the option; an entry without them reads the
product's copy. A change of any of them also reports `availabilityUpdated`.
`GET /operation/library-import/sets` returns the same fields per option.

#### `POST /operation/library-import/sets/batch`

Body: `{"sets":[<set body>, ...]}`, where every entry has the same shape and
semantics as `POST /operation/library-import/sets`. The server processes the
entries in order and returns one positionally aligned result per entry:
`{"success":true,"results":[<set response>, ...]}`. Full `library` and
`accessory` seeds use this endpoint so all product metadata crosses the HTTP
rate-limit boundary in one request. Photos remain on the bounded multipart
endpoint below because a whole photo library can exceed web-server
request-size limits.

#### `POST /operation/library-import/sets/:id/shapes/:shapeKey/lengths/:lengthKey/photos`

`multipart/form-data`, field name `photos` — up to 20 files per request,
25MB each. A different field name, more than 20 files, or a file over 25MB
returns `400` with `{ success: false, error: string }` instead of an
unhandled 500. Optional text field `hashes`: JSON array of SHA-256 hex strings
parallel to the uploaded files (from prepare-library's `data-generated.json`
`photos` map). When provided, each file's bytes must match or the upload
returns `400`. Each file is expected to already be at modal quality/size
(resizing happens before it reaches this backend, never here) — stored
as-is as the modal version. The grid `small` file is the same bytes
(loading sharp inside loopback `opsServer` on this host aborts the
process). `SMALL_PHOTO_SIZE` remains the manager-side prepare size.
The modal SHA-256 is stored as `product_photos.content_hash` and is also
embedded in the on-disk filenames (`<position>-<hash>.…`) so a later
re-upload of different bytes writes a new file instead of overwriting —
historical order snapshots that still point at the old path keep working.
Appended after whatever's already there for that set+shape+length.
Default accessories use the sentinel `-` for both `:shapeKey` and `:lengthKey`.

#### `POST /operation/library-import/sets/:id/shapes/:shapeKey/lengths/:lengthKey/variations/:variationKey/photos`

Same upload for one variation option of a single nail with variations
(catalog source `modal/<shape>/<length>/<variation>/`): rows get
`product_photos.variation_key`, positions count per option, and the files
are stored under `<set>/<shape>/<length>/<variation>/`.
`byQuantity` accessories upload once per pack:
`/sets/:id/shapes/<packKey>/lengths/-/photos` (`shape_key` = pack, `length_key` = `''`).
Response `200`: `{"success":true,"added":number}`.

Default accessories use `shape_key ''` in the DB; the URL path sentinel is `-`
(e.g. `/sets/:id/shapes/-/lengths/-/photos`).

#### `DELETE /operation/library-import/sets/:productUid`

No body. Deletes the set with that `product_uid` (cascades to its shapes/
colors/photos rows, photo files on disk left behind). `404` if no set has
that `product_uid`. Response `200`: `{"success":true,"deleted":true}`.

#### `GET /operation/library-import/sets`

Optional query `productType=nail|accessory` (default `nail`) and
`audience=public|user-library`. Returns every
matching product currently in the DB, for `library`/`accessory -- check`
to diff against the local source. Response `200`:

```
{
  "success": true,
  "sets": [
    {
      "id": "uuid", "productUid": "string", "productType": "nail"|"accessory",
      "title": {...}, "desc": {...}, "occasion": {...} | null,
      "shapeKeys": ["string"],
      "shapeLengths": {"shapeKey": ["lengthKey", ...]},
      "colorMainKeys": ["string"], "colorSecondaryKeys": ["string"],
      "hidden": boolean,
      "hiddenShapeLengths": [{"shapeKey": "string", "lengthKey": "string"}],
      "featuredFrom": "YYYY-MM-DD" | null, "featuredFor": number | null,
      "creationDate": "YYYY-MM-DD",
      "photoCounts": {"shapeKey": {"lengthKey": number}, ...},
      "photoHashes": {"shapeKey": {"lengthKey": ["string", ...]}, ...},
      "availability": {"shapeKey": {"lengthKey": {"M": number, ...}}},
      "price": number | null,
      "accessoryType": "default" | "byQuantity",
      "accessoryPacks": { "x5": 5 },
      "accessoryPackPrices": { "x5": 2 },
      "inCartCarousel": false
    }
  ]
}
```

`availability` is the raw manager-imported source quantity, before active or
consumed stock reservations are subtracted. This operations-only snapshot is
therefore suitable for `library -- check`; customer gallery endpoints continue
to return effective sellable stock.

#### `POST /operation/library-import/clear`

No body. A full reset, not just the gallery sets: deletes every row in
`products` (cascades to its shapes/colors/photos — photo files on disk
are left behind) **and** every row in the `shapes`/`colors` vocabulary
tables. Backs `library -- delete-all`.
Response `200`: `{"success":true,"sets":number,"shapes":number,"colors":number}`.

### Courier import

Backs `npm run courier -- <command>` (see README) — same idempotent-import
pattern as Library import above, letting that CLI push
[catalog source](../../catalog import tree)'s `courier/<code>.json` files into
any environment's DB without a direct DB/filesystem connection.

#### `POST /operation/courier-import/countries`

Backs `courier -- seed`'s shipping-country push — the country vocabulary
from `courier/data-countries.json`. It lives with the couriers because
`courier_countries` has a foreign key onto `address_countries`: a courier can
only name a country this endpoint has already created. Body:

```
{
  "countries": {
    "FR": { "enabled": true, "label": {"fr": "France", ...} },
    "NL": { "enabled": false, "label": {"fr": "Pays-Bas", ...} }
  },
  "disableMissing": false
}
```

An object keyed by ISO 3166-1 alpha-2 code (the code _is_ the key), not an
array; order = the object's own key order. `enabled` is optional and defaults
to `true`. It gates only `GET /account/address-countries`, i.e. the country
select on the home-address form — never the foreign key, so a country left
`false` can still be stored when it arrives from the parcel-shop picker.
What opens a country for business on a courier is that courier's
`countries` map / `courier_countries.enabled`, not this vocabulary flag.
`400` unless every entry carries a valid label under a two-uppercase-letter
code.

`disableMissing` defaults to `false`. When `true`, countries absent from the
map are **closed** (`enabled = false`), never deleted — `addresses`,
`orders`, `guest_saved_addresses` and `courier_countries` all reference them.
Response `200`:
`{"success":true,"countries":number,"disabledCountries":["code",...]}`.

#### `GET /operation/courier-import/countries`

No body. Every country row, enabled or not, for `courier -- check`'s drift
report. Response `200`:
`{"success":true,"countries":{"FR":{"label":{"fr":"string",...},"enabled":true}, ...}}`.

#### `POST /operation/courier-import/networks`

Backs `courier -- seed`'s vocabulary push — the delivery-network
vocabulary from `courier/data-networks.json`, same role as
`POST /operation/library-import/vocabulary` for shapes/colors. Body:

```
{
  "networks": { "home": {"fr": "string", ...}, "mondial-relay-point": {...}, ... },
  "deleteMissing": false
}
```

An object keyed by code (the code _is_ the key), not an array. Upserts
each entry (label/sort-order updated if it already exists, order = the
object's own key order). `deleteMissing` defaults to `false`. When it is
`true`, the request must contain a complete valid map and DB entries absent
from that map are deleted; this is used only after courier synchronization
by `courier seed --update --delete`. Response `200`:
`{"success":true,"networks":number,"deletedNetworks":["code",...]}`.

#### `GET /operation/courier-import/networks`

No body. Raw, unlocalized delivery-network vocabulary for `courier -- check`.
Response `200`: `{"success":true,"networks":[{"code":"string","name":{"fr":"string",...},"sortOrder":number}]}`.

#### `DELETE /operation/courier-import/networks/:code`

No body. Removes the one delivery-network vocabulary entry identified by
`code`. This cascades through live `courier_networks` and `address_networks`
rows; historical orders remain and have their nullable `network_code` set to
null. `404` if the code does not exist. Response `200`:
`{"success":true,"deleted":true}`.

#### `POST /operation/courier-import/couriers`

Body:

```
{
  "code": "string", "name": {"fr": "string", ...},
  "description": {"fr": "string", ...}, // optional short checkout sentence
  "enabled": boolean, "sortOrder": number,
  "trackingAvailable": boolean,        // default false; catalog-level "can this courier be tracked" flag
  "countries": {                       // preferred bare booleans; legacy ["FR"] /
    "FR": true,                        // [{code,enabled}] / { FR: { enabled } } also accepted
    "BE": true                         // CLI expands manager scalar/default maps before POST
  },
  "deliveryTimes": {                   // required for every country; the CLI merges the
    "FR": {                            // source file's separate deliveryTime/custodyTime
      "minDays": number, "maxDays": number,   // both > 0, maxDays >= minDays
      "custodyDays": number | null     // null for home, or for countries left out of a
    }                                  // listed-only custodyTime map
  },
  "networks": ["string"],              // delivery_networks codes, already $-resolved by the CLI
  "packets": [
    {
      "packetKey": "string",
      "maxQuantity": number,
      "price": number | { "FR": number, ... },   // scalar covers all; map may omit countries
      "expressPrice": number | { "FR": number, ... } | null
    }
  ],
  "update": boolean
}
```

`code`/`name.fr`, at least one country, at least one network, and at least
one valid packet are required (`400` otherwise); `packets[].maxQuantity`
must be strictly increasing (`400` otherwise. Tier selection at confirm
time walks this order and picks the first tier whose `maxQuantity` covers
customer-added nail-set quantity; accessories count as 0). `deliveryTimes` must cover every country in
`countries` (`400` otherwise). `custodyDays` is `null` for home (manager
omits `custodyTime`); when the CLI expands a listed-only `custodyTime`
map, uncovered catalogued countries arrive as `null` too. A map-shaped
`price` / `expressPrice` lists positive numbers only for the countries
authored; omitted catalogued countries stay without a fee until prices are
added (admin enable returns `packet_price_missing`; checkout returns
`shipping_price_unavailable`). A scalar covers all. Soft drops of unknown
delivery-time keys are handled by the CLI before this endpoint sees them.
Manager files may author `countries` / times / prices as scalar, country
map, or `{ "default": …, …overrides }` — the CLI expands those before this
endpoint sees the payload. `trackingAvailable` on its own doesn't make tracking actually work —
see `GET /account/orders/:id/tracking` below, which also requires a backend
provider implemented for the order's courier code. **Idempotent by `code`**,
same three-way response shape as `POST /operation/library-import/sets`:

- no existing courier with that `code` → created. Response
  `{"success":true,"created":true,"updated":false,"id":"uuid"}`.
- existing courier, `update` not `true` → no-op. Response
  `{"success":true,"created":false,"updated":false,"id":"uuid"}`.
- existing courier, `update:true`, nothing differs (name/description/enabled/sortOrder/
  trackingAvailable/countries[+enabled]/deliveryTimes/networks/packets[+price maps]) →
  same no-op response as above.
- existing courier, `update:true`, something differs → updates the row **in
  place** (same id — `orders.courier_id` references it for traceability)
  and fully replaces its `courier_countries`/`courier_networks`/
  `courier_packets` rows. Response
  `{"success":true,"created":false,"updated":true,"id":"uuid"}`.

#### `POST /operation/courier-import/couriers/batch`

Body: `{"couriers":[<courier body>, ...]}`, using the same per-entry contract
as `POST /operation/courier-import/couriers`. The response is
`{"success":true,"results":[<courier response>, ...]}`, positionally aligned
with the request. Full courier seeds use this endpoint to send all courier
records in one HTTP request.

#### `GET /operation/courier-import/couriers`

No body. Every courier currently in the DB (enabled or not), for `courier
-- check` to diff against the local `courier/*.json` files. Response
`200`: per-courier shape including `id`, full `countries` as
`{code,enabled}[]`, `deliveryTimes`, and packets with
`price` / `expressPrice` as number or per-country map (same storage as the
public account endpoint, but not filtered to enabled countries only).

#### `DELETE /operation/courier-import/couriers/:code`

No body. Deletes the courier with that `code` (cascades its countries/
networks/packets rows; orders that already reference it keep their
snapshot fields, only `courier_id` is set null). `404` if no courier has
that `code`. Response `200`: `{"success":true,"deleted":true}`.

#### `POST /operation/courier-import/clear`

No body. A full reset: deletes every row in `couriers` (cascades its
countries/networks/packets rows) **and** every row in the
`delivery_networks` vocabulary table. Historical orders are unaffected —
`courier_id`/`network_code` are `on delete set null`, so a placed order
keeps its frozen `courier_code`/`courier_name`/network snapshot. Backs
`courier -- delete-all`. Response `200`:
`{"success":true,"couriers":number,"networks":number}`.

### Voucher import

Backs `npm run voucher -- seed` and is on the same loopback ops surface as
the other operation imports. Voucher source is one JSON file per code in
`catalog source/voucher/`; `voucher/data-type.json` is the complete
multilingual offer-template vocabulary. The customer-use ledger remains
private in the back-end database.

#### `GET` / `POST /operation/voucher-import/types`

The raw/push vocabulary endpoints for `voucher/data-type.json`. The POST body
is `{ "types": { "percent": {"fr":"...", "en":"...", ...}, "amount":
{...}, "free_shipping": {...}, "free_item": {...}, "free_item_nth": {...} } }`. Each of the five
types requires a non-empty template for every supported language. Templates
may use `{percent}`, `{amount}`, `{requiredItemQuantity}`,
`{freeItemQuantity}`, and `{maxItemPrice}`. `voucher seed --direction remote` pushes this
vocabulary before voucher definitions; the local direction and `check`
compare it too.

#### `GET /operation/voucher-import/vouchers`

Returns every voucher, including configured, redeemed, held and remaining
quantities, plus redemption entries containing the consuming user ID (or
`null` for guests), email (live account, guest checkout, or order snapshot),
order number and redemption date. This OPS-only
data is used only to generate the manager's private voucher usage ledger.

#### `POST /operation/voucher-import/vouchers`

Body: `{"code":"string","enabled":boolean,"quantity":positive integer,
"maxUsesPerUser":non-negative integer,"minSubtotal":positive number|null,
"startsAt":"YYYY-MM-DD","endsAt":"YYYY-MM-DD","allowedUserIds":["uuid",...],"offer":...}`. The code
is any non-empty string of at most 160 characters and is matched
case-insensitively. Offer is
one of `{type:"percent",percent:1..100}`, `{type:"amount",amount:number}`,
`{type:"free_shipping"}`, `{type:"free_item",maxItemPrice:number}`, or
`{type:"free_item_nth",requiredItemQuantity:X}`. Both free-item types apply
to paid nail sets only. `free_item` makes one nail set free up to
`maxItemPrice`; `free_item_nth` is buy X get 1 on the lowest-priced extra
nail set.
Creates a missing definition; an existing one updates only with
`"update":true`. `maxUsesPerUser` defaults to `1` when omitted (`0` =
unlimited per customer). `minSubtotal` is optional and allowed only for
`amount` and `free_shipping`. `allowedUserIds` is optional: omit it (or send `[]`) for a
public voucher; a non-empty UUID list makes the voucher usable only by those
accounts.

#### `DELETE /operation/voucher-import/vouchers/:code`

Deletes an unused voucher. Expired or released checkout holds are cleared with
the definition. A redeemed code returns `409`: it must be disabled instead so
its customer/order audit trail remains intact. A currently active checkout hold
also returns `409` until it expires or is cancelled.

#### `DELETE /operation/voucher-import/vouchers`

Deletes every unused voucher, backing `voucher delete-all`. If any redeemed
voucher exists it returns `409` without deleting the batch; disable redeemed
definitions instead so their audit trail remains intact.

### Orders (ops CLI)

These endpoints back `npm run order -- seed` / `set-status` (and related
fulfillment ops). The authenticated admin dashboard uses `/admin/orders*`
instead — see [Administration](./01-admin.md). Same loopback ops access as other
`/operation` routes.

#### `GET /operation/orders?status=`

`status` optional (`confirmed`|`in_preparation`|`to_send`|`sent`|`disponible`|`received`|`cancelled`); omit for
every ordinary fulfillment order. `need_review` and `return_review` are deliberately unavailable here.
Response: `{"success":true,"orders":[AdminOrder, ...]}`
(same shape as the account-side `Order`, oldest first, plus the owning
`userId` and `user` profile (`email`, `firstName`, `lastName`, `phone`) for
operational lookup. Guest orders have `userId:null`; their `user.email` is
the immutable guest-checkout email and their other `user` fields are null.)

#### `DELETE /operation/orders/:orderNumber`

Permanently deletes one order in the target database by its `CMD-…` number.
Its `order_items` and consumed stock reservation/allocation are deleted too,
releasing that stock. It **does not** cancel or refund a Stripe payment. `404
not_found` if there is no matching order. A `need_review` or `return_review` order returns
`409 payment_review_required` and must first be resolved in the browser admin.
Response `200`:
`{"success":true,"deleted":true,"orderNumber":"CMD-000001"}`.

#### `DELETE /operation/orders`

Body: `{"confirm":true}`. Permanently deletes every order in the target
database with the same cascading/release behaviour as the single-order
endpoint. It never cancels or refunds Stripe payments. The mandatory
confirmation rejects an otherwise valid ops request with `400` if omitted.
If any unresolved `need_review` or `return_review` order exists, the whole delete is refused with
`409 payment_review_required` and `reviewCount`. Response `200`:
`{"success":true,"deletedCount":3}`.

#### `PATCH /operation/orders/:id/status`

Body: `{"status":"confirmed"|"in_preparation"|"to_send"|"sent"|"disponible"|"received"|"cancelled"}`. The internal
`need_review` and `return_review` exception statuses cannot be set or resolved here; use the
matching browser-admin resolution flow. Moving to
`to_send` additionally requires `packet: {weight:number,size:{length:number,width:number,depth:number}}`.
Optional `noPayment:true` is allowed only when moving to `in_preparation` —
skips capturing an authorized PaymentIntent (default is to capture first).
`to_send` always captures if still `authorized`. The server generates and persists the carrier PDF first; failure leaves the
order at `in_preparation`. Passing `skipShippingLabel:true` (instead of
`packet`) moves the order to `to_send` without calling the carrier label API
at all — for when the automated call itself can't proceed (a real carrier-
account error, e.g. Mondial Relay's "no sorting plan" for a product/postal
code) but the order still needs to ship by some other means; no
`order_shipping_labels` row or sticker PDF exists for that order afterward.
Pass `phone:"..."` (CLI `--phone <phone>`) with a `to_send` transition to
use a valid operator-supplied recipient phone number on that generated label;
it does not modify the immutable order-address snapshot.
When a guest order first reaches `received`, the server generates its
idempotent invoice PDF and emails it to the stored guest-checkout address
with a refreshed 24h manage-order link; guests have no account invoice
endpoint.
Strictly sequential forward transitions are `confirmed → in_preparation → to_send → sent → received` for home delivery, and
`confirmed → in_preparation → to_send → sent → disponible → received` for Point Relais orders
(see [Order lifecycle](../orders.md)). The `disponible` status means the parcel is available for collection. The admin-only
terminal `cancelled` transition is available from `confirmed`,
`in_preparation`, or `to_send`; it releases the consumed stock allocation.
It does not refund Stripe or void an already-generated carrier label; an
uncaptured authorization is canceled instead. It is
not available after `sent`, `disponible`, or `received`. Re-sending the order's current
status is a harmless no-op (safe to re-run). Sends the "shipped" email the
moment an order actually transitions to `sent` (not on a no-op re-send).
While a customer edit lock is present (`revision_lock_token` set):

- active (`revision_lock_until > now()`) → `409 order_revision_locked`
- expired but uncleared → `409 order_revision_lock_stale`
  Both include a human-readable `message` (and `lockUntil` when known) for the
  CLI. Pass `bypassLockEdit:true` (CLI `--bypass-lock-edit`) after contacting
  the customer to clear the lock and continue. Moving to `in_preparation`
  or `to_send` captures an `authorized` PaymentIntent first (unless
  `noPayment:true` on `in_preparation` only); capture failure returns
  `409 payment_capture_failed` with a clear `message` and leaves status
  unchanged (including when the hold already `expired`). Card and PayPal
  both authorize at checkout (`capture_method=manual`); free/voucher €0 is
  `not_required`. Auth-window expiry sets `paymentCaptureStatus` to
  `expired` (funds never taken) via Stripe webhooks. Also
  `404 not_found`, `409 invalid_transition`. Response:
  `{"success":true,"order":AdminOrder}`.

#### `GET /operation/orders/:id/sticker`

Downloads the persisted PDF label for an order that successfully entered
`to_send`. It is used only by `npm run order`, which
writes `catalog import tree/order/to_send/<orderNumber>.pdf`.

#### `PATCH /operation/orders/:id/tracking`

Backs `npm run order -- set-tracking`. Body: `{"trackingNumber":"string"}`.
Records (or corrects) a carrier tracking reference by hand — whatever value
fits the order's own courier — most useful after `skipShippingLabel:true`
left an order with no automated shipment number but it has since actually
shipped some other way (e.g. a label printed by hand through the carrier's
own portal). Upserts `order_shipping_labels.shipment_number` (and
`carrier_code`, taken from the order's own `courier_code`) without touching
any existing PDF `content`, and clears any cached tracing so the next
customer lookup fetches fresh data for the new reference. Requires the
order to have already reached `to_send`, `sent`, `disponible`, or `received` —
`409 order_not_shipped` otherwise (there is nothing to track before the
order has even notionally shipped). `400` if `trackingNumber` is blank,
`404 not_found` if the order doesn't exist. Response: `{"success":true}`.

### Product requests (ops CLI)

These endpoints back `npm run product-request -- list` / `set-status`. The
authenticated admin dashboard uses `/admin/product-requests*` instead — see
[Contact and messaging](./05-contact-chat.md). Same loopback ops access as
orders. There is no manager archive.

#### `GET /operation/product-requests?status=`

`status` optional comma-separated subset of `requested`|`accepted`|`refused`;
omit for every request. Newest first. Response:
`{"success":true,"requests":[AdminProductRequest, ...]}`. Each entry has
`publicId` (8-hex), `email`, `userId`, `productUid`, `title`, `shapeKey`,
`shapeLabel`, `lengthKey`, `size`, `quantity`, `comment`, `status`,
`refusalReason`, `createdAt`, `statusUpdatedAt`. Email and comment are
stored encrypted (same PII key as orders).

#### `PATCH /operation/product-requests/:publicId/status`

Body: `{"status":"requested"|"accepted"|"refused","reason":"…"}`. `reason`
is required (and stored) when `status` is `refused`, and rejected otherwise.
Re-sending the current status (same reason when refused) is a no-op
(`changed: false`). `400` for a bad `publicId` / status / reason,
`404 not_found`. Response:
`{"success":true,"changed":true,"request":AdminProductRequest}`.

## Cart rules

Mounted at `/operation/cart-rules` (`src/api/cartRules.routes.ts`), OPS_TOKEN
on every route. These are the promotional rules the cart engine applies
server-side — see [schema: pricing/cart/orders](../schema/03-pricing-cart-orders.md)'s
`cart_rules`. The same rules are editable from the admin UI via
`/admin/cart-rules` ([admin](./01-admin.md)); this router is what
`npm run cart-rule` drives.

#### `GET /operation/cart-rules` / `GET /operation/cart-rules/:code`

List every rule, or fetch one. Response `{"success":true,"rules":[…]}` or
`{"success":true,"rule":{…}}`; `404` for an unknown code.

#### `POST /operation/cart-rules`

Upsert by `code`. Body: `{"code":"string","kind":"gift_per_nail_set"|"nail_qty_percent_tiers"|"free_shipping_above","params":{…},"enabled":boolean,"priority":number,"forbidVoucher":boolean}`.
`gift_per_nail_set` params `{ productUid, qtyPerNailSetUnit, minNails }`
(`minNails` 1 to 10). A catalogue nail set is one unit. A composed set is one
unit when it holds at least `minNails` nails, counted by its quantity. Two
gift rules naming the same product add up on one locked line, filed under the
first rule by priority. `nail_qty_percent_tiers` params `{ tiers, minNails }`
uses the same unit, and the percent applies to the line totals of the units
that count. A shorter composed set counts as zero and is not discounted.
For `free_shipping_above`, `params` is `{ thresholdsByCountry: Record<ISO2, number> }`.
`code`, `kind` and `params` are required; `enabled` defaults to true.
`400 invalid_params` when `params` does not match the shape `kind` requires,
and `409 kind_mismatch` when the code already exists with a different `kind` —
a rule's kind is not editable in place, since its `params` shape depends on it.

#### `POST /operation/cart-rules/:code/enable` / `POST /operation/cart-rules/:code/disable`

Flip `enabled` without touching `params`. Response
`{"success":true,"enabled":true|false}`; `404` for an unknown code. Disabling
is the reversible way to retire a promotion — its gift lines are dropped from
carts on the next cart read (`syncGiftLines`).

#### `DELETE /operation/cart-rules/:code`

Destructive. Prefer `disable`. `404` for an unknown code.

## Shop payment methods

Mounted at `/operation/payment-methods` (`src/api/paymentMethods.routes.ts`),
with the same OPS_TOKEN boundary as every operation route. It manages only the
shop-wide gates stored in `app_preferences`; it never reads Stripe credentials,
changes a Stripe Dashboard setting, or alters a customer's own wallet choice.

#### `GET /operation/payment-methods`

Read the current gates. Response:

```json
{
  "success": true,
  "paymentMethods": {
    "card": true,
    "paypal": true,
    "bancontact": true,
    "googlePay": true,
    "applePay": true
  }
}
```

#### `PATCH /operation/payment-methods`

Patch one or more boolean flags from `card`, `paypal`, `bancontact`,
`googlePay`, and
`applePay`. At least one is required; a non-boolean flag returns `400`.
Response is the same current `paymentMethods` snapshot as `GET`. A disabled
method is hidden by the client and remains server-rejected at checkout with
`403 payment_method_forbidden`.

## Shop payment method countries

Mounted at `/operation/payment-method-countries`
(`src/api/paymentMethodCountries.routes.ts`), with the same OPS_TOKEN boundary
as every operation route. It manages per-method ISO allowlists stored in
`payment_method_countries`; checkout primary vs overflow follows these lists
against the resolved delivery country.

#### `GET /operation/payment-method-countries`

Read the current allowlists. Response:

```json
{
  "success": true,
  "paymentMethodCountries": {
    "card": ["ALL"],
    "paypal": ["ALL"],
    "bancontact": ["BE"],
    "googlePay": ["ALL"],
    "applePay": ["ALL"]
  }
}
```

#### `PATCH /operation/payment-method-countries`

Patch one or more method keys from `card`, `paypal`, `bancontact`, `googlePay`,
and `applePay`. Each value is a non-empty array of ISO-3166-1 alpha-2 codes or
the literal token `ALL`. At least one method is required; malformed arrays return
`400`. Response is the same current snapshot as `GET`.

## Courier live state

Mounted at `/operation/courier-live-state`
(`src/api/courierLiveState.routes.ts`), with the same OPS_TOKEN boundary as
every operation route. Manager import remains authoritative for courier
structure; this route applies shop-wide `enabled` flags and per-country
open/closed rows without changing prices or delivery times.

#### `GET /operation/courier-live-state`

Read every imported courier with its current shop flag and per-country toggles.
Response:

```json
{
  "success": true,
  "couriers": [
    {
      "code": "colissimo-home",
      "enabled": true,
      "countries": [
        { "code": "FR", "enabled": true },
        { "code": "BE", "enabled": true },
        { "code": "LU", "enabled": false }
      ]
    }
  ]
}
```

#### `PATCH /operation/courier-live-state`

Body: `{"couriers":[{"code":"string","enabled":boolean,"enabledCountries":["FR","BE"]}]}`.
At least one courier is required. For each entry, the shop-wide `enabled` flag
is set, then every catalogued country is enabled only when listed in
`enabledCountries`; all other rows are disabled. Unknown courier codes and
catalog rows that cannot be toggled (for example missing packet price) return
`400` with a plain-text `error`. Response is the same snapshot as `GET`.

## Shop third-party sign-in methods

Mounted at `/operation/sign-in-methods` (`src/api/signInMethods.routes.ts`),
with the same OPS_TOKEN boundary as every operation route. It manages only the
shop-wide Google / Facebook / Apple gates in `app_preferences`; email + password / OTP
are never toggled here, and OAuth credentials stay in env.

#### `GET /operation/sign-in-methods`

Read the current gates (availability + per-provider verbose create/link). Response:

```json
{
  "success": true,
  "signInMethods": {
    "google": true,
    "facebook": true,
    "apple": true,
    "facebookMobileDirectOAuthEnabled": true,
    "googleVerbose": false,
    "facebookVerbose": false,
    "appleVerbose": true
  }
}
```

#### `PATCH /operation/sign-in-methods`

Patch one or more boolean flags from `google`, `facebook`, `apple`,
`facebookMobileDirectOAuthEnabled`, `googleVerbose`, `facebookVerbose`, and `appleVerbose`. At least one is
required; a non-boolean flag returns `400`. Response is the same current
`signInMethods` snapshot as `GET`. A disabled provider is hidden by the client
for new sign-in / link; the API rejects those with `403 sign_in_method_forbidden`.
Unlink stays allowed when the account is already linked. Verbose on means an
unknown social email gets the create-or-link choice instead of silent create.

#### `POST /operation/courier-import/packet-measurements`

Imports the physical parcel measurements from
`catalog source/courier/data-packet.json` into
`shipping_packet_measurements`, so fulfillment never reads the manager
repository at runtime. Body:
`{"measurements":[{"quantity":N,"weight":N,"length":N,"width":N,"depth":N}]}`,
every value a positive integer (`shipping_packet_measurements_positive_chk`).
Replaces the table's contents in one transaction. Public gift
`maxSetsCeiling` is `max(quantity)` of the rows just written (unused for
create). `400` when any
row is malformed. Driven by `npm run courier`.

---
