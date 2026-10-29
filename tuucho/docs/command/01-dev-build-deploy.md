# Dev, build, deploy

## `npm run seed`

```bash
npm run seed -- [--ssh|--ftp] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod
```

`--ssh` or `--ftp` is required for `--preprod` and `--prod` so the aggregate
command can pass the chosen remote transport to every child import; `--dev`
needs neither. In `remote` direction (the default), runs `library`, `library-user`,
`courier`, `courier-live-state`, `accessory`, `cart-rule`, `payment-method`,
`payment-method-countries`, then `sign-in-method`. Public library, user library,
and accessory read `tuucho/sample/product/library`, `tuucho/sample/product/library-user`, and
`tuucho/sample/product/accessory`. Custom-set (`library-nail`) stays out of this command.
Sample user-library files ship with `"users": []`. On `--dev`, after that import,
unowned user-library products are attached to the sole super-admin. `--dev`/`--preprod`/`--prod` and `--json`
are forwarded to all. `--update` and `--delete` are forwarded to catalogue/
courier imports;
`--delete` requires `--update`. Cart-rule seed keeps its existing idempotent
default-rule upsert semantics and does not delete custom rules. Courier-live-state,
payment-method-countries, payment-method, and sign-in-method seed apply their
public-env defaults to the target database after manager imports where relevant.

In `local` direction, library, courier, and accessory run their reverse
synchronization; library-user and library-nail (remote-import only), courier-live-state, cart-rule, payment-method,
payment-method-countries, and sign-in-method are skipped with
explicit console messages because none has a local mode. Their JSON entries contain
`{ skipped: true, reason }`.
With `--json`, stdout is one aggregate object containing each child result under
`results.library`, `results.userLibrary`, `results.libraryNail`, `results.courier`, `results.courierLiveState`, `results.accessory`,
`results.cartRule`, `results.paymentMethod`, `results.paymentMethodCountries`, and
`results.signInMethod`; child narration remains on
stderr. The command stops at the first failed child.

## `npm run dev`

No arguments. Starts the local Postgres (`docker compose ... up -d`), then
`scripts/devWithStripe.ts`: `tsx watch src/server.ts` (API on
`http://localhost:3010`, `APP_TARGET=dev`). Local webhook forwarding starts
only when this project has a real Stripe secret key (`sk_test_…` or
`sk_live_…` in the Stripe plugin private config or its secret store; the
example placeholder does not count). The CLI is given that key and does not
use a machine-wide `stripe login`. Then it runs `stripe listen
--all-snapshot --forward-to localhost:<port>/webhooks/stripe`.
`--all-snapshot` asks for the classic webhook payload this API verifies.
That wrapper also stores the CLI signing secret in the Stripe plugin secret
store. The platform checkout has no secret, so dev does not contact Stripe.
A user project that provides one does. If the CLI is missing or Stripe
rejects the key, the API still starts without local webhook forwarding.

## `npm run backup-local`

```bash
npm run backup-local -- --ssh|--ftp [--out <dir>]
```

| Flag            | Required | Notes                                                                                     |
| --------------- | -------- | ----------------------------------------------------------------------------------------- |
| `--ssh`/`--ftp` | yes      | Transport used to reach production for the database backup (same meaning as `operation`). |
| `--out <dir>`   | no       | Directory for the zip. Default is `Pam/backup/`, which is never included in the zip.      |

Writes a single archive `tuucho-<version>.zip` whose root is the whole
`Pam/` workspace (`kernel/back`, `kernel/front`, `catalog source`,
`companion shop`, `resources`, and any other siblings under `Pam`).
`<version>` is the **root** `package.json` version. `catalog source` must
carry the same version; the command refuses to run when they disagree, or
when the workspace folder is not named `Pam`.
`companion shop` is included in the archive and is not part of that
version check. Skips `node_modules`, `output`, `dist`, and IDE `.idea` trees
anywhere under `Pam`.

Before zipping it takes a fresh **production** snapshot: it runs
`operation -- database-backup --prod --confirm` (this writes to production and
rotates its archives with the default `--keep`, see
[backup and restore](./03-ops.md#backup-and-restore)), then
`database-backup-fetch` of that archive into `catalog source/backup/`. The
zip carries only that fresh `.tar` from the backup folder; older fetched
archives stay on disk but are left out. If the backup or the fetch fails, no
zip is written. Replaces an existing zip of the same name. Env files are
included as they sit on disk; the command does not print their contents.

## `npm run build`

```bash
npm run build -- --prod|--preprod [--version X.Y.Z|bump-patch|bump-minor|bump-major] [--patch-version X.Y.Z]
```

| Flag                    | Required         | Notes                                                                                                                                                                                                                       |
| ----------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preprod` / `--prod`  | yes, exactly one | `prod` or `preprod` — picks which target's kernel `config/`+kernel private JSON pair gets copied into the build. A silently-defaulted mode risks shipping the wrong one unnoticed, hence no default.                    |
| `--version`             | no               | Either an explicit `X.Y.Z`, or `bump-patch`/`bump-minor`/`bump-major` to increment the **root** `package.json` version automatically (minor/major reset the parts below them). Written back to root `package.json` before building. |
| `--patch-version X.Y.Z` | no               | Names the output folder `dist/vX.Y.Z/` instead of `dist/v<root package.json version>/` — **never** writes `package.json`. Set by `deploy`'s own `--patch` (see below); rarely passed directly. Cannot combine with `--version`.  |

Compiles to `dist/v<version>/`, self-contained (includes `package.json`,
migrations, and only the common + this target's own env files) — upload
as-is. See README's "Deploying" section.

It also bundles the API server (`src/serverEntry.ts` and everything it
imports, `node_modules` included) into a single
`dist/v<version>/bundle/serverEntry.js` with esbuild, which `boot.ts` loads
in place of the module tree. Passenger on LWS stops an idle app after a few
seconds, so most visitors meet a cold start, and reading ~1,200 small files
off the shared filesystem was most of it. Native or self-locating packages
(`argon2`, `sharp`, `canvas`, `pg-native`, `pdfkit`) stay external, listed in
`SERVER_BUNDLE_EXTERNALS` in `scripts/build.mjs`; a package that reads files
relative to its own code must be added there. Those packages are also
imported on first use (an invoice, a gift card, a password check), never at
start: on the LWS host `pdfkit` alone cost ~0.46s of each cold start. A
static `import` of one of them puts that cost back. `boot.ts` also enables
Node's compile cache (`dist/v<version>/.compile-cache/`), so a cold start
reuses the bytecode of the previous one. The unbundled tree stays in the
release for `opsServer.js`, the crons and the pipes.

## `npm run deploy`

```bash
npm run deploy -- --ssh|--ftp --preprod|--prod [--target 'front back'] [--dry-run] [--no-database-migrate] [--no-npm-install] [--reset] [--no-route-admin-token] [--route-admin-token <token>] [--patch X.Y.Z]
npm run deploy -- --ssh|--ftp --preprod|--prod --rollback X.Y.Z [--dry-run]
npm run deploy -- --dev [--reset] [--faker] [--dry-run] [--no-database-migrate]
npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance-prepare --from DD/MM/YY-HH:mm --to DD/MM/YY-HH:mm [--message "..."] [--dry-run]
npm run deploy -- --ssh|--ftp --preprod|--prod --maintenance [--from DD/MM/YY-HH:mm] [--to DD/MM/YY-HH:mm] [--message "..."] [--dry-run]
npm run deploy -- --preprod|--prod --ftp-ops
npm run deploy -- --preprod|--prod --ftp-ops-remove
```

`--ssh` is the original path: rsync over SSH, commands over SSH. `--ftp` exists
because SSH to this host is regularly blocked; it uploads over FTP and runs the
_same_ release, Passenger, CloudLinux, permission, cron and health-check
commands through the standalone PHP gateway at `OPS_GATEWAY_URL`
(`ops-preprod.shop.example` / `ops.shop.example`, published from
`scripts/ops-gateway.php`). `--dev` is local and takes neither flag. See
[Remote transport](README.md#remote-transport) for how the two server-side
pieces differ — the PHP gateway is the only public ops entry; the Node API
never mounts `/operation/*`.

The deploy publishes and verifies that gateway before it builds anything, so an
unreachable host fails in seconds rather than after a full front+back build.
FTP mode requires `FTP_HOST`, `FTP_PORT`, `FTP_USER` and `FTP_PASSWORD` in
kernel private JSON, plus `OPS_TOKEN` for the target.

Uploads stay on FTP over IPv4 (port 21). Gateway and `/healthz` checks use
HTTPS dual-stack curl (no `--ipv4`): some operator networks get
`Connection refused` on IPv4:443 to this host while IPv6 answers. Forcing
IPv4 there aborts an otherwise healthy `--ftp` deploy.

Directories are uploaded as one tarball and unpacked on the host rather than
file-by-file; a release swap is two renames, so a live version folder is never
missing for more than an instant.

### `--ftp-ops` / `--ftp-ops-remove`

`--ftp-ops` and `--ftp-ops-remove` are the **manual** install and removal of
the PHP ops gateway (deploy shell **and** the `--ftp` reverse-proxy of
loopback `/operation/*`). They install **only** that gateway (and its token
file) — no build, no release upload, no restart. Ops CLIs never auto-install
this gateway; without it, `--ftp` on `library` / `operation` / … fails:

| What                                                                  | Where                                    |
| --------------------------------------------------------------------- | ---------------------------------------- |
| `ops-gateway.php` → `index.php`, `ops-gateway.htaccess` → `.htaccess` | `public_html/ops[-preprod]/`             |
| `OPS_TOKEN` (mode `600`, in a `700` directory)                        | `private_html/<mode>/.ops-gateway/token` |

The token lives in its own file rather than in the release's `.env` on purpose.
It leaves the deployed application's configuration untouched — which is what
makes `--ftp-ops` safe against a release built long before this gateway existed
— and it survives a release swap, so rotating `OPS_TOKEN` cannot lock the
transport out of the host it needs in order to publish the new value.

Use `--ftp-ops` when you need the PHP gateway for an FTP deploy or for
`--ftp` ops CLIs without running a full deploy (or to leave it standing after
a prod deploy). Use `--ftp-ops-remove` to take it all back off, including any
loopback operations server the gateway started. Both flags imply `--ftp` and
exit without touching anything else. `--ftp` on `operation`, `library`,
`order`, and the other ops CLIs talks to `OPS_GATEWAY_URL` and does not
install this gateway.

**A `--prod` deploy runs `--ftp-ops-remove` at the end by default**, so
production never keeps a standing shell-or-ops endpoint between deploys — the
gateway is used for the deploy and then taken away. Pass `--ftp-ops` on a prod
deploy to leave it installed instead. Preprod keeps it unless `--ftp-ops-remove`
is passed. After a default prod deploy, `--ftp` ops CLIs fail until you
reinstall the gateway (or use `--ssh`).

There is no `--restore` — to bring a site back out of maintenance, just run a
normal deploy (`npm run deploy -- --preprod|--prod`, no `--maintenance`). It
already rebuilds and uploads the real `dist/.htaccess` as part of what it
always does, overwriting whatever's live regardless of what that was.

`--dev` is local only: no build, no SSH. It runs `database-migrate`, or with
`--reset` wipe → migrate → seed, against the local API. `--faker` then layers
the fixed demo fixture (`tezov.app@gmail.com`, always admin) on top. If that
API is down,
deploy starts Postgres (`docker compose up -d`) and the Node server, waits
for `/healthz`, then stops the process it started. An already-running
`npm run dev` is left alone. `--preprod`/`--prod` still build and rsync to
LWS as below.

Builds and deploys `kernel/front` and/or this repo over SSH to the LWS
host in one command, replacing the manual build + FileZilla workflow both
READMEs' "Deploying" sections describe. Uses the `lws_shop_example` SSH host
alias (see `~/.ssh/config`) via `rsync`/`ssh`, so a working SSH connection
to the LWS account is a prerequisite.

Every targeted repo's `dist/` is deleted and rebuilt fresh every run — no
skip-build flag, deliberately: uploading a stale `dist/` built for the
another target (or an older version) would ship the wrong environment's
config/CSP/API origin without anything catching it.

| Flag                                                | Required                             | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--preprod` / `--prod` / `--dev`                    | yes, exactly one                     | `preprod` or `prod` uploads to LWS. `--dev` skips upload and operates on the local API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--target 'front back'`                             | no, default `front back`             | Space-separated subset — `front`, `back`, or both. Rejected with `--dev`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--dry-run`                                         | no                                   | Prints every build/rsync/ssh/operation command it would run, without running any of them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--no-database-migrate`                             | no                                   | Skip the `operation -- database-migrate` call that otherwise always runs after uploads. Cannot combine with `--reset`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--no-npm-install`                                  | no                                   | Skip the remote `npm install` that otherwise always runs after a back upload, before the restart.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--reset`                                           | no, `--dev` or `--preprod`           | Runs `operation -- database-reset` → `operation -- database-migrate` → `seed` after uploads (or immediately on `--dev`), instead of a plain migrate. Blocked on `--prod`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--faker`                                           | no, `--dev` or `--preprod`           | After migrate (or reset+seed), runs `npm run faker -- seed --<mode>` to layer the fixed `tezov.app@gmail.com` demo fixture on top. Blocked on `--prod`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `--no-route-admin-token`                            | no, `--preprod` or `--prod`          | Keep the admin front route at the normal `/admin`. Cannot combine with `--route-admin-token`; requires a front deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--route-admin-token <token>`                       | no, `--preprod` or `--prod`          | Use this exact admin-route segment instead of a fresh random 6-digit one — the admin front is then at `/<token>/admin`. It must be 1-64 letters/digits/hyphens/underscores, cannot combine with `--no-route-admin-token`, and requires a front deployment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--patch X.Y.Z`                                     | no, not with `--dev`/`--maintenance` | Builds current source and deploys it under `vX.Y.Z` instead of each repo's own `package.json` version — neither `package.json` is touched. See "Patch deploys" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `--rollback X.Y.Z`                                  | no, `--preprod` or `--prod`          | Switches both front and back `current` links to the retained `vX.Y.Z` release, restarts the stable Node app, and healthchecks. It never builds, uploads, migrates, seeds, or modifies data. It always rolls front and back together, so do not pass `--target`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--maintenance-prepare --from ... --to ...`         | no                                   | Bakes the maintenance-window banner into a real build+deploy — front only, `--from`/`--to`/`--message` pass straight through to `kernel/front`'s `npm run build -- maintenance-prepare` (see its own `COMMAND.md`). Combinable with `--target`. Not valid with `--dev`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--maintenance [--from ... --to ... --message ...]` | no, not with `--dev`                 | Skips the whole build/upload/database-ops pipeline. Builds only `kernel/front`'s standalone lockdown page (`npm run build -- maintenance`, front-only — `--target` is ignored) and **immediately swaps the live `public_html/<mode>/.htaccess`** to it — the site goes down as part of running this command, no separate activation step. `--from`/`--to`/`--message` are all optional (unlike `--maintenance-prepare`, where `--from`/`--to` are required) and get baked as plain text into the lockdown page itself, so a visitor hitting it isn't left guessing when the site is expected back. Cannot combine with `--maintenance-prepare`, `--reset`, `--faker`, `--no-database-migrate`, or `--no-npm-install`. There is no `--restore` flag — to bring the site back, run a normal deploy (no `--maintenance`); see "Maintenance lockdown" below. |

Deploy layout:

- **front** → uploads `dist/v<version>/` then atomically switches
  `public_html/<mode>/current → v<version>`; its stable `.htaccess` always
  routes through `current`. Production also uploads the generated dynamic
  sitemap relay `dist/sitemap-products.php` to `public_html/`; preprod does
  not produce that file and explicitly returns `404` for both sitemap paths.
- **back** → uploads `dist/v<version>/`, atomically switches
  `private_html/<mode>/current → v<version>`, then restarts the one stable
  cPanel Node.js App rooted at `private_html/<mode>/current` and waits for
  `/healthz`. An `--ftp` back deploy then restarts the loopback opsServer
  through the PHP gateway (`POST /control/ops-start`) so
  `database-migrate` talks to this release rather than spawning Node inside
  the migrate request. Release folders are retained for rollback.

For a combined deploy, the active backend is stopped before either `current`
link moves. The order is: stop API → upload/switch front → upload/switch back
→ create or update the stable Node.js App → npm install → restart → health
check. This intentionally creates a short outage so front and back never
serve different releases.

**Rollback.** Run `npm run deploy -- --preprod --rollback X.Y.Z`. It verifies that both retained release folders exist,
switches both `current` links atomically, restarts the stable backend app,
and healthchecks. Database migrations are never reversed: keep them additive
and backward-compatible with the release you may return to.

**Node.js App creation.** Before uploading, `deploy` queries cPanel's live
Node.js Selector state (`cloudlinux-selector get --interpreter nodejs
--json`). It keeps one application at `private_html/<mode>/current`. When
none exists for that environment, it creates it automatically with the API
subdomain, `server.js`, production mode, the newest available Node version,
and leftover process env (`APP_TARGET`). When upgrading an old version-rooted app, it
clones its cPanel settings onto `current` once. The API subdomain itself must
already exist in cPanel; no manual “Setup Node.js App” step is required.

Still manual: bumping either repo's own `package.json` version itself
(`npm run build -- --version bump-patch`, run separately before
`deploy`, or let `deploy` build against whatever version is
already current).

**HTTP compression.** The shop front (`kernel/front/public/.htaccess`)
terminates transfer compression at Apache with pre-compressed `.gz`
siblings (the host edge strips `Accept-Encoding`, so `mod_deflate` cannot
negotiate). The JSON API enables Express `compression` middleware
(gzip/br, threshold 1 KB) in `src/app.ts` for API responses on the Node
host, where Apache does not compress Passenger output the same way.

**Direct Node binary.** The selector points `PassengerNodejs` at
`~/nodevenv/<app>/<major>/bin/node`, a symlink to CloudLinux's
`node_wrapper`, a bash script that runs a Python helper on every process
start just to export the app's env-vars: measured on the LWS host
(2026-10-06), 1.09s to start Node through it against 0.26s without, and
Passenger there stops an idle app after a few seconds. Each back deploy
therefore appends a block to the API subdomain's `.htaccess`, between
`# BEGIN TUCHO DIRECT NODE, managed by scripts/deploy.ts` and
`# END TUCHO DIRECT NODE`, after the selector's own: a `PassengerNodejs`
naming `/opt/alt/alt-nodejs<major>/root/usr/bin/node` (same major as the
nodevenv), then one `SetEnv` per key of leftover process env (`APP_TARGET`), since the
selector's own `SetEnv` block only applies under LiteSpeed. The block is
rewritten on every deploy, before and after the selector restart; a value
that is not a plain token fails the deploy instead of being quoted, and if
the real binary is missing the block is left out and the wrapper is used as
before. A `cloudlinux-selector restart` outside a deploy (the keep-warm
cron's restore path) can drop the block; the app keeps working through the
wrapper until the next deploy writes it back.

**cPanel leftover process env.** Deploy SetEnv is only `APP_TARGET` (the
config folder) and optional `PORT`. Product keys live in uploaded kernel
`config/` and plugin settings/secrets, not in cPanel env-vars. Every back
deploy pushes that leftover set via `cloudlinux-selector set --env-vars`
(existing app) or bakes it into the first `create` call. Live keys that are
not leftover are removed. `set` is issued against a real `current`
directory; CloudLinux resolves a stopped app's App Root, so a
`current → vX.Y.Z` symlink would make it look up a version folder that is
not the registered application. The release symlink is restored immediately
after. A no-op when the live set already matches.

**Production crons.** Every `npm run deploy -- --prod` that includes the
backend installs or refreshes marked cPanel cron entries for shipment
tracking, account deletion, guest-saved cleanup, loyalty, gift, gift purge,
payment-auth-expiry, and keep-warm. Each calls a stable
file under `~/bin/main-cron-*.sh`, refreshed with the deployed release path.
Preprod deploys never install these crons. An `--ftp` prod deploy can hit a
LiteSpeed 503 on `ops.shop.example` right after the API restart (the account
LVE is still busy). Deploy waits for the gateway `/healthz` and retries
`/control/exec` until it returns JSON.

**Patch deploys (`--patch X.Y.Z`).** Overrides which release folder both
builds target, in place of each repo's own `package.json` version — neither
`package.json` is touched. Use it to re-push current
source into an already-live version without a real version bump: e.g.
`package.json` is at `0.9.6` but preprod is still serving `0.9.5` —
`npm run deploy -- --preprod --patch 0.9.5` builds current `HEAD` as
`dist/v0.9.5/`, uploads it as that retained release, and switches `current`
to it (env-vars synced, `npm install`, restart, `/healthz` poll). Not valid with
`--dev` (nothing to build/target) or `--maintenance` (skips the build
entirely).

**Admin access path.** Every front deployment for `--preprod` and `--prod`
generates a separate random 6-digit admin path segment and prints the final
admin URL. It is baked only into the front bundle, so admin routes move from
`/admin/...` to `/<admin-token>/admin/...`; all API endpoints stay unchanged
and still require server-side admin authorization. On preprod the URL is
`https://preprod.shop.example/<admin-token>/admin`. On prod it is
`https://shop.example/<admin-token>/admin`. Use `--route-admin-token <token>`
to choose it, or `--no-route-admin-token` to keep `/admin`. A backend-only
deployment does not alter the already deployed front route.

**Maintenance lockdown.** `--maintenance` is a separate, lightweight mode —
it never touches the normal build/upload/database-ops flow above. It builds
`kernel/front`'s `dist/maintenance.html` + `dist/maintenance.htaccess` (see
its own `COMMAND.md`), uploads `maintenance.html` next to the live version,
then overwrites the live `public_html/<mode>/.htaccess` with the maintenance
one — every request to that domain now serves the lockdown page. It does not
rebuild or re-touch the versioned app files, which stay on the server
untouched throughout the whole window.

There is no `--restore` flag. Getting back out of maintenance is just a
normal deploy — `npm run deploy -- --preprod|--prod` (no `--maintenance`) —
which already rebuilds and uploads the real `dist/.htaccess` as part of what
it always does, overwriting whatever's live regardless of what that was. An
earlier version of this feature had a dedicated `--restore` that swapped
`.htaccess` back from a saved local copy instead; it was dropped because
that copy depended on `dist/.htaccess` surviving untouched from the last
real build until whenever someone got around to restoring — a routine `rm
-rf dist` (even one unrelated to maintenance) silently broke it, which
blocked the one thing standing between the live site and staying down. A
normal deploy has no such dependency: it rebuilds everything itself, always.

`--maintenance-prepare` is unrelated and much lighter-weight — it doesn't
take the site down at all, it just bakes an in-app banner
(`MaintenanceBanner.tsx`) into a normal deploy, so the two cannot be
combined.

## `npm run typecheck`

No arguments. Runs TypeScript in validation-only mode (`tsc --noEmit`); it
does not build `dist/` or change source files.

## `npm run check:architecture`

No arguments. Validates module dependencies, import cycles, API module wiring
roots, domain purity, string-error envelope bans on routers, the leaf-router
stage ceiling (350) plus individual oversized-router ratchets, and current
compatibility-service file-size ratchets. Rules are documented in
[Backend architecture](../architecture/README.md#enforced-dependency-rules).

## `npm run sync:ratchets`

No arguments. Lowers every size ratchet in `scripts/checkArchitecture.mjs` to
what its file now measures, and prints each reduction.

The ratchets are **one-way**. `check:architecture` fails when a ratcheted file
grows past its number, and now also when it has shrunk below it, because a
ceiling set at today's line count prevents growth and nothing else: a
1,396-line file would otherwise stay a permanent 1,396-line read. Failing on
slack turns every entry into a valve that only ever closes.

So the flow is: split a file, run this, commit the smaller numbers. Raising a
number stays a deliberate edit that shows up in review.

`tuucho/kernel/front` has the same command for its route ratchets.

## `npm run check:docs`

No arguments. Validates that every `package.json` command is covered by the
command reference, every explicitly declared long CLI flag appears in that
reference, documented `npm run` names exist, local Markdown links resolve, and
every path referenced by [`docs/features.json`](../features.json) exists
(front routes are resolved under `tuucho/kernel/front`).

## `npm run config:migrate`

`--dry-run` optional. Copies `tuucho/factory-backup/config/` → `tuucho-config/`
on first install (public + examples; private from example). Copies
`tuucho/factory-backup/plugins/` → `src/plugins/` when that folder is missing.
If `tuucho-config/` exists, applies pending kernel and plugin JSON steps
(add / rename / drop) and fills missing public keys from factory. Never writes
plugin DB. Apply never writes `tuucho-config/` or `src/plugins/`. Same at clone
root: `npm run config:migrate`.

## `npm run config:doctor`

No arguments. Reports `tuucho-config/kernel/` merge / required private keys /
env files (from that tree’s `environments` map, or folder/name discovery),
plus the resolved output directory (`paths.outputDir`, default
`<clone root>/output`). Warns when migrate stamp is behind factory or when
the common file has no `environments` map. Example files are never listed in
the map: each is the `.example` sibling of the private path
(`dev/config.private.json` → `dev/config.private.example.json`). Does not
copy files.

## `npm run config:env`

`create <name>`. Creates `tuucho-config/kernel/<name>/` from the factory
`dev` env (public + non-empty private example) and appends
`environments.<name>` in `tuucho-config/kernel/config.json` with folder-style
paths. Fails when that public file already exists. Empty `{}` examples are
skipped.

## `npm run factory-sync` / `npm run factory-sync:check`

Pack scripts (`node tuucho/scripts/factory-sync.mjs`). Same idea as `versioning`:

- `npm run factory-sync` copies live `tuucho-config/` →
  `tuucho/factory-backup/config/` and live `src/plugins/` →
  `tuucho/factory-backup/plugins/`. Skips live secrets
  (`config.private.json` / `config.private.<env>.json`), maps `plugins.json` →
  `plugins.example.json`. Never touches `factory-backup/migrations/`
  (`config:migrate` steps for publishers; see
  `tuucho/factory-backup/migrations/kernel/.example.json`).
- `npm run factory-sync:check` (also
  `npm --prefix tuucho/kernel/back run check:factory-sync`) fails when factory
  backup drifts. Part of `npm run check`.

Run `factory-sync` in the same turn you change `tuucho-config/` or
`src/plugins/` in this product repo. First install still copies factory → live;
this command is the reverse (live → factory) for publishers.

## `npm run check:release`

No arguments. Read-only. Part of `npm run check`. Runs
`node ../../scripts/tuucho-versioning.mjs --check` (from `tuucho/kernel/back`) so
`tuucho/tuucho-versioning.json` matches the **root** `package.json` version,
kernel migration names, and every bundled plugin `package.json` under
`tuucho/plugins/` plus `tuucho/plugins/manifest.json`. `kernel/back`,
`kernel/front`, and `plugin-sdk` `package.json` must not carry a `version`.
Drift fails CI. Write the catalog with `node tuucho/scripts/tuucho-versioning.mjs`
(no `--check`) before tagging. Last-applied stamp is gitignored shop-instance
`tuucho-versioning.lock.json` (setup / Apply write it locally; missing lock is
not a boot error). Git tags are `MAJOR.MINOR.PATCH` with no `v`
prefix. Historical tags may still publish `release.json` or
`tuucho-release.json`; Check/Apply fall back.

## `npm run test:unit`

No arguments. Runs every unit test under `src-test/unit-test/**/*.test.ts` on
Node's built-in test runner (no test framework dependency). Part of
`npm run check`. Unit tests must not live under `src/`; architecture check
rejects colocated `*.test.ts`.

Two kinds of test live here, and both finish in about a second:

- **Domain tests**, under `src-test/unit-test/modules/*/domain/` (mirroring
  `src/modules/*/domain/`). Those modules have no Express, `pg`, filesystem,
  provider SDK or global config, so these are plain function calls. This is
  where order-status transitions, gift budget arithmetic, PIN backoff, loyalty
  expiry dates and country matching are pinned down.
- **HTTP-surface tests** in `src-test/unit-test/app.test.ts`. They mount the
  real composed app with `createApp()` on an ephemeral loopback port and cover
  the guards that run before any handler reaches the database: authentication,
  CORS, the raw Stripe webhook body, the sanitized error envelope, and the fact
  that `/operation/*` is not mounted publicly.

Neither kind touches PostgreSQL, Stripe or the network, which is what keeps
them fast enough to run on every change.

`APP_TARGET` defaults to `dev` so the layered env loads for app-surface tests.
Add a new unit test under `src-test/unit-test/`, mirroring the `src/` path;
`npm run check:architecture` gives those files a 400-line ceiling.

`npm run test` is an alias of `npm run test:unit`. Front unit tests are
`npm --prefix tuucho/kernel/front run test`.

## `npm run typecheck:tooling`

No arguments. Read-only. Part of `npm run check`.

`npm run typecheck` covers `src` only, so a type error in a build script, an
operations CLI or a test never surfaced until the thing ran. This typechecks
the tooling and tests through `tsconfig.check.json`.

It covers `src`, all of `scripts/`, and `src-test/unit-test`. Its `exclude` list is a
**ratchet**: every entry is a file with pre-existing errors. Fix them and remove
the entry; never add one.

Turning it on found two real defects on the first run: five call sites in
`scripts/accessory.ts` invoked an undefined `usageError`, which would have
thrown `ReferenceError` instead of printing a usage message, and
`scripts/chat.ts` reads `closing`, `orphan` and `visitorLive` off a session
payload that the ops endpoint does not send, so its orphan tagging never fires.
The first is fixed. The second is a behaviour question and is left reported.

## `npm run sync:errors` / `npm run check:errors`

No arguments. `sync:errors` regenerates
[`docs/api/errors.json`](../api/errors.json); `check:errors` fails when it is
stale and runs as part of `npm run check`.

The catalogue lists all 85 error codes the API can return, with the HTTP
statuses each is returned with, the backend files that emit it, and the
front-end files that branch on it (47 of the 85 today).

Read it before inventing a code for a new failure branch: it is the whole
vocabulary in one place, which is what stops a synonym being added for a
meaning that already has a code.

## `npm run change`

```bash
npm run change -- field <table> <column> [--type text] [--not-null] [--default <sql>]
npm run change -- endpoint <feature> <METHOD> <path>
```

`scaffold` starts a **new** feature. This covers the two changes that recur
inside an existing one, each of which spans up to eleven artifacts that are only
half machine-checked.

`field` validates the table and column against `docs/schema/tables.json`
(unknown table, column that already exists, `--not-null` without a
`--default`, which would break the previously deployed version), then writes a
dated, additive migration stub in `src/db/migrations/`. It never overwrites.

`endpoint` validates the feature against `docs/features.json` and the
method/path against `docs/api/routes.json`, then prints that feature's module,
API document, front API module, i18n namespaces and test directories.

Both then print the remaining steps in dependency order, each naming the command
that proves it. A step no check covers says so, because those are the ones that
get skipped.

## `npm run scaffold`

```bash
npm run scaffold -- <feature-name> [--dry-run]
```

Creates the skeleton of a new capability: the four backend layers, a router,
the module-root re-export, a dated migration stub, a domain test, and a
front API client. Names are lower-case kebab-case.

It never overwrites. An existing file is reported and left alone, so re-running
after a partial scaffold is safe.

It deliberately stops short of the steps that need a decision: mounting the
router, the migration body, the `docs/api/` and `docs/schema/` sections, the
`docs/features.json` entry, and the front route. It prints that list on exit.
The `tuucho-feature-new` skill under `.agents/skills/` carries the full
order of work.

## `npm run sync:module-docs`

No arguments. Writes `src/modules/<name>/README.md` for every module: its tier,
which modules it may import and which it actually imports, the routes it serves,
its layer sizes, and its feature-map entry.

Entering a module used to show a list of filenames and nothing else. Everything
else had to be re-derived by reading the code.

The generated part cannot drift because it is regenerated from the tier table,
the route inventory and the imports themselves. Below the
`<!-- invariants:start -->` marker is hand-written and preserved: that is where
the rules a change must not break are stated, which is the part no generator can
know.

## `npm run check:module-docs`

No arguments. Read-only. Part of `npm run check`. Fails when a module README is
out of date or its generated half was edited by hand.

## `npm run context`

No arguments. Prints, per feature, how many lines a change to it must read:
its backend module, the documentation that must stay in step, the front files
that consume it, and the shared front modules those files import.

Shared front code (`src/hooks`, `src/state`, `src/utils`) is resolved from the
imports the feature's own front files actually write, one hop deep. The
transitive closure is not used: follow it and every feature reaches 20-50k
lines, because `AuthContext` imports `useCart` and the graph swallows the app.
Nobody reads it that way. A shared module is charged to every feature that
names it, which is the intended incentive — a hook used by six features costs
six budgets, and shrinking it pays back six times.

Tests are shown but not counted: they are what you run, not what you read, and
counting them made the budget punish adding a test. A module's own `README.md`
is not counted either, because orientation is read instead of code. Only
`docs/` counts, being contract documentation a change must keep in step.

This is the number that decides what a change costs an agent. It is kept as a
budget in [`docs/features.context.json`](../features.context.json) and checked,
because a feature that quietly grows past its ceiling has become expensive to
change and that should fail a check rather than be discovered by running out of
context.

## `npm run check:context`

No arguments. Read-only. Part of `npm run check`.

Fails when a feature needs more context than its budget in
`docs/features.context.json`, **and** when it needs less, because a budget left
above what a feature now costs is slack that quietly permits the next
regression. Run `npm run sync:context` to lock a reduction in.

Lower a budget by splitting a feature, moving shared code down a tier, or
shrinking a shared front module. Raising one is not a fix.

`tuucho/kernel/front` runs this same check through its own `npm run check:context`,
which matters because the front is the larger half of 9 of the 15 features.


## `npm run sync:context`

No arguments. Rewrites the budgets to what the code currently needs. Run it
after a change that genuinely reduces a feature's reach.

## `npm run where`

```bash
npm run where -- <query> [--module <name>] [--front] [--json]
```

Read-only. Answers "where is the code that does X" in one lookup instead of
several greps.

```bash
npm run where -- cancel                # every exported symbol matching
npm run where -- "cancel order"        # all words must match name or path
npm run where -- cancel --module orders
npm run where -- useCart --front       # search tuucho/kernel/front instead
```

Each result prints the signature, `file:line`, the owning module and layer,
and how many files import the symbol. Exact name matches rank first, then name
over path matches, then how widely the symbol is imported.

The index is cached under `<outputDir>/cache/` (`paths.outputDir`, default
`<clone root>/output`) and rebuilt whenever a source file is
newer than it, so it cannot go stale. It is deliberately not a committed
artifact with a `check:` guard: `routes.json` and `tables.json` describe
contracts other code depends on, this is only a lookup.

`npm run feature` answers a different question, which files a feature spans.
Start there for a task, come here for a symbol.

## `npm run feature`

`npm run feature` lists every capability in
[`docs/features.json`](../features.json). `npm run feature -- <name>` prints
that one capability's whole map: its API and schema documentation, its backend
module with a per-layer file count, every route it serves with the guard chain
on each, the front routes, API clients, components and i18n namespace that
consume it, its operational commands, and its tests.

Read-only, no target flag, nothing started. `--json` prints the same map as one
object on stdout.

Routes are read from [`docs/api/routes.json`](../api/routes.json) and attributed
by owning module, so they cannot drift from the running app. Everything else
comes from `docs/features.json`, and `npm run check:docs` verifies every path,
package script and i18n namespace named there still exists.

This is the intended first command of a task: it replaces the several rounds of
search otherwise needed to find what one change touches.

## `npm run sync:contract`

No arguments. Copies `src/contract/` to
`tuucho/kernel/front/src/api/contract/`, rewriting NodeNext `./x.js` specifiers
to the extensionless form the front's bundler resolves. That is the only
transformation.

`src/contract/` is the one description of the payload shapes this API sends
and accepts. The backend compiles against it and the front consumes the copy,
so a field added, renamed or retyped is a compile error on both sides instead
of a shape the browser discovers. Before this, the front hand-wrote 147 of its
own payload types and nothing compared them to anything.

Deletes a front copy whose backend source is gone.

## `npm run check:contract`

No arguments. Read-only. Part of `npm run check`. Fails when:

- a front copy is missing, stale, or was edited by hand;
- a front copy has no source under `src/contract/`;
- **backend adoption fell.** A contract type no backend file imports is
  decorative: the front would be typed against a shape nothing on this side
  asserts. The number of contract types actually imported by backend code is
  ratcheted in `src/contract/.adopted`. It may rise and never fall.

Only a real `import type ... from '.../contract/...'` counts. A backend type
that merely shares a name proves nothing.

To adopt a type, give the presenter or domain declaration that produces the
payload the contract type: `toPublicCartItem(row): CartItem`, or
`export type PublicUser = AuthUser`. Typecheck then reports every real
disagreement. Doing this to the cart presenter alone surfaced three: a size
column typed wider than the published vocabulary, and two `Date` fields the
presenter declared as dates while the wire carries ISO strings.

## `npm run sync:api-reference`

No arguments. Regenerates
[`docs/api/09-reference.md`](../api/09-reference.md): every route with its
method, path, access guards, owning feature and handler file, from
`docs/api/routes.json`.

Restating that by hand is work that can only go stale, so it is generated. The
other files in `docs/api/` keep what a generator cannot know: why an endpoint
behaves as it does, what a field means, which failure modes matter.

Run it after `npm run sync:routes`.

## `npm run check:api-reference`

No arguments. Read-only. Part of `npm run check`. Fails when the generated
reference is out of date or was edited by hand.

The generated file is deliberately excluded from `check:routes`: it names every
route by construction, so counting it would make that check pass trivially. A
route still has to earn a hand-written explanation.

## `npm run sync:policy`

No arguments. Rewrites every embedded copy of a hard rule from its one source,
[`docs/policy/hard-rules.md`](../policy/hard-rules.md).

Embeds are intentional and limited: the full set in the repository-root
`AGENTS.md`, and high-urgency or glob-scoped rules in `.cursor/rules/*.mdc`.
See the consumer table in `tuucho/docs/policy/hard-rules.md`.

A consumer marks where a rule goes:

```markdown
<!-- policy:no-dashes-in-copy start -->
<!-- policy:no-dashes-in-copy end -->
```

Add an empty marker pair and run this command to fill it. Edit a rule only in
the source file.

## `npm run check:policy`

No arguments. Read-only. Part of `npm run check`. Fails when an embedded copy
was edited by hand, when a marker names a rule the source does not define, or
when a root `CLAUDE.md` is present (policy is `AGENTS.md` only).

## `npm run sync:schema`

No arguments. Introspects the **local dev database** into
`docs/schema/tables.json`: every table, column, type, nullability, default,
primary key, unique constraint, foreign key, index and check constraint, plus
the list of migration files it was taken after.

This is the only schema command that needs a database. Run it in the same turn
as any migration, right after `npm run operation -- database-migrate --dev`.

It also writes **`src/db/rows.ts`**: one TypeScript interface per table, plus a
`Rows` map and a `MatchesTable` helper. Both files are generated. Do not edit
either by hand.

`rows.ts` encodes how a column actually arrives through `src/db/pool.ts`, which
is not how Postgres describes it: `date`, `timestamptz`, `numeric` and `bigint`
are strings, because the pool keeps them as the text Postgres sent rather than
losing precision to a JS `Date` or a float. That is the knowledge each of the
215 hand-written row types had to get right on its own.

Use it either way round:

```ts
// Type a query by the columns it selects.
await pool.query<Pick<Rows['orders'], 'id' | 'status'>>(`select id, status from orders ...`);

// Or keep a documented hand-written row type and prove it still matches.
const _orderRowMatchesTable: MatchesTable<OrderRow, 'orders'> = true;
```

The second form is for row types worth keeping by hand, whose comments say why
a column is nullable. It fails with the offending column named:
`Type 'boolean' is not assignable to type ["column is not on the table", "guest_email_lookupz"]`.

`src/db/.adopted` records how many files import `rows.ts`; `check:schema` fails
when that count falls, so replacing the hand-written types is a one-way street.
Put such an assertion in a `*.test.ts` file: `domain/` may not depend on
persistence, and the context budget should not charge a feature for a guard
nobody reads.

## `npm run check:schema`

No arguments. Read-only, needs **no** database. Part of `npm run check`. Fails
when:

- a migration file exists that `docs/schema/tables.json` was not taken after,
  which is how the snapshot goes stale (run `npm run sync:schema`);
- the snapshot names a migration that is no longer on disk;
- a table in the snapshot is named in no `docs/schema/` section, so nothing
  explains what it stores.

## `npm run check:sql`

No arguments. Read-only, needs no database. Part of `npm run check`.

Reads every SQL template literal under `src/` and validates it against
`docs/schema/tables.json`:

- every table named after `from` / `join` / `into` / `update` / `delete from`
  must exist, unless it is a CTE declared in the same statement, a Postgres
  catalog (`pg_*`), or a table name built at runtime;
- every `alias.column` reference must exist on the table that alias was bound
  to in the same statement.

It reports how many references it could not resolve rather than passing over
them silently. A failure names the file, the line, and the table to inspect.

This is the check that makes a renamed column fail at `npm run check` instead
of in production: `tsc` cannot see inside a template literal.

## `npm run check:env-docs`

No arguments. Read-only. Part of `npm run check`.

Fails when documentation states a number for an environment variable that
kernel `config/` does not hold. It reads the form
`` `GIFT_MAX_BUDGET_CEILING`, currently 150 € ``: the variable name and the
value have to sit close together, so merely mentioning a variable is not read
as a claim about it.

`docs/plans/` is excluded, because a plan describes behaviour that was not
shipped yet or has since moved on.

Write `currently`, not `default`. These values are required in the environment
and have no code default to fall back on; calling one a default is what made
the last drift invisible, when the gift budget ceiling moved from 500 EUR to
150 while the code constant and four documentation lines still said 500.

## `npm run table`

```bash
npm run table                  # every table, with its owning module
npm run table -- <name>        # one table in full
npm run table -- <name> --json
```

Read-only, needs no database. Prints one table in about twenty lines: columns
with types, nullability and defaults, primary key, foreign keys out, the tables
that reference it, unique constraints, indexes, check constraints, and the
source files that query it.

Use it instead of reading a `docs/schema/` section or a migration when the
question is "what columns does this table have".

## `npm run sync:routes`

No arguments. Regenerates [`docs/api/routes.json`](../api/routes.json), the
machine-readable map of every HTTP route this service serves.

It does not scan router files. It mounts the real composed app in process
(`createApp()` from `src/app.ts`, plus `mountOpsRoutes()` for the loopback ops
surface), walks the Express stack, and records each route with the file that
registered it and the middleware chain that guards it. No port is opened and no
database is queried, so it is safe to run any time.

Run it after adding, removing, renaming, or re-mounting any route.

## `npm run check:routes`

No arguments. Read-only. Part of `npm run check`. Fails when:

- `docs/api/routes.json` no longer matches the routes the app actually serves
  (run `npm run sync:routes`);
- a live route is named nowhere in `docs/api/`;
- `docs/api/` spells out a route that no longer exists.

Documentation headings may group siblings (`\`GET\` / \`PUT /gift/:token/destination\``)
or elide a shared prefix (`\`GET /admin/loyalty/users/:userId/wallet\` / \`…/ledger\``);
both forms are understood. A route recovered from the elided form counts as
documented but is never used to claim a documented route is missing.

## `npm run sync:sharecard`

No arguments. Regenerates kernel/front share-card copies from the back
canonical sources under `src/modules/gift/infrastructure/shareCardArt/` and
related theme files, plus gift comment ceilings in front `fieldLimits`.

Writes:

- `tuucho/kernel/front/src/components/gift/shareCardArt/{classic,occasion,myth}.ts`
- `tuucho/kernel/front/src/components/gift/shareCardArt.ts`
- `tuucho/kernel/front/src/components/gift/giftShareCardThemes.ts`
- gift comment constants in `tuucho/kernel/front/src/utils/fieldLimits.ts`

## `npm run check:sharecard`

No arguments. Diffs the generated front artifacts against what is committed
(`scripts/syncShareCard.mjs --check`). Regenerating must clear occasion.ts and
theme drift. Part of `npm run check`.

## `npm run check`

No arguments. The default read-only pre-review gate: runs `typecheck`,
`check:architecture`, `check:docs`, `check:routes`, `check:api-reference`,
`check:module-docs`, `check:policy`, `check:contract`, `check:context`,
`check:sharecard`, `check:release`, `check:factory-sync`, `lint`, then
`test:unit`. It stops at the first failure. It does not create a database or
run the API/browser suites. `test:unit` briefly binds an ephemeral loopback
port to exercise the composed app in process, and touches neither PostgreSQL
nor any external service.

## `npm run check:all`

No arguments. Read-only. Runs this repository's `npm run check`, then
`npm --prefix tuucho/kernel/front run check`.

A cross-repository change has to satisfy both gates, and the cross-repo checks
live one on each side: `check:contract` and `check:routes` here,
`check:api` and `check:screens` there. Running one and not the other is how a
contract change ships half-verified.

About 17 seconds. Skip it for a change confined to one repository.

## `npm run lint`

No arguments. `oxlint` over the repo.

## `npm run format`

No arguments. `prettier --write` over `src/**/*.ts` and `*.json`.

Unlike the checks above, this command writes formatting changes. In a dirty
worktree, format only the files in scope with Prettier directly so unrelated
work is not rewritten.

## `npm run ops-gateway`

Internal long-running entry point; no CLI arguments. It starts the standalone
HTTP form of `src/opsGateway.ts` on `PORT`/`APP_PORT`. The current deployment
does **not** run this package script and the public API must never mount it.
`--ftp` uses the PHP gateway at `OPS_GATEWAY_URL`. Keep this only as the
documented escape hatch for a future dedicated ops process; normal development
and operations use `--dev`, `--ssh`, or `--ftp` as above.
