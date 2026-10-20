# Production crons

Production backend deploys always install marked crontab entries. Each job always
**processes** when it runs; the admin preference `cron*LogEnabled` only
controls whether the detailed HTTP result is written to / readable from the
private jsonl log. Preproduction never installs these crons.

| Job                 | Flag                               | Schedule     | Script                                   | Log file                                    | Preference                        |
| ------------------- | ---------------------------------- | ------------ | ---------------------------------------- | ------------------------------------------- | --------------------------------- |
| Shipment tracking   | `ENABLED_CRON_SHIPMENT`            | `17 * * * *` | `~/bin/main-cron-shipment-tracking.sh`   | `PRIVATE_LOG_CRON_SHIPMENT_FILE`            | `cronShipmentLogEnabled`          |
| Account deletion    | `ENABLED_CRON_ACCOUNT_DELETION`    | `17 4 * * *` | `~/bin/main-cron-account-deletion.sh`    | `PRIVATE_LOG_CRON_ACCOUNT_DELETION_FILE`    | `cronAccountDeletionLogEnabled`   |
| Guest saved cleanup | `ENABLED_CRON_GUEST_SAVED_CLEANUP` | `17 5 * * *` | `~/bin/main-cron-guest-saved-cleanup.sh` | `PRIVATE_LOG_CRON_GUEST_SAVED_CLEANUP_FILE` | `cronGuestSavedCleanupLogEnabled` |
| Loyalty wallet      | `ENABLED_CRON_LOYALTY`             | `17 6 * * *` | `~/bin/main-cron-loyalty.sh`             | `PRIVATE_LOG_CRON_LOYALTY_FILE`             | `cronLoyaltyLogEnabled`           |
| Gift offers         | `ENABLED_CRON_GIFT`                | `17 7 * * *` | `~/bin/main-cron-gift.sh`                | `PRIVATE_LOG_CRON_GIFT_FILE`                | `cronGiftLogEnabled`              |
| Gift purge          | `ENABLED_CRON_GIFT_PURGE`          | `17 8 * * *` | `~/bin/main-cron-gift-purge.sh`          | `PRIVATE_LOG_CRON_GIFT_PURGE_FILE`          | `cronGiftPurgeLogEnabled`         |
| Payment-auth-expiry spy | `ENABLED_CRON_PAYMENT_AUTH_EXPIRY` | `17 9 * * *` | `~/bin/main-cron-payment-auth-expiry.sh` | `PRIVATE_LOG_CRON_PAYMENT_AUTH_EXPIRY_FILE` | `cronPaymentAuthExpirySpyLogEnabled` |
| Keep warm           | `ENABLED_CRON_WARM`                | `* * * * *`  | `~/bin/main-cron-warm.sh`                | `PRIVATE_LOG_CRON_WARM_FILE` (timing + failures) | `cronWarmLogEnabled` (remote read/clear) |

The administration Crons page lists these eight jobs and fetches
`GET /admin/cron-logs/:kind` only when a row is opened. The matching
`cron*LogEnabled` preference still gates the read.
`POST /admin/cron-logs/:kind/clear` erases that file from the page. The
operations CLI can clear it too.

The API process drops lines whose `at` is older than `CRON_LOG_RETENTION`
(`1y` in kernel `config/`, 365 days), about once a day and again at
process start. The same sweep covers the administration journal file
`PRIVATE_LOG_ACTIVITY_FILE`. A line with no `at` stays until a clear.

Every job except keep-warm POSTs its `/operation/*` route with
`Authorization: Bearer <OPS_TOKEN>`, read from kernel private JSON
(`ops.token`). The token is never written
to the journal. `/healthz` on that same process stays open: it is only a
readiness probe, and a 200 there does not authorize the POST. A missing
token is `ops_token_missing`. A rejected token is `ops_unauthorized`.
Each journal line includes `at` (UTC). A success line also includes
`event` and, when the log preference is on, that job's counters.

## In-process mail worker (not a crontab)

`mail_jobs` is drained by an event-driven worker started when the API process
listens (`startMailJobWorker` from `app.ts`). Enqueue wakes the drain
immediately; there is no idle poll. An insert that runs inside a transaction
wakes the drain again after that transaction commits, because the row is not
visible before then. After a drain it arms a one-shot timer for the earliest
retry backoff or stuck-`processing` reclaim (10 minutes), then sleeps again. It claims due rows with `FOR UPDATE SKIP LOCKED`, sends
gift share-card / order-confirmation / contact-form mail, retries with
backoff, and dead-letters after 8 attempts. Process shutdown
(`stopMailJobWorker` on SIGTERM/SIGINT) clears the timer and waits for an
in-flight drain before the HTTP server and pool close. If the table is
missing (process started before migrate), a wake is a no-op after one stderr
line rather than a stack dump. A drain also deletes `sent`/`dead` rows older
than 30 days (at most once per process every six hours). There is no `ENABLED_CRON_*` flag and no
`~/bin` wrapper: every running API instance participates. Spy/fire-and-forget
paths stay out of this table.

There is deliberately no background task that periodically compares Stripe
payments with local orders. If Stripe settles a payment but the ordinary order
transaction cannot complete, the customer gets an order in `need_review`
status materialized from the immutable checkout snapshot.
The browser-admin dashboard shows a full-width attention card and the order's
Stripe PaymentIntent reference. An administrator must inspect Stripe and then
choose whether to continue or cancel through
`POST /admin/orders/:id/need-review-resolution`. The request is the explicit
human action: Continue only verifies Stripe; Cancel cancels an authorization
or refunds captured funds before updating the order. No queue, table, worker,
or cron compares or changes these payments automatically. Only when even the
durable review order cannot be persisted does the signed webhook return a
non-2xx response. Stripe may then resend that same event through its native
webhook delivery mechanism; this is not an application cron and it never
chooses Continue or Cancel.

Order status meanings and the carrier walk sit in [Order lifecycle](../orders.md).

## Shipment-tracking cron

Production backend deployments install one cron job for Mondial Relay shipment
tracking (installed on every production deploy).
The job always processes tracking when it runs. The admin preference
`cronShipmentLogEnabled` only controls whether the detailed result is written
to / readable from the private cron log. Preproduction has no tracking cron.

It runs hourly, at minute 17:

```cron
17 * * * *
```

The job calls the protected shipment-tracking operation. It considers only
Mondial Relay orders that are `to_send`, `sent`, or `disponible`, have a
shipment number, and have not already had a successful tracking fetch in the
previous four hours. A labelled `to_send` order advances to `sent` only when
SOAP reports drop-off (`PRISE EN CHARGE POINT RELAIS`); a successful tracing
call with only `RÉCEPTION DES DONNÉES` (or other pre-handoff labels) leaves
the order at `to_send`. A run
processes at most 25 SOAP fetches, so a backlog continues on the next hourly run.
The four-hour per-shipment cache limits Mondial Relay SOAP requests to at most six
per parcel per day; intervening runs still apply **cached** events, so a locker
or delivery milestone already stored from a customer/admin tracking view is not
ignored until the next SOAP fetch. Between separate parcels, the cron waits
`MONDIAL_RELAY_TRACKING_THROTTLE`
(`1.5s` by default), so even a 25-order batch is paced rather than burst.
Each individual request is aborted after
`MONDIAL_RELAY_TRACKING_TIMEOUT` (`30s` by default); the failed parcel
is counted and the batch continues with the next one.

When Mondial Relay reports a collection-point shipment as available, the order
moves to `disponible`. That includes locker wording such as
`Colis disponible au point de retrait` and
`5 jours restants pour retirer le colis en Locker`, not only
`Disponible au Point Relais`. When it reports delivery (`Livré`,
`Colis livré au destinataire`, or WSI2 STAT `82`), the order moves to `received`
(including collection-point orders, preserving the normal lifecycle). Transit,
incident, unknown, and failed-carrier results never change the order status.
High-confidence labels for a parcel that was not collected, was refused, or
is returning to sender create an idempotent return case and move the order to
`return_review`. Return detection has priority over older delivery milestones
in the full tracking history. The cron records evidence only: it never decides
a refund, cancels an order, restores stock, or sends the final outcome email.
Those actions require the browser-admin return-review endpoint. Dismissing a
false signal suppresses that exact stored carrier evidence so the next cron
does not immediately reopen it; distinct later evidence can create a new case.

Ordinary carrier-driven status transitions use the same notification workflow as
`npm run order -- set-status`: moving to `sent` sends the shipment email, and
moving a guest order to `received` sends its invoice PDF.

If tracking credentials or Mondial Relay courier codes are not configured, the
job reports that it was skipped and makes no order changes.

Its API result is written to the private path configured by
`PRIVATE_LOG_CRON_SHIPMENT_FILE` (default: `/log/cron-shipment.jsonl` within
`PRIVATE_DIR`). The cron waits until the loopback ops server answers
`/healthz` before POSTing; a startup failure is one JSON line
(`ops_token_missing` / `ops_server_not_ready` / `ops_server_exited` /
`ops_unauthorized` / `ops_request_failed`), each with `at`, rather
than a raw `curl:` message. The `~/bin` wrapper that `deploy --prod` installs starts `opsServer.js` by
absolute path. `config/env.ts` locates `.env` next to that compiled tree, not
`process.cwd()`, so cron's default cwd (`$HOME`) does not prevent boot. An
older release that still resolved env from cwd exits as `ops_server_exited`.
Each processed parcel also records its Mondial Relay SOAP
request and raw SOAP response in `webserviceCalls`; the request's `Security`
signature is redacted before logging, and empty WSI2 `Tracing` padding rows
are omitted from the logged response.

To run the production job manually from a machine with the `lws_shop_example`
SSH host configured:

```sh
ssh lws_shop_example '$HOME/bin/main-cron-shipment-tracking.sh'
```

Afterward, inspect its log with:

```sh
ssh lws_shop_example 'tail -n 20 "$HOME/private_file/prod/log/cron-shipment.jsonl"'
```

To download the production log locally (requires the
`cronShipmentLogEnabled` admin preference), run:

```sh
npm run log -- download --cron-shipment --prod
```

To clear that remote cron log (a destructive action), run:

```sh
npm run log -- clear --cron-shipment --prod --confirm
```

## Account-deletion cron

Daily `POST /operation/process-account-deletions`: sends pending-deletion
reminders (`DELETION_REMINDER_DAYS_BEFORE` out) and hard-deletes accounts
already past `deletion_scheduled_for`.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-account-deletion.sh'
npm run log -- download --cron-account-deletion --prod
npm run log -- clear --cron-account-deletion --prod --confirm
```

## Guest-saved-cleanup cron

Daily `POST /operation/process-guest-saved-cleanup`: deletes unclaimed
remembered guest addresses/cards past `delete_after`, detaches the
PaymentMethod, and deletes the pending Stripe customer.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-guest-saved-cleanup.sh'
npm run log -- download --cron-guest-saved-cleanup --prod
npm run log -- clear --cron-guest-saved-cleanup --prod --confirm
```

## Loyalty wallet cron

Production backend deployments install one daily cron when
installed on every production deploy. Preproduction never
installs it.

It runs daily at minute 17 of hour 6:

```cron
17 6 * * *
```

The job calls `POST /operation/process-loyalty`, which:

1. Releases expired loyalty checkout holds (`state = 'held'` and
   `expires_at` passed), restoring lot remaining, then materializes expiry
   for lots whose `expires_at` has passed — all in one transaction per batch
   (idempotent).
2. Emails customers with credit inside the burn-notice window
   (`burn_notice_weeks` before lot expiry). Respects `reminder_interval_days` between sends
   per user/settlement, and the customer `loyalty_expiry` notification switch.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-loyalty.sh'
npm run log -- download --cron-loyalty --prod
npm run log -- clear --cron-loyalty --prod --confirm
```

Manual ops endpoints `POST /operation/loyalty-expire` and
`POST /operation/loyalty-remind` remain available for one-off runs.

## Gift-offer cron

Production backend deployments install one daily cron when
installed on every production deploy. Preproduction never
installs it.

It runs daily at minute 17 of hour 7:

```cron
17 7 * * *
```

The job calls `POST /operation/process-gift`, which:

1. Marks `selecting` offers past `offer_expires_at`
   as `expired` and starts the visibility window.
2. Releases expired `purpose='gift'` stock holds. The offer stays
   `awaiting_payment` / `paying` and remains payable until pay-by.
3. Cancels unpaid offers past `pay_by_at` when no PaymentIntent is linked
   (skips a live PI). Never captures or refunds Stripe. Mails Marc only.
4. Sends at-most-once-per-UTC-day hold (≤1 day) and pay-by (≤3 days)
   reminder mails.

The job always processes when it runs. The admin preference
`cronGiftLogEnabled` only controls whether the detailed result is written
to / readable from the private jsonl log.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-gift.sh'
npm run log -- download --cron-gift --prod
npm run log -- clear --cron-gift --prod --confirm
```

## Keep-warm cron

The only job here whose happy path does not start `opsServer.js` or call
`/operation/*`. It runs every minute, and each run sends an unauthenticated
`GET {URL_API_BASE}/healthz` every 5s until about 54s after it started, so
the next run takes over without hitting the lock: about 16,000 requests a day
to a route that touches no database. It exercises the real path (edge,
Apache, Passenger, Node).

It was first written to stay inside Passenger's default
`PassengerPoolIdleTime` (300s), but that is not what this host applies.
Measured on prod (2026-10-06), Passenger's idle cleaner shuts the Node
process down after only a few idle seconds (pings 10s apart did not keep one
alive, 5s apart kept one alive indefinitely), hence 5s. The idle time is server-level configuration:
`PassengerMinInstances` in `public_html/api/.htaccess` is refused by this
host (the API answers `500` while it is present). What keeps the remaining
cold starts short is the boot itself: the single-file server bundle, lazy
native packages, the compile cache, and the direct Node binary (see
`docs/command/01-dev-build-deploy.md`).

### Outage probe, restore, and spy alerts (prod only)

When `/healthz` fails, the same run retries up to **5 attempts over ~2 minutes**
(about 24s between tries). A non-blocking `flock` prevents overlap with the
next tick while a restore is still running.

If every attempt fails:

1. Send an owner spy (`website_down` via `tuucho-mail-spy`; live `spyTo` when
   plugins/DB load, otherwise last cached To in
   `$PRIVATE_DIR/warm-outage/spy-recipients.json`. Respects `DISABLE_SPY_EMAIL`.
   Transport is still `SMTP_HOST` / `EMAIL_NO_REPLY_FROM`)
   **once per outage**, then set a filesystem inhibit marker under
   `$PRIVATE_DIR/warm-outage/`.
2. Attempt restore: ensure `PassengerEnabled on` on
   `~/public_html/api/.htaccess`, then
   `cloudlinux-selector restart --interpreter nodejs --app-root private_html/prod/current`,
   then poll `/healthz` for up to 120s.
3. If still unhealthy, send a second owner spy (`spy.website_restore_failed`)
   **once per outage**, leave both inhibit markers set, and exit non-zero.
4. Later ticks keep probing and may retry restore, but **do not resend** those
   spies while the inhibit markers remain.
5. The first successful `/healthz` (probe or post-restart poll) clears the
   markers so the next outage can alert again. There is no “recovered” spy.

Spy mail is sent by `warmOutageSpy.js` from the release tree via the cPanel
Node runtime and SMTP. It does **not** go through Passenger, so a dead public
API can still notify.

Every healthy run appends one JSONL line to `PRIVATE_LOG_CRON_WARM_FILE`
(about 1,440 a day):
`{"success":true,"event":"healthz_timing","at":"<UTC ISO>","firstSec":0.55,"maxSec":0.95,"pings":11}`.
`firstSec` is curl's total time for the run's first `/healthz`, the one a
cold start shows up in (several seconds, against ~0.1s warm); `maxSec` is
the slowest of its pings, which catches a process reaped mid-run. Failure-path
events append to the same file, and `healthz_failed` carries `at` and the
last probe's `lastSec`. Clear it with
`npm run log -- clear --cron-warm --prod --confirm` when it grows. Remote read/clear of that log is gated by the
admin preference `cronWarmLogEnabled` (processing and filesystem writes are
not preference-gated).

The front side of the cold-boot problem is handled in `kernel/front`'s
`src/api/signInMethodsCache.ts`, which paints the last known sign-in methods
immediately so a cold boot is never visible even when this cron is off.

Run it by hand:

```bash
ssh lws_shop_example '$HOME/bin/main-cron-warm.sh'
```

Inspect / download the failure log:

```bash
ssh lws_shop_example 'tail -n 20 "$HOME/private_file/prod/log/cron-warm.jsonl"'
npm run log -- download --cron-warm --prod
npm run log -- clear --cron-warm --prod --confirm
```

## Gift-purge cron

Production backend deployments install one daily cron when
installed on every production deploy. Preproduction
never installs it.

It runs daily at minute 17 of hour 8, an hour after the gift-offer cron so a
`selecting` offer that just expired has already started its
`purge_after_days` clock from `created_at`, not from that expiry:

```cron
17 8 * * *
```

The job calls `POST /operation/process-gift-purge`, which hard-deletes
`cancelled` / `expired` gift offers (never `ordered`) whose `created_at` is
past `GIFT_PURGE_AFTER_DAYS` (currently 396 days, ~13
months — CNIL's usual benchmark for prospect/contact data that never
resulted in a sale). Deleting the offer row cascades to its items,
destination, lock/pin sessions, and reminder-send rows, and drops any
leftover gift cart, removing the giver's email/name/comment and the
receiver's name/destination in one step. Idempotent and safe to run as
often as the cron likes.

The job always processes when it runs. The admin preference
`cronGiftPurgeLogEnabled` only controls whether the detailed result is
written to / readable from the private jsonl log.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-gift-purge.sh'
npm run log -- download --cron-gift-purge --prod
npm run log -- clear --cron-gift-purge --prod --confirm
```

## Payment-auth-expiry-spy cron

Production backend deployments install one daily cron when
installed on every production deploy.
Preproduction never installs it.

It runs daily at minute 17 of hour 9:

```cron
17 9 * * *
```

The job calls `POST /operation/process-payment-auth-expiry-spy`, which mails
the owner once per order, `PAYMENT_AUTH_EXPIRY_SPY_BEFORE` (currently `2d`)
ahead of a still-`authorized` order's authorization hold's **estimated**
expiry. Stripe exposes no exact expiry for a manual-capture PaymentIntent:
the estimate is `confirmed_at` plus an assumed window per payment method
(card ~7 days, PayPal ~10 days — the same PayPal window documented in
`platform/stripe/stripeClient.ts`; Bancontact and free orders are never
`authorized`, so neither is queried). The mail is a heads-up only: the job
never captures, cancels, or refunds anything (see the no-automatic-Stripe-
reconciliation policy above). Idempotent — `payment_auth_expiry_spy_sends`
caps it at one mail per order per day, so it is safe to run as often as the
cron likes.

The job always processes when it runs. The admin preference
`cronPaymentAuthExpirySpyLogEnabled` only controls whether the detailed
result is written to / readable from the private jsonl log. The separate
admin preference `spy.payment_authorization_expiring` controls whether the
mail itself sends at all.

```sh
ssh lws_shop_example '$HOME/bin/main-cron-payment-auth-expiry.sh'
npm run log -- download --cron-payment-auth-expiry --prod
npm run log -- clear --cron-payment-auth-expiry --prod --confirm
```