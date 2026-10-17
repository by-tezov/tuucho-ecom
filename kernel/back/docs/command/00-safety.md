# Safety gates

There is **no `ALLOW_*` environment gate any more**. The family
(`ALLOW_DANGEROUS_API`, `ALLOW_USER_API`, `ALLOW_FAKE_API`, `ALLOW_LOG_API`,
`ALLOW_LOG_CRON_SHIPMENT`, `ALLOW_LOCK_PROBE`) was neutralised when ops moved
to the `--ssh` / `--ftp` transports, and the dead middleware backing it has
been removed. Do not reintroduce those variables in `.env/` files: nothing
reads them.

What actually protects the ops surface:

## 1. The transport boundary

`/operation/*` is not mounted on the public API. It is reachable only through:

- `src/opsServer.ts` — bound to `127.0.0.1`, reached over an SSH port forward
  (`--ssh`) or started locally (`--dev`); every `/operation/*` request must
  still carry `Authorization: Bearer <OPS_TOKEN>` (same token as the PHP
  gateway). `/healthz` on that process stays open for readiness probes only;
- the PHP gateway at `OPS_GATEWAY_URL` (`ops.shop.example` /
  `ops-preprod.shop.example`) — every request must carry
  `Authorization: Bearer <OPS_TOKEN>` before PHP proxies `/operation/*` to
  that same loopback server (`--ftp`), forwarding the same Bearer header so
  loopback auth succeeds. `--ftp-ops-remove` takes this gateway
  away; `--ftp` ops CLIs then fail.

`scripts/withOpsTunnel.ts` loads `OPS_TOKEN` from
`.env/.private.env` / `.env/<mode>/.private.env` and sets `PAM_OPS_TOKEN`
for every transport (dev, ssh, ftp) so CLIs always send the real Bearer
token. Never commit or print that value.

The public API application must never mount `/ops-gateway` or `/operation/*`.
Both transports serve the same router set (`src/opsRoutes.ts`) from
`opsServer`, so they cannot drift.

## 2. `--confirm` on `--prod`

Any CLI command that writes to the target requires `--confirm` when — and only
when — it targets `--prod`. Never for `--dev` / `--preprod`, never for
read-only commands. See `requireConfirmForProdWrite` in `scripts/cliCommon.ts`.

Destructive intent is also explicit in the command itself: `--update`,
`--delete`, `deleteMissing`, `delete-all`, `database-reset` (`{"confirm":true}`
server-side too), `database-restore`. `database-restore --bypass-preflight`
additionally opts out of the migration compatibility gate — the operator
owns schema/data risk (e.g. restore after a migration squash).

## 3. DB-backed admin preferences

Log access is gated by preferences stored in `app_preferences` and managed
from the admin dashboard, not by env values:

- `apiLogEnabled` — `npm run log -- read/download/clear --api` and their OPS
  endpoints. Separate from `ENABLED_API_LOG`, which only seeds whether records
  are written. The preference applies in production too. Each record stores
  the request and the response body. Credentials are redacted everywhere;
  production also anonymizes personal data.
- `emailLogEnabled` — `npm run log -- read/download/clear --email` and their
  OPS endpoints. Seeded from `ENABLED_EMAIL_LOG`. The preference applies in
  production too. Each record stores the message that was sent or the failure.
  Credentials are redacted everywhere; production also anonymizes personal
  data the same way as the API journal.
- `cronShipmentLogEnabled` — `npm run log -- read --cron-shipment` and its OPS
  endpoints.
- `cronAccountDeletionLogEnabled`, `cronGuestSavedCleanupLogEnabled`,
  `cronLoyaltyLogEnabled`, `cronGiftLogEnabled`, `cronGiftPurgeLogEnabled`,
  `cronPaymentAuthExpirySpyLogEnabled` — same for the other cron logs.

A route whose preference is off answers `403`.

## 4. Deploy-time environment switches

These are read by `npm run deploy`, not by a request handler — they install or
remove a production crontab entry and never block a call at runtime:

- `ENABLED_CRON_SHIPMENT`
- `ENABLED_CRON_ACCOUNT_DELETION`
- `ENABLED_CRON_GUEST_SAVED_CLEANUP`
- `ENABLED_CRON_LOYALTY`
- `ENABLED_CRON_GIFT`
- `ENABLED_CRON_GIFT_PURGE`
- `ENABLED_CRON_PAYMENT_AUTH_EXPIRY`

Set them in `.env/<mode>/.lws.env` for production deploy switches (plain
topology, not a secret). Deploy pushes that file onto the cPanel Node app
(see `docs/command/01-dev-build-deploy.md`).

`npm run test` is the unit suite (`src-test/unit-test/`). There is no
`ALLOW_TEST_API` gate.
