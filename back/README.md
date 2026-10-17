# Lumen backend

Backend for [pamsurin-front](../pamsurin-front): PostgreSQL schema + JSON API
for gallery/featured catalogue, auth/account, cart/checkout (Stripe +
`/webhooks/stripe`), shipping labels/tracking, vouchers, invoices, and
contact. Catalogue sets are written only via `npm run library` (ops import
from pamsurin-manager); customer/auth/order writes go through `/auth`,
`/account`, and Stripe webhooks. This file is the practical "how do I run
this" reference — see [docs/](docs/README.md) for the split references
(`docs/api`, `docs/schema`, `docs/command`, `docs/cron`; root `API.md` /
`SCHEMA.md` / `COMMAND.md` / `CRON.md` are thin indexes), including every
`npm run` script's arguments (`order`, `product-request`, `user`, `voucher`,
`healthz`).

The source photo library, courier JSON, and voucher sources live in
[pamsurin-manager](../pamsurin-manager) — this backend imports them via
`library` / `courier` / `voucher` below. Nothing here depends on
pamsurin-manager at runtime.

Stripe HTTP requests use the bounded `STRIPE_REQUEST_TIMEOUT` (default
`12s`) and one SDK network retry. Capture/cancel operations persist an
internal idempotent marker before calling Stripe, so network latency does not
hold a PostgreSQL transaction or pool connection.

## Local development

Everything below runs entirely on your machine — no LWS/FTP involved.

### Config files

Env vars live under `.env/` and load in layers, each overriding the last
(see `src/config/env.ts`): `.env/.public.env` → `.env/<target>/.public.env`
→ `.env/.private.env` → `.env/<target>/.private.env`. `.public.env` files
are committed (safe-to-commit topology/config); `.private.env` files are
gitignored (actual secrets). The two files directly under `.env/` hold
values shared across every target; each `.env/<target>/` folder holds
whatever's genuinely different for that target — `target` is `dev`,
`preprod`, or `prod`, picked by the `APP_TARGET` var itself (which can only
ever be set directly, as a real env var — it's what selects which files to
load, so it can't live inside one of them; deliberately not `NODE_ENV`,
since cPanel's Node.js Selector has its own Application Mode
production/development toggle that also drives a real `NODE_ENV` — a
separate name avoids the two fighting each other). Required, no default:
the app throws at startup if it's missing or isn't exactly one of those
three values — `npm run dev` sets `APP_TARGET=dev` for you locally, so
there's nothing to set by hand there. All eight files already exist in this repo;
`.env/preprod/.private.env`/`.env/prod/.private.env` ship with `CHANGE_ME`
placeholders — fill in real values before deploying to each (see
"Deploying" below).

`CHECKOUT_PRIVACY_SESSION_IDLE_TTL` is safe public configuration and defaults
to `30m`. It is the server-authoritative sliding inactivity limit for
tab-scoped guest/account checkout address and payment drafts. Frontend
heartbeats extend it only on real interaction; changing it requires no
frontend build-time timeout variable because session start returns the parsed
duration and absolute deadline.

### API diagnostic log

`ENABLED_API_LOG=true` seeds the admin preference that records each API
request and completed JSON response as private NDJSON, in dev, preprod, and
production. `PRIVATE_LOG_API_FILE` is a path relative to `PRIVATE_DIR`
(default `/log/api.jsonl`); files rotate at `API_LOG_ROTATE_MAX_BYTES`,
keeping `API_LOG_ROTATE_MAX_FILES` archived generations. `API_LOG_BODY_MAX_BYTES`
bounds a single JSON body. Request and response bodies are always stored.

Passwords, cookies, authorization/refresh/OTP tokens, secrets and payment or
card identifiers are replaced with `[REDACTED]` in every environment.
Production also replaces email, phone, name, postal address, and client IP
so the journal is anonymous. Binary downloads/uploads and
SSE are logged as content metadata rather than bytes. Use
`npm run log -- read --api --dev|preprod|--prod [--follow]` to read the protected
tail; use `npm run log -- download --api --dev|preprod|--prod` to retain the raw NDJSON
under `output/log/<mode>/`. The command uses `OPS_TOKEN`, so it works with
preprod even without SSH. API-log read/download/clear access requires the
`apiLogEnabled` admin preference, including in production. Shipment-cron log access uses its
separate `cronShipmentLogEnabled` preference.
`npm run log -- clear --api --dev|preprod` clears the current API log and its
retained rotations, without deleting local downloads. The admin Journal page
reads the same tail and can erase it, including when the preference is off. Pass `--cron-shipment`
to clear only the shipment-tracking cron log; production clears require
`--confirm`.

### Sent e-mail journal

`ENABLED_EMAIL_LOG=true` seeds the admin preference `emailLogEnabled`. Unset
means off. When it is on, each `sendMail` and `sendChatMail` (success or
failure) is appended as private NDJSON at `PRIVATE_LOG_EMAIL_FILE` (relative
to `PRIVATE_DIR`, `/log/email.jsonl`). Rotation and the body cap are the API
journal's `API_LOG_ROTATE_MAX_BYTES`, `API_LOG_ROTATE_MAX_FILES` and
`API_LOG_BODY_MAX_BYTES`; the stored text is also capped at 32 KiB. Credentials
are replaced with `[REDACTED]` everywhere. Production stores an account email
as that user's id and anonymises every other email, phone number, and
personal-data field the same way as the API journal. Read it with `npm run log -- read --email --dev|preprod|--prod`.
The keep-warm outage script does not write this journal: that process must
not open the database.

The administration journal is the private file `PRIVATE_LOG_ACTIVITY_FILE`
(`/log/activity.jsonl` inside `PRIVATE_DIR`). The admin page reads it and can
erase it. Dated lines follow `CRON_LOG_RETENTION`.

Mondial Relay labels are disabled until these private variables are set
(API2/Connect API — see the tracking paragraph below for the separate API1
credentials): `MONDIAL_RELAY_API2_URL`, `MONDIAL_RELAY_API2_ENSEIGNE`,
`MONDIAL_RELAY_API2_LOGIN`, `MONDIAL_RELAY_API2_PASSWORD`,
`MONDIAL_RELAY_POINT_COURIER_CODE`, `MONDIAL_RELAY_POINT_NETWORK_CODE`,
`MONDIAL_RELAY_POINT_DELIVERY_MODE`, `MONDIAL_RELAY_HOME_COURIER_CODE`,
`MONDIAL_RELAY_HOME_NETWORK_CODE`, `MONDIAL_RELAY_HOME_DELIVERY_MODE`,
`MONDIAL_RELAY_HOME_COLLECTION_MODE`, `MONDIAL_RELAY_COLLECTION_MODE`, and the `MONDIAL_RELAY_SENDER_*`
address/contact fields. They are read only when an order enters `to_send`, so
a normal local API can start without them. The default public route settings
cover the manager's `mondial-relay-point` (`24R`) and `mondial-relay-home`
(`HOM`) couriers; both default to `REL` collection. Change those
code/mode/collection variables if the imported courier data or carrier
contract uses different values. Mondial Relay Home and Point Relais require a
recipient phone number at checkout (Point Relais uses it for the collection
code); Home labels use the customer's account email (or mandatory
guest-checkout email) as the recipient email.

Package tracking (`GET /account/orders/:id/tracking`) is a **separate**
Mondial Relay API (their legacy API1/SOAP, not the API2/Connect API used for
labels above) with its own credentials: `MONDIAL_RELAY_API1_URL`,
`MONDIAL_RELAY_API1_ENSEIGNE`, `MONDIAL_RELAY_API1_PRIVATE_KEY`.
Tracking stays unavailable (customers get a generic "not available" state,
not an error) until these are set, independent of whether label generation
is configured. `MONDIAL_RELAY_PUBLIC_TRACKING_URL` is a separate, non-secret
public setting: Mondial Relay's own consumer tracking page, shown as a
fallback link next to (or instead of, if the live call fails) the embedded
timeline. For Mondial Relay the API adds the order's shipment number and
recipient postal code to this link. The backend accepts this fallback only
over HTTPS and only on `mondialrelay.fr` (or one of its subdomains), so this
configuration cannot turn the customer link into an arbitrary external URL.
Omit it and the link is simply not shown. See `shippingTracking.service.ts`.

With those API1 credentials configured, each production backend deployment
installs a cron that checks active shipments hourly (while the four-hour
per-shipment cache limits carrier calls to at most six per day): it
automatically moves Point Relais orders to
`disponible` when they are ready for collection and all Mondial Relay orders
to `received` on their delivered event. Its cache/rate-limit behavior is
described in [docs/cron](docs/cron/README.md) (root [CRON.md](CRON.md) indexes it). The tracking cron is intentionally not
installed on preprod.

The contact form sends messages to `EMAIL_CONTACT_RECIPIENT`; optionally set
`CONTACT_RECIPIENT_NAME` for the recipient's display name. Set these in the
relevant target `.env/<target>/.public.env` before deploying. They are
distinct from `EMAIL_NO_REPLY_FROM`, which is the sender address. Leaving the
email blank only disables contact-message delivery outside development; in
local development, submitted contact messages are printed to the server
console.

Set `DISABLE_SPY_EMAIL=true` to suppress all owner/spy copies (new accounts,
logins, orders, payment failures, cart activity, and product requests). It
does not disable customer emails or live-chat email delivery. The default is
`false`.

`ADMIN_CHAT_OWNER_EMAIL_SUPPRESSION_TIMEOUT` controls how long the admin chat
can mute the e-mail sent to the owner when that customer writes (default
`10m`). The server stores the expiry on the conversation, so it resets even if
the admin browser is closed.

1. `npm install`
2. `npm run dev` — starts the local Postgres, then
   `scripts/devWithStripe.ts`: `tsx watch src/server.ts` on
   `http://localhost:3000`, plus (when the Stripe CLI is installed and
   logged in) `stripe listen --all-snapshot --forward-to localhost:<port>/webhooks/stripe`
   and a sync of `STRIPE_WEBHOOK_SECRET` into `.env/dev/.private.env`.
   Without the CLI, the API still starts; only local webhook forwarding is
   skipped. CORS is wide open in dev — it reflects whatever origin a
   request actually comes from, so the front's dev server can run on any
   port without needing to match a fixed value here.
3. Create the schema — same explicit-trigger endpoint as every environment
   (see "Deploying"), driven by `npm run operation` instead of typing the
   curl command by hand (see docs/command):
   ```
   npm run operation -- database-migrate --dev
   ```
   Safe to re-run, a no-op once nothing's pending. To wipe the local DB and
   rebuild from the squashed init migration:
   `npm run operation -- database-reset-and-seed --dev`. This resets the
   schema, applies every migration, then runs the standard aggregate seed;
   the library and courier imports in steps 4 and 5 are therefore already
   complete for that reset path.
4. `npm run library -- seed --dev` — one-off: imports
   [pamsurin-manager](../pamsurin-manager)'s `library/` (JSON + photos,
   plus seeding the `shapes`/`colors` tables from `product/data-common.json`)
   into this DB. Goes entirely through the `/operation/library-import/*`
   API (see [docs/api](docs/api/README.md)), not a direct DB/filesystem connection — `--dev`/`--preprod`/`--prod` is
   mandatory (`dev`/`preprod`/`prod`, picks both the target API and which
   `.env/<mode>/.private.env`'s `OPS_TOKEN` to send), same reasoning as
   `build`'s `--dev`/`--preprod`/`--prod`. Assumes the repos are checked out as siblings; pass
   `-- --source <path>` to override. Safe to re-run: each entry's product-uid
   already present is skipped entirely (set, shapes, colors, photos), never
   duplicated — unless you add `--update`, which pushes any difference from
   the local library onto the existing set (in place, same id) and
   re-uploads its photos only when their ordered count or content hashes differ.

   `library` also has `delete <folder-id-or-product-uid>` (remove one set),
   `delete-all` (full reset — every gallery set **and** the shapes/colors
   vocabulary tables; requires `--confirm`; works with any
   `--dev`/`--preprod`/`--prod`),
   `check` (read-only: reports drift between the local library and this
   DB — not-yet-imported folders, DB rows with no matching folder, and
   per-set field/photo differences), and `stock-report` (read-only: stock
   units by size + total, from the `available` table by default or from
   live order quantities with `--with-orders`/`--not-sent`). See docs/api's
   Library import section for the full command list and each endpoint's
   contract, and docs/command for every flag.

5. `npm run courier -- seed --dev` — one-off: imports
   [pamsurin-manager](../pamsurin-manager)'s `courier/*.json` (shipping
   carriers — Chronopost, Mondial Relay, ...) into this DB, same
   idempotent-by-natural-key pattern as `library` above. See docs/command and
   docs/api's Courier import section. Typical seed order after migrate:
   `library` → `courier` → (optional) `voucher`.

   `npm run seed -- --dev` runs the standard library → courier →
   accessory → cart-rule → payment-method sequence. It accepts `--update --delete`,
   `--direction local|remote`, and `--json`; local direction
   runs library/courier/accessory and explicitly skips cart-rule and
   payment-method because neither has reverse synchronization. See
   docs/command.

6. Voucher source examples — each writes a validated JSON under
   `../pamsurin-manager/voucher` **and** creates it in the selected target:

   ```bash
   # Percentage reduction
   npm run voucher -- init --name summer-15 --quantity 20 --end 30d --percent 15 --dev

   # Direct amount reduction (€5)
   npm run voucher -- init --name five-off --quantity 20 --end 2026-08-31 --amount 5 --dev

   # Free delivery
   npm run voucher -- init --name free-delivery --quantity 20 --end 14d --free-shipping --dev

   # One nail set free up to €15
   npm run voucher -- init --name free-set-15 --quantity 20 --end 30d --free-item 15 --dev

   # Buy 2 nail sets, get the lowest-priced extra nail set free
   npm run voucher -- init --name buy-2-get-1 --quantity 20 --end 30d --free-item-nth 2 --dev
   ```

   See docs/command for the directional `--update`/`--delete` workflow and the
   private local usage report.

To also run the front against this local backend: `pamsurin-front`'s own
`.env/dev/.public.env` already points `VITE_API_BASE_URL` at
`http://localhost:3000` (see its README) — just `npm run dev` there as
usual and the site reads gallery/featured/auth/cart data live from your
local DB.

### Patchright / `npm run test`

Fixture email/PDF renders and live Patchright suites both go through
`npm run test` (see docs/command). Specs live under `src-test/dev/` and
accept **`--dev` only**. Examples:

```bash
npm run test -- --dev --api
npm run test -- --dev --functional
npm run test -- --dev --functional --api
npm run test -- template-email --dev
```

The orchestrator creates a disposable local PostgreSQL database and starts
dedicated back/front processes for the run (the normal dev database and its
servers are never used). It migrates and seeds the current manager library,
then adds the functional E2E catalogue. A functional run with both sizes
starts two environments and runs them at the same time. `--api` and `--load`
each stay on one environment. The run prints a live list reporter, then stops
the processes and drops the databases even when a test fails. HTML reports land
under `output/report/` (`functional-web/`, `functional-mobile/`, `api/`, `load/`,
`coverage/`; hub at `output/report/index.html`). Functional runs retain only their
dedicated Chrome profile at `output/test/browser-profile/`, separate from
developer profiles. The web shop origin is fixed at `http://127.0.0.1:4173`
(`PAM_TEST_WEB_FRONT_PORT` overrides it; mobile side-by-side uses
`PAM_TEST_MOBILE_FRONT_PORT`, default 4174), and its test-only Chrome launch disables
the Local Network Access check so the isolated local backend never produces an
interactive permission prompt.

## Project layout

```
src/
  server.ts / boot.ts / app.ts   entry → boot → Express app
  config/env.ts                  required env vars, fails loudly if missing
  db/
    pool.ts                        pg Pool (+ a date-type-parser fix, see its comment)
    migrations/                    node-pg-migrate files
  api/                             route modules: gallery, auth, account, contact,
                                   libraryImport, courierImport, voucherImport,
                                   operation (migrate, account lock/unlock,
                                   process-account-deletions, …)
  media/storage.ts                 sharp resize pipeline for photo uploads
scripts/                           CLIs, not part of the deployed app process
  build.mjs / library.ts / courier.ts / voucher.ts
  order.ts / user.ts / operation.ts / healthz.ts
  devWithStripe.ts / envFile.ts / cliOutput.ts
```

## Deploying (LWS cPanel, no SSH on this plan)

Front and backend each get their **own subdomain** per environment — e.g.
preprod is `preprod.pamsurin.fr` (front) + `preprod-api.pamsurin.fr` (this
app); prod is the apex domain (front) + `api.pamsurin.fr` (this app). Two
independently deployed things, two entirely separate subdomains/docroots —
deliberately not a shared domain with this app proxied under a `/api` path,
which was tried first and broke: cPanel writes this app's Passenger proxy
rule into whatever `.htaccess` sits at the _front's_ docroot, and the
front's own deploy process overwrites that exact file on every release,
silently deleting the proxy rule. Separate subdomains means separate
`.htaccess` files — nothing to collide, ever. Every route this app serves
(`/gallery/...`, `/auth/...`, `/account/...`, `/webhooks/stripe`,
`/operation/...`, `/healthz`, …) is just at its subdomain's own root, no
`/api` prefix needed (the subdomain itself already says what it is).

1. **PostgreSQL Databases** (cPanel): create a database + user per
   environment (preprod, prod), grant all privileges, note the connection
   details.
2. **Subdomains** (cPanel), two per environment:
   - Front: e.g. `preprod.pamsurin.fr`, document root `public_html/preprod`
     — where the front's versioned build gets FTP-uploaded (see
     `pamsurin-front`'s README).
   - This app: e.g. `preprod-api.pamsurin.fr`. Its document root barely
     matters — cPanel's Node.js Selector will overwrite whatever
     `.htaccess` sits there with its own Passenger proxy config once you
     complete step 3, and nothing real needs to live in that folder. A
     boring default like `public_html/preprod-api` is fine.
3. The API subdomain must exist, but do **not** create a Node.js App manually.
   The first `npm run deploy -- --preprod|--prod` creates the single cPanel
   app automatically at `private_html/<mode>/current`, with the API
   subdomain as its Application URL and `server.js` as startup file.
4. Fill in the real values in `.env/preprod/.private.env`/
   `.env/prod/.private.env` locally (replacing their `CHANGE_ME`
   placeholders — DB connection details from step 1, and a freshly
   generated `OPS_TOKEN`, distinct per environment, long/random enough to
   resist guessing since it's the only thing gating every write).

   Fill in `PUBLIC_DIR`/`PRIVATE_DIR` in `.env/preprod/.public.env`/
   `.env/prod/.public.env` too, once you know the real filesystem paths on
   the server:
   - `PUBLIC_DIR` belongs _inside_ the **front's** docroot (e.g.
     `public_html/preprod`), so Apache serves its contents directly as
     static files — `PUBLIC_MEDIA_DIR` (e.g. `/media`) is joined onto it to
     get the actual photo directory (`config.mediaDir`); `URL_PUBLIC_MEDIA`
     points at that same public path (on the front's domain, not this
     app's — media is never proxied through Node).
   - `PRIVATE_DIR` is the opposite: a filesystem path for generated files
     that must **never** be web-accessible, so it must sit **outside**
     `public_html` entirely (e.g. `private_file/preprod`). It also must NOT
     be inside this app's own release area
     (`private_html/<mode>/vX.Y.Z`, see step 3/5 below) —
     that folder is replaced on every deploy, which would silently delete
     everything in it. `PRIVATE_INVOICE_DIR`/`PRIVATE_SHIPMENT_LABEL_DIR`
     (e.g. `/invoice`, `/shipment_label`) are joined onto it for
     `config.invoiceDir`/`config.shipmentLabelDir`. Create `PRIVATE_DIR`
     once in cPanel's File Manager before the first deploy that needs it;
     nothing creates it automatically (no SSH to run `mkdir -p` remotely).

   Email folder dumps (`DEV_DIR` + `DEV_EMAIL_USER_DIR` /
   `DEV_EMAIL_SPY_DIR` / `DEV_EMAIL_CHAT_DIR`, written by
   `devEmailWriter.ts`): required when `APP_TARGET=dev`, and on preprod
   when folder routing is on (`ROUTE_EMAIL_FOLDER` absent or anything
   other than `false` — set `ROUTE_EMAIL_FOLDER=false` to use real SMTP
   instead). On a deployed preprod host, point `DEV_DIR` under
   `PRIVATE_DIR` so dumps survive release switches. Prod never
   folder-routes (the flag is ignored) and must use SMTP.

   `CORS_ORIGIN` is the front's origin allow-list for that environment
   (comma-separated if needed, e.g. apex + `www`) — genuinely needed now,
   not just defensive, since front and this app are truly cross-origin.
5. `npm run build -- --preprod` (or `--prod`) locally — wipes
   `dist/v<version>/` first (so deleted migrations/`tsc` outputs cannot
   linger), then compiles (`tsc`), copies migrations, `package.json`,
   `package-lock.json`, `.env/.public.env`, `.env/.private.env`, and that
   target's own `.env/<target>/` pair, all straight into `dist/v<version>/`
   (version read from `package.json`, matching the front's own
   versioned-folder convention),
   so it's fully self-contained. `--dev`/`--preprod`/`--prod` is mandatory — same reasoning as
   the front's build script, no silent default. Add
   `--version bump-patch` (or `-minor`/`-major`/an explicit `X.Y.Z`) to
   bump `package.json`'s version before building, e.g.
   `npm run build -- --preprod --version bump-patch`. Then
   deploy with `npm run deploy -- --preprod` (or `--prod`) rather than FTP.
   It uploads the release, moves `current`, installs dependencies, restarts,
   and healthchecks it.
6. The Application Root stays at `private_html/<mode>/current`; deploy sets
   `APP_TARGET` from `.env/<mode>/.lws.env`. Roll back with
   `npm run deploy -- --preprod|--prod --rollback X.Y.Z` (plus `--confirm`
   for prod), which repoints both front and back links and restarts the
   stable backend app.
7. If this deploy adds a migration, run it once: there's no SSH on this LWS
   plan, so instead of a CLI command on the server, hit the app's own
   migration endpoint from your own machine —
   ```
   npm run operation -- database-migrate --preprod
   ```
   (`--prod` for prod; see docs/command — this is just a wrapper around
   `curl -X POST -H "Authorization: Bearer <OPS_TOKEN>" <api-url>/operation/database-migrate`
   if you ever need the raw request). Safe to leave this route deployed
   permanently — gated by `OPS_TOKEN`, and a no-op when nothing's pending.
   Since a code rollback (step 6) can't
   undo a migration, keep migrations additive/backward-compatible (new
   nullable column, new table — never rename/drop something the previous
   version still reads) so an old version stays safe to roll back to. For a
   genuinely breaking schema change, support both old and new shapes across
   two deploys (dual-write/dual-read), then drop the old one once
   confidence is won and rollback is no longer a concern. Returns JSON
   (`{"success":true,...}` or `{"success":false,"error":"..."}`) rather than
   throwing, so failures are readable directly in the `curl` output instead
   of needing a server log.
8. `npm run library -- seed --preprod` (or `--prod`) to push
   [pamsurin-manager](../pamsurin-manager)'s library into that environment's
   DB — same command as local dev, just a different `--dev`/`--preprod`/`--prod`. Likewise
   `npm run courier -- seed --preprod`/`prod` for shipping carriers,
   and optionally `npm run voucher -- seed --dev|--preprod|--prod`.
9. Configure any separate operational jobs you need (for example account
   deletion/card-retention processing or a health monitor). The production
   shipment-tracking cron is installed automatically by a backend deploy.
