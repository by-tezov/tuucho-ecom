# Ops CLIs

Every command here that targets `--preprod` or `--prod` also needs a transport
flag, `--ssh` or `--ftp`; `--dev` needs neither. See
[Remote transport](README.md#remote-transport).

## `npm run chat`

Account-owned contact chat (connected users only — guests use the plain
contact form): list sessions, reopen a closed one, drain the notification
outbox, and answer live. There is no enablement switch, schedule, or reply
timeout — sessions stay open until the customer or the owner closes them,
and closed sessions are kept indefinitely (no cleanup/expiry command).

```text
npm run chat -- --dev|--preprod|--prod            # pick open session (↑↓ + Enter)
npm run chat -- sessions [--status open|closed|all] --dev|--preprod|--prod
npm run chat -- reopen <SESSION_ID> --dev|--preprod|--prod
npm run chat -- notifications process --dev|--preprod|--prod
npm run chat -- <SESSION_ID> --dev|--preprod|--prod              # interactive owner chat
```

All commands call `/operation/chat/*` with `OPS_TOKEN`.

**Interactive chat (preferred for answering):**

```bash
npm run chat -- --dev
```

Lists open sessions; use ↑↓ then Enter to join one (`q` to cancel).
Each line is tagged `[live]` (visitor panel open / SSE connected) or
`[orphan]` (session still open in DB but the visitor is gone — tab closed,
storage cleared, navigated away). You can still open an orphan to read or
`/quit` it. You can still open a session directly:

```bash
npm run chat -- sessions --dev
npm run chat -- CCC13F56 --dev
```

Type replies at the `>` prompt; visitor messages appear as they
arrive. `/quit` closes the session for the visitor (SSE) then exits;
`/refresh` reprints the transcript. Works the same
on preprod/prod when you prefer the terminal over email replies.

**Reopen / notifications:** `npm run chat -- reopen <SESSION_ID> --dev|--preprod|--prod`
reopens a closed session so the owner can keep replying. `npm run chat --
notifications process --dev|--preprod|--prod` drains the durable notification outbox
(unread-reply emails) — normally run on a schedule, not by hand. Ops
session GET includes attachment `absolutePath` for CLI display; public chat
APIs only return `fileName`.

**Dev / folder-routed preprod:** outbound chat mail lands under
`DEV_EMAIL_CHAT_DIR` (`.html` + `.eml`; locally `<outputDir>/dev/email-chat/`).
Prefer answering with `npm run chat -- --dev|--preprod|--prod` rather than replaying
those files. Preprod sends real mail (pipe/SMTP path below) by default;
`npm run operation -- email-folder true --preprod` switches it to folder
routing instead (real env var + app restart, see
[operation.md](../api/07-operation.md#put-operationemail-folder)).

**Preprod/prod contact Pipe:** configure each cPanel mailbox with one Pipe to
a Program entry: `bin/main-pipe-contact-dispatcher.sh` (cPanel may display it
with a leading `|`). Do not pipe a product-request mailbox directly to a
handler. The main pipe identifies `preprod` or `prod` from the delivered
mailbox address (or the explicit chat target header), then passes the original
message to `private_html/<mode>/current/pipe/pipe-contact-dispatcher.sh`. That second dispatcher sends
product replies to `pipe-program-product-request-handler.sh`, chat replies to
`pipe-program-chat-handler.sh` in the active release, and forwards every
other message to the selected external inbox. Unknown messages and a missing
active release exit 0 without a bounce. The forward address is
`tuucho-contact` plugin setting `forwardRecipient` (Admin → Plugins →
Configure). The dispatcher and chat handler read only that setting for the
bash `sendmail` path. Chat and product-request handlers that start
`opsServer.js` leave the rest to kernel JSON / plugin settings. The
fallback uses cPanel's local `sendmail`, so it needs no SMTP credentials.
The pipes are silent and do not write email contents, API responses, or
credentials to disk.

## `npm run order`

```bash
npm run order -- seed [--status confirmed,in_preparation,to_send,sent,disponible,received,cancelled] [--language fr] [--json] --dev|--preprod|--prod
npm run order -- set-status <orderNumber> <status> [--phone <phone>] [--no-payment] [--skip-shipment-label] [--json] --dev|--preprod|--prod
npm run order -- set-tracking <orderNumber> <trackingNumber> [--json] --dev|--preprod|--prod
npm run order -- delete <orderNumber> [--json] --dev|--preprod|--prod
npm run order -- delete-all [--json] --dev|--preprod|--prod
```

Fulfillment also has an authenticated admin dashboard (`/admin/orders*`).
`seed` here pulls the selected database's normal fulfillment orders
through the `OPS_TOKEN`-gated `/operation/orders` API and mirrors them into
local manager files only: `catalog import tree/order/<status>/<orderNumber>.json`.
There is no `--direction`: the only direction is DB → local. By default it
mirrors every fulfillment status; `--status` accepts a comma-separated subset such as
`confirmed,sent`. Each order may exist in only one status folder: a run
removes any JSON whose order was deleted from the DB or moved to another
status. Valid orders in unselected status folders are preserved. `seed` never
changes the DB. It is named `seed` rather than `list` because it rewrites the
whole local archive: it is a synchronization, not a read-only report. `--language` defaults to `fr` and writes the selected
localized courier/item labels instead of the complete language objects; use
one of `fr`, `en`, `th`, `es`, `it`, `nl`, or `pt`. Each archive groups its
data under `order`, `user`, `destination`, `delivery`, `amounts`, and `items`:
the user ID is `user.id`, recipient/address details are in `destination`,
carrier/pickup routing is in `delivery`, and each item has `product` and
`pricing` sections. If
a courier or shape has no translation for the selected language, it falls
back to French (then the raw shape key if that vocabulary entry is absent).
The archive's `user` object includes the current profile information (email,
first name, last name, phone). For a guest order, `user.id` and the profile
fields are null but `user.email` is the immutable guest-checkout email.

`set-status` keeps the strict lifecycle (`confirmed → in_preparation → to_send
→ sent → received` for home delivery, or `confirmed → in_preparation → to_send
→ sent → disponible → received` for Point Relais; no skipping/backwards; re-sending the current status is a
harmless no-op). Graphs and exception statuses (`need_review`, `return_review`)
are in [Order lifecycle](../orders.md). After a successful move it updates only
that one order's local mirror file — rewriting it in place, or moving it to the
new status folder if the status changed — rather than re-syncing every other
order. Card checkouts authorize
only (`capture_method=manual`); by default `set-status … in_preparation` and
`set-status … to_send` **capture** the PaymentIntent first when
`payment_capture_status` is still `authorized`. Capture failure leaves the
status unchanged and prints a clear refusal. Pass `--no-payment` only with
`in_preparation` to advance without capturing (hold remains until a later
capture on prep without the flag, or on `to_send`). PayPal uses the same
manual-capture path as cards (authorize at confirm; capture on prep/`to_send`).
Free/voucher orders are `not_required` at confirm. If the Stripe auth window
ends before capture, `payment_capture_status` becomes `expired` (funds never
taken) and capture is refused until ops cancel the order. If the customer
currently
holds an edit lock on the order (`ORDER_REVISION_LOCK_TTL`, default 30m —
opened from the shop's address-edit flow), the API returns
`409 order_revision_locked` (active) or `409 order_revision_lock_stale`
(TTL elapsed but lock columns never cleared) with a clear `message` naming
the order number and lock expiry; the CLI prints that refusal and exits
without changing status. After contacting the customer, pass
`--bypass-lock-edit` to clear the lock and continue. Saving or closing the
edit dialog unlocks; an expired lock does **not** unblock ops by itself.
`cancelled` is an
admin-only terminal transition from
`confirmed`, `in_preparation`, or `to_send`; it restores the order's stock
allocation but does not refund Stripe or void an already-generated carrier
label. An uncaptured authorization is canceled (hold released) instead.
Moving to `to_send` reads the exact nail-set quantity
entry in `catalog import tree/courier/data-packet.json`, generates the
carrier PDF (currently Mondial Relay Point Relais and Home), and writes it as
`order/to_send/<orderNumber>.pdf` as an A4 document containing the native
10×15 cm label; a carrier error leaves the status
unchanged. Pass `--skip-shipment-label` to move to `to_send` without calling
the carrier label API at all — for when the automated call itself can't
proceed (a real carrier-account error, e.g. Mondial Relay's "no sorting
plan" for a product/postal code) but the order still needs to ship by some
other means; no packet is read and no PDF/sticker is generated or written in
that case. Couriers without an automated label adapter (for example
`chronopost-home`, `colissimo-home`) skip label generation automatically; use `set-tracking`
once the manual label exists. Setting `sent` triggers the "shipped" email.

The internal `need_review` payment-exception status is intentionally excluded
from the `npm run order` lifecycle and local fulfillment archive. It is listed
and resolved from the browser-admin Orders page only: inspect the
PaymentIntent shown on the prominent review card, then use Continue or Cancel.
Continue verifies Stripe without capturing. Cancel explicitly cancels an
authorization or refunds captured funds before the local cancellation. This
is a human-triggered admin request; no npm command, background worker, or cron
performs the financial action. The ops delete commands refuse unresolved
`need_review` orders.

The `return_review` shipment exception is likewise browser-admin only. Carrier
tracking may open it, but no ops command can manufacture or resolve it. The
administrator chooses the refund, retained delivery amount, stock quantities,
and final cancellation. Ops delete commands refuse unresolved return cases as
well.

`set-tracking` records (or corrects) a carrier tracking reference by hand —
whatever value fits the order's own courier, e.g. a Mondial Relay shipment
number — most useful after `--skip-shipment-label` left an order with
nothing to track but it has since actually shipped some other way (a label
printed by hand through the carrier's own portal, for example). It fails
unless the order has already reached `to_send`, `sent`, `disponible`, or `received` —
tracking a reference before the order has even notionally shipped doesn't
make sense. Doesn't touch order status, doesn't generate or require a
packet/PDF, and doesn't run the local mirror (nothing about the archived
order JSON changes).

`delete` permanently removes one order from the target database; `delete-all`
does the same for every order. Both release
the consumed stock allocation, never cancel/refund Stripe, and then remove the
corresponding local JSON file(s) directly — `delete` just the one order's,
`delete-all` every file, since every order is now gone — without re-fetching
or re-diffing the rest of the archive. Both require `--confirm` on `--prod`.

## `npm run product-request`

```bash
npm run product-request -- list [--status requested,accepted,refused] [--json] --dev|--preprod|--prod
npm run product-request -- set-status <publicId> <status> [--reason <text>] [--json] --dev|--preprod|--prod
```

The authenticated admin dashboard also manages these via
`/admin/product-requests*`. `list` / `set-status` remain the OPS CLI for
sold-out size requests stored by `POST /contact/product-request`. Same
OPS_TOKEN-gated `/operation/product-requests` surface as `order`, same
`--dev`/`--preprod`/`--prod` target flags, same `--json`
convention. There is **no local archive**: `list` prints a table (or one
JSON object with `--json`) and never writes manager files.

By default `list` returns every status, newest first; `--status` accepts a
comma-separated subset such as `requested` or `requested,accepted`. Each
row's `id` is the 8-hex `publicId` (also in the spy email subject) used by
`set-status`.

`set-status` writes `requested`, `accepted`, or `refused`. Re-sending the
current status is a harmless no-op. `refused` requires `--reason` (stored
on the row, max 500 characters); `--reason` is rejected for the other
statuses. Transitions are otherwise free (ops can move accepted → refused
or the other way). Does not email the customer — the spy mail on create is
still the reply-to path.

## `npm run operation`

```bash
npm run operation -- database-migrate [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-reset [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-reset-and-seed [--ssh|--ftp] [--json] [--confirm] --dev|--preprod|--prod
npm run operation -- database-backup [--keep 3] [--ssh|--ftp] [--json] [--confirm] --dev|--preprod|--prod
npm run operation -- database-backup-list [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-backup-verify <id> [--from <mode>] [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-backup-fetch <id> [--out <dir>] [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-backup-push <id-or-file> [--ssh|--ftp] [--json] --dev|--preprod|--prod
npm run operation -- database-backup-prune [--keep 3] [--ssh|--ftp] [--json] [--confirm] --dev|--preprod|--prod
npm run operation -- database-restore <id> [--dry-run] [--from <mode>] [--bypass-preflight] [--ssh|--ftp] [--json] [--confirm] --dev|--preprod|--prod
npm run operation -- generate-key ops|jwt|db [--replace] [--json] --dev|--preprod|--prod
npm run operation -- email-folder true|false [--ssh|--ftp] [--json] --preprod
```

Every command above except `generate-key` calls the running API's
OPS_TOKEN-gated `/operation/*` routes (see `scripts/operation.ts`).
`database-backup`, `database-restore` and `database-backup-prune` write to the
target, so they need `--confirm` when — and only when — targeting `--prod`,
exactly like `database-reset`.

`database-reset-and-seed` is the destructive bootstrap shortcut. It stops on
the first failed step and runs, in this exact order:

1. `database-reset`;
2. `database-migrate`;
3. the standard aggregate `npm run seed` (library, library-user, library-nail, courier,
   courier-live-state, accessory, cart-rule, payment-method,
   payment-method-countries, and sign-in-method).

It reuses the command's existing SSH tunnel or FTP gateway for all seed
children. `--confirm` is mandatory on `--prod`; the reset endpoint still
receives its independent `{"confirm":true}` safeguard in every mode. This
does not add faker accounts, carts, vouchers, or orders.

### Backup and restore

A backup is one `.tar` under `PRIVATE_BACKUP_DIR` holding, for the same
instant: every `public` table's rows, every sequence position, the migration
head those rows belong to, and **every media tree** — product photos,
invoices, shipping labels, contact and chat attachments. Media is not
optional: rows store relative paths, so a database restored without its files
leaves every one of them dangling.

There is no schema dump: `src/db/migrations/` already reproduces the schema
exactly, so an archive carries data plus the head it belongs to. That needs no
`pg_dump` binary on the host, and it is what makes the version check natural.

`database-backup` creates one and then rotates: only the newest `--keep`
(default 3) survive on the host.

`database-restore` does the whole job in one command, with nothing to prepare
and nothing to run afterwards: it checks the version, empties `public`,
migrates to exactly the archive's head, loads the rows and sequences, migrates
forward to the running release, then mirrors the media trees. Mirror means
mirror: a file created after the backup disappears, as does the row that
referenced it.

**The version gate is the normal refusal path** (unless `--bypass-preflight`).
The archive's migration list — names *and* file checksums — must be a prefix of
this release's:

| Archive vs. this release             | Result                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| identical                            | restores as-is                                                               |
| archive is a strict prefix (older)   | restores, then migrates forward, listing the migrations it applied           |
| archive is newer than this release   | **refused** — deploy the matching version first (`deploy -- --rollback X.Y.Z`); there are no down migrations |
| same position, different name/checksum | **refused**, no override — a shipped migration was rewritten                |

Also refused: an archive from another target (unless `--from <mode>` says so
explicitly), an unknown archive format, and a `PII_ENCRYPTION_KEY` /
`PII_LOOKUP_PEPPER` different from the ones in force when the archive was
taken — every encrypted column would otherwise restore as unreadable
ciphertext, and email/login lookups would miss. The app version alone never
refuses anything: a version bump with no schema change is reported as a
warning and restores normally. The migration head is the contract.

`--bypass-preflight` skips the **schema/mode** refusals only (e.g. after
squashing migrations into a single init). The restore then migrates the empty
DB to **this release's full head**, loads the archive rows into that schema,
and records the would-be refusal as a warning. **PII key mismatch is never
bypassed** — wrong keys leave accounts unreachable while gallery/media still
look fine. There is no override for a corrupt archive format that cannot be
read.

Because file checksums are part of the gate, **never edit a migration that has
already shipped** — every existing archive stops being restorable (without
`--bypass-preflight`).

`database-backup-verify` (and `database-restore --dry-run`) prints that
verdict without touching anything. With `--dry-run --bypass-preflight`, a
failing verdict is printed but the exit code stays 0 so you can see what would
have been refused.

Archives are gigabyte-scale, so they never travel through the ops HTTP
surface: `database-backup-fetch` and `database-backup-push` move them over
scp, or over FTP when `--ftp` is the transport in use. Both default to the
same off-host folder `catalog import tree/backup/` (gitignored), next to the
order and voucher archives: `fetch` writes `<id>.tar` there; `push` accepts
that same archive id (or an explicit path to a `.tar`) and uploads it into
the target's backup directory — which is how a preprod or dev target gets
restored from a production snapshot (`--from prod`).

`generate-key` is **local-only** (no API call, no OPS_TOKEN required, no
transport flag). It creates high-entropy secrets. `ops` generates the
`OPS_TOKEN` that authenticates both the loopback ops server (`/operation/*`
on `opsServer`) and the PHP ops gateway (deploy shell and the `--ftp`
reverse-proxy of loopback `/operation/*`) — rotating it means every ops CLI
checkout and the next `--ftp` deploy must use the new value, since the
gateway also stores it in `private_html/<mode>/.ops-gateway/token` rather than
from the release it is about to replace:

| Kind  | Env vars                                   |
| ----- | ------------------------------------------ |
| `ops` | `OPS_TOKEN`                                |
| `jwt` | `JWT_SECRET`                               |
| `db`  | `PII_ENCRYPTION_KEY` + `PII_LOOKUP_PEPPER` |

Without `--replace`, values print to stdout only. With `--replace`, they are
upserted into kernel private JSON (create file if missing; overwrite
existing lines; preserve other keys). Replacing `db` on an env that already
has ciphertext makes that data unreadable — the CLI prints a warning.

Bootstrap after a DB reset:

```bash
npm run operation -- generate-key db --replace --dev
npm run operation -- generate-key ops --replace --preprod
npm run operation -- generate-key jwt --replace --dev   # if needed
npm run operation -- database-reset --dev
npm run operation -- database-migrate --dev
```

| Command            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database-migrate` | Applies any pending `src/db/migrations/` files (`node-pg-migrate`, tracked in `pgmigrations`). Kernel schema is the single baseline `1738000000000_init.js` (full current public schema, including sealed `plugins.secrets`). This shop already applied that name, so migrate is a no-op until a new timestamped file lands. Runs with `checkOrder` off so leftover pre-squash `pgmigrations` rows for deleted files do not block. A database that applied `1738000000000_init` *before* this squash does not receive the folded later files: `database-reset` it first, then migrate. **Deploy caveat:** `npm run build` wipes `dist/v<version>/` before copying migrations. Never FTP-merge an older tree on top of a post-squash build. |
| `database-reset`   | **Destructive.** Empties `public` (all tables + `pgmigrations`) so the next `database-migrate` rebuilds from scratch. On local Docker this drops/recreates the schema; on managed Postgres (LWS) where the app role does not own `public`, it drops the objects inside the schema instead. After a reset, re-import library / courier / voucher — schema seeds only countries, the `user`/`super-admin` roles (and the seeded staff roles), the `home` delivery network, the loyalty singleton, and `payment_method_countries`. |
| `database-backup`  | Snapshots the target into one `.tar` (rows + sequences + migration head + every media tree), then keeps only the newest `--keep` (default 3). Read-only on the database: it dumps inside a repeatable-read snapshot, so the shop can keep taking orders while it runs. |
| `database-restore` | **Destructive.** Replaces the target's database *and* media trees with an archive's contents, end to end. Refuses on the version gate unless `--bypass-preflight` (operator accepts incompatibility, e.g. after a migration squash). Requires `--confirm` on `--prod`; the API independently requires `{"confirm":true}` on every target, like `database-reset`. |
| `database-backup-verify` | Read-only. Prints the archive's identity and the restore verdict. Exits non-zero when the verdict is a refusal, so it is usable in a script. |
| `database-backup-fetch` / `-push` | Move an archive between the target and this machine (scp, or FTP under `--ftp`). Both default to `catalog import tree/backup/`: `fetch` writes `<id>.tar` there; `push` accepts the same archive id (or a path to a `.tar`). |
| `database-backup-prune`  | Deletes the target's oldest archives, keeping the newest `--keep`. |
| `generate-key`     | Local secret generation for `ops` / `jwt` / `db` (see above). |
| `--replace`        | `generate-key`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Write into kernel private JSON instead of printing.                                                                   |
| `email-folder`     | Preprod only. Sets the real `ROUTE_EMAIL_FOLDER` process env var via `cloudlinux-selector` and restarts the app — see [operation.md](../api/07-operation.md). Not a DB preference: what a process is doing is always exactly what it was booted with. |

## `npm run user`

```bash
npm run user -- list [--from <val>] [--to <val>] [--limit <n>] [--search <email>] [--ip <address>] [--created-after <val>] [--created-before <val>] [--locked] [--with-orders] [--never-ordered] [--sort last-connected|most-connected|least-connected|order-value] [--json] --dev|--preprod|--prod
npm run user -- lock <id-or-email> [--reason <text>] [--json] --dev|--preprod|--prod
npm run user -- unlock <id-or-email> [--json] --dev|--preprod|--prod
npm run user -- set-role <id-or-email> <role-code> [--json] --dev|--preprod|--prod
npm run user -- delete <id-or-email> [--delete-orders] [--json] --dev|--preprod|--prod
```

There is no admin user-list UI — this CLI is the way to browse the user base or
lock/unlock/delete an account. Backed by the `OPS_TOKEN`-gated `/operation/users`
and `/operation/accounts/:idOrEmail/…` endpoints (see
[api operations](../api/07-operation.md)).
`--from`/`--to` each independently accept one of three value forms, and each
is optional on its own:

- a plain **index** (e.g. `10`) — position in the current `--sort` order.
  If both are indexes, that's the inclusive range `[from, to]` (e.g.
  `--from 0 --to 9` shows the first 10); `--limit` cannot be combined with
  an index `--to`.
- a relative **day count**, `<N>d` (e.g. `5d`) — N days ago.
- an absolute **date**, `YYYY-MM-DD`.

The day-count and date forms both filter on `last_connected_at`, not
pagination — `--from` is the more-recent boundary, `--to` is the
further-back boundary, so `--from 0d --to 5d` means "connected sometime in
the last 5 days." `--from` omitted defaults to "today" (no upper/recent
bound); `--to` omitted defaults to "maximum" (no lower/older bound) — in
practice each just means that side of the filter isn't applied. `--from`
and `--to` must be the same kind if both are given (both indexes, or both
day-counts/dates). `--created-after`/`--created-before` accept the same
day-count/date forms but filter `created_at` instead, with plain
chronological meaning (no "index" form, and no recency-flip).

| Argument                               | Applies to       | Notes                                                                                                                                                                                                                                                                            |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--from` / `--to`                      | `list`           | See above.                                                                                                                                                                                                                                                                       |
| `--limit <n>`                          | `list`           | Caps the result count. Omitted entirely = no limit, every matching row is returned (appropriate for this site's actual user-base size). Cannot combine with an index `--to`.                                                                                                     |
| `--search <email>`                     | `list`           | **Exact** email match via `email_lookup` HMAC (substring search is not possible once emails are encrypted).                                                                                                                                                                      |
| `--ip <address>`                       | `list`           | Only accounts with at least one `refresh_tokens.created_by_ip` row matching exactly — "who else connected from this IP".                                                                                                                                                         |
| `--created-after` / `--created-before` | `list`           | Date/day-count bounds on `created_at` (account signup date) — see above.                                                                                                                                                                                                         |
| `--locked`                             | `list`           | Only accounts with `status = 'locked'`.                                                                                                                                                                                                                                          |
| `--with-orders` / `--never-ordered`    | `list`           | Mutually exclusive. Order aggregates (count and value sum) exclude cancelled orders.                                                                                                                                                                                             |
| `--sort`                               | `list`           | `last-connected` (default), `most-connected`, `least-connected`, or `order-value`. "Connected" counts both a manual login and a silent session refresh (see `token.service.ts`'s `recordConnection`) — accounts predating this feature show `0`/`—` until their next connection. |
| `--json`                               | all              | `list`: prints the raw API response as JSON instead of a table. `lock`/`unlock`/`set-role`/`delete`: prints `{command, status, ok, body}` (plus `mirror` when `--delete-orders`) instead of a line. See the top of this document. |
| `<id-or-email>`                        | `lock`, `unlock`, `set-role`, `delete` | Either the account's UUID or its email address.                                                                                                                                                                                                                                  |
| `--delete-orders`                      | `delete`         | Permanently removes the account's orders (and clears matching local manager `order/<status>/<orderNumber>.json` mirrors) instead of orphaning them. Without the flag, orders are detached like the GDPR cron.                                                                    |
| `--dev`/`--preprod`/`--prod`                               | all              | Required, no default.                                                                                                                                                                                                                                                            |

Subcommands:

- `list` — prints a table (email, name, status, role, verified, created,
  last connected, connections, orders, order value), or raw JSON with
  `--json`. Read-only.
- `lock` — operator-initiated equivalent of the customer's own "this wasn't
  me" email link (see `accountSecurityLock.service.ts`): flips the account to
  `locked` and revokes every active session. For when you spot something odd
  yourself (e.g. from a spy email) rather than waiting for the customer to
  notice.
- `unlock` — reverses either lock path above. There is no self-service
  unlock; this is the only way back to `active`.
- `set-role` — gives the account exactly one role: `super-admin` or any staff
  role created on the administration Roles page (for example `preparator`),
  replacing the roles it held; `user` removes every staff role (customer).
  Several roles at once are assigned from the administration Users page.
  Any staff role opens the Administration menu, limited to its resolved
  permissions; an unknown code is refused with `400 invalid_request`. Like lock and unlock, it requires the production
  safeguard.
- `delete` — immediate hard-delete (any status; skips the customer grace
  period). Default orphans orders the same way as
  `POST /operation/process-account-deletions`. `--delete-orders` wipes those
  orders from the DB and removes local manager order JSON mirrors. Stripe
  customer delete is best-effort. Requires `--confirm` on `--prod`.

## `npm run faker`

```bash
npm run faker -- account <email-or-prefix> [--count N] [--verified] [--json] [--throttle <ms>] --dev|--preprod|--prod
npm run faker -- order <email> [--state …] [--orderQuantity N|min max] [--itemsQuantity N|min max] [--itemsVariation N|min max] [--voucher CODE] [--courier CODE] [--json] [--throttle <ms>] --dev|--preprod|--prod
npm run faker -- cart <email> [--itemsQuantity N|min max] [--itemsVariation N|min max] [--json] [--throttle <ms>] --dev|--preprod|--prod
npm run faker -- seed [--database-reset] [--json] [--throttle <ms>] --dev|--preprod|--prod
```

Demo-data seeder. Generic `account`/`order`/`cart` commands always use password `Demo2026!`.
They create accounts through `/auth/register` (or reuse an existing account
that already accepts that password), fill carts through `/account/cart`,
and place free checkouts through `/account/checkout/free` (ensuring voucher
`FAKER-FREE` via the OPS voucher-import API unless `--voucher` overrides).
Each free checkout starts a live `X-Checkout-Session` first (same privacy
session as the shop). `FAKER-FREE` is unlimited per customer (`maxUsesPerUser: 0`)
so seed can place one order per lifecycle status. Order statuses are then
advanced with the same OPS `set-status` path as
`npm run order` (`to_send` always uses `skipShippingLabel`).

`seed` is a fixed personal fixture (idempotent where practical):

| Piece     | Value                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account   | `tezov.app@gmail.com` / `Demo2016!` (created if missing, always email-verified, always `role=super-admin`)                                                                      |
| Addresses | 1× `home` Mondial Relay home delivery, 1× `mondial-relay-point` pickup (fake point id `012345`)                                                                           |
| Cards     | Test cards ending `0341` / `4242` (Stripe tokens `tok_chargeCustomerFail` / `tok_visa` → same SetupIntent + `/register` path as the website; raw PANs are Stripe.js-only) |
| Carts     | 2 named carts (`Faker Cart 1` / `Faker Cart 2`) filled with stock                                                                                                         |
| Orders    | 1 free order per lifecycle status (skips a status that already exists on the account)                                                                                     |

With `--database-reset`, seed first runs the destructive bootstrap
(`operation -- database-reset` → `database-migrate` →
`library -- seed` → `courier -- seed`) for the same `--dev`/`--preprod`/`--prod`, then the
fixture above.
Library import can take a while.

Also accepts the email-first form for order/cart:
`npm run faker -- <email> order|cart …`.

| Argument            | Applies to      | Notes                                                                                                                                                              |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `<email-or-prefix>` | `account`       | Exact email if it contains `@`. Otherwise treated as a prefix and expanded to `{prefix}-{random}@shop.example`.                                                     |
| `--count N`         | `account`       | How many prefix accounts to create (default 1). Forbidden with an exact email.                                                                                     |
| `--verified`        | `account`       | Marks the email verified via OPS `verify-email` (no confirmation mail round-trip).                                                                                 |
| `<email>`           | `order`, `cart` | Exact account email. Created automatically with `Demo2026!` when missing.                                                                                          |
| `--state`           | `order`         | One or more of `confirmed`, `in_preparation`, `to_send`, `sent`, `disponible`, `received`, `cancelled` (space/comma-separated). Omitted = all seven for `mondial-relay-point`, otherwise all but `disponible`; `disponible` requires that Point Relais courier. |
| `--orderQuantity`   | `order`         | Exact `N`, or a range `min max` / `min-max`. Default `5`.                                                                                                          |
| `--itemsQuantity`   | `order`, `cart` | Per-line quantity: exact or range. Default `1 5`. Randomised per line/order.                                                                                       |
| `--itemsVariation`  | `order`, `cart` | How many distinct product lines: exact or range. Default `1 3`.                                                                                                    |
| `--voucher`         | `order`         | Free-checkout voucher code (default `FAKER-FREE`, auto-ensured as a €500 amount voucher).                                                                          |
| `--courier`         | `order`         | Courier code for free checkout (default `mondial-relay-home`).                                                                                                     |
| `--database-reset`  | `seed`          | Destructive: wipe DB → migrate → library seed → courier seed, then seed.                                                                                           |
| `--dev`/`--preprod`/`--prod`            | all             | `dev` / `preprod` / `prod`.                                                                                                                                        |
| `--json`            | all             | Single JSON summary on stdout; narration on stderr.                                                                                                                |
| `--throttle <ms>`   | all             | Minimum idle delay between faker's own public-API requests (account/cart/checkout/etc.). Defaults to `0` in dev and `149` in preprod/prod. Does not apply to `/operation/*` calls, which go over the SSH-tunneled ops server. |

Subcommands:

- `account` — create (or reuse) demo account(s).
- `order` — ensure account + address + voucher, create N free orders with
  randomised lines, advance each to the requested status.
- `cart` — ensure account, replace the active cart with randomised in-stock
  lines (no checkout).
- `seed` — fixed `tezov.app@gmail.com` fixture (see table above).

## `npm run healthz`

```bash
npm run healthz -- [--json] --dev|--preprod|--prod
```

No auth, no body — just checks whether a target's Node app is actually up
and how long it took to answer. Useful before/after a cPanel restart, or
to confirm an environment is (or isn't) currently reachable at all. `--json`
prints `{mode, ok, status, elapsedMs, body}` (or `{..., error}` if
unreachable) instead of the line.

## `npm run edge-cache`

```bash
npm run edge-cache -- probe [--json] --preprod|--prod
```

Read-only measurement of what the LWS "Fastest Cache" edge does to the front's
responses. There is no `--dev`: the edge only exists in front of the deployed
domains.

### Why this command exists

Fastest Cache is a Varnish that LWS runs on the hosting node itself, in front
of Apache. Its cPanel plugin stores only `cache_enabled`, a
`wordpress|prestashop` profile, and a temporary developer-mode flag **per
domain**. It has no path rules, no TTL setting and no exclusion list, so the
only way to keep a URL out of that cache is the `Cache-Control` header the
origin sends, which for the front means `tuucho/kernel/front/public/.htaccess`.
Whether the edge honours those headers is undocumented by LWS, so it has to be
measured rather than assumed, and re-measured whenever LWS changes their VCL.

Responses carry three headers this command reads: `edge-cache-engine-mode`
(`ACTIVE`/`INACTIVE` for the domain), `edge-cache-engine-hit` (`HIT`/`MISS` for
the request) and `age`.

### What it checks

| id | Question | A `fail` means |
| --- | --- | --- |
| `mode` | Is the edge active for this domain? | never fails; everything else is skipped while `INACTIVE` |
| `no-store` | Did anything the origin marked `no-store`/`private` get stored anyway? | header-based exclusion does not work on this host, so the front `.htaccess` cannot protect anything |
| `vary` | Is `Vary` respected across two `Accept-Language` values? | a cached response crosses languages; the API must stay uncached |
| `ua-mix` | Can a share-bot's 302 be served to a browser? | the cache is poisoned by User-Agent and real visitors get bounced to the API preview endpoint |
| `bypass` | Does `?FC-Cache-Bypass=1` reach the origin? | the documented per-request escape hatch is gone, so origin output can no longer be inspected while the edge is live |

`ua-mix` is the one that matters most for this site: the front `.htaccess`
redirects link-preview bots to the backend's `/gallery/set/:uid/preview`, and
Varnish keys on URL without considering User-Agent.

Exit code is 1 if any check fails, so this can gate a deploy. A `skip` (edge
inactive, empty catalogue) never fails.

### Reading the output

The table is one row per probed URL: the origin's `Cache-Control`, the
`edge-cache-engine-hit` of two back-to-back requests, and both timings. A
`cached=yes` row whose origin header says `no-store` is a bug in the edge; a
`cached=yes` row on prerendered HTML or a hashed asset is the intended win. The
closing `speed:` line reports the median millisecond saving across the rows
that were actually cached, which is the only honest number for what the edge
buys.

### Extending it

Probe targets live in the `targets` array in `scripts/edgeCache.ts`; add a
`{label, path}` entry to cover a new URL shape. A new question is a function
returning a `Check` (`{id, verdict, detail}`), pushed onto `checks` in `main`.
Keep every check read-only: this command is safe to run against `--prod`, and
it must stay that way.

`BROWSER_UA` must never contain a token from the share-bot list in the front
`.htaccess`, or `ua-mix` silently stops testing anything.

## `npm run log`

```bash
npm run log -- read --api|--email|--cron-shipment|--cron-account-deletion|--cron-guest-saved-cleanup|--cron-loyalty|--cron-gift|--cron-gift-purge|--cron-payment-auth-expiry|--cron-warm [--lines 1-500] [--follow] --dev|--preprod|--prod
npm run log -- download --api|--email|--cron-shipment|--cron-account-deletion|--cron-guest-saved-cleanup|--cron-loyalty|--cron-gift|--cron-gift-purge|--cron-payment-auth-expiry|--cron-warm [--lines 1-500] [--follow] --dev|--preprod|--prod
npm run log -- errors [--lines 1-500] [--since <iso>] [--follow] [--json] --dev|--preprod|--prod
npm run log -- clear [--api|--email|--cron-shipment|--cron-account-deletion|--cron-guest-saved-cleanup|--cron-loyalty|--cron-gift|--cron-gift-purge|--cron-payment-auth-expiry|--cron-warm] --dev|--preprod|--prod
```

`--api` reads the protected, rotating API NDJSON log through
`GET /operation/log/api`. The admin preference `apiLogEnabled` gates it in
every target, including production. `--email` reads the sent-mail journal
through `GET /operation/log/email`, gated by `emailLogEnabled` the same way.
`--cron-shipment` / `--cron-account-deletion` /
`--cron-guest-saved-cleanup` / `--cron-loyalty` / `--cron-gift` /
`--cron-gift-purge` / `--cron-payment-auth-expiry` / `--cron-warm` read the matching production
cron output through `GET /operation/log/cron-*`; available after the cron has
run. `read` formats API diagnostics and prints cron lines unchanged.
`download` saves raw lines under `<outputDir>/log/<mode>/` (default `<clone
root>/output`); with `--follow`, new
records append to that same file. The remote read, download, and clear
operations additionally require the matching admin preference
(`apiLogEnabled`, `cronShipmentLogEnabled`, …). `clear` defaults to the
API diagnostic log and deletes its current file plus rotations; pass a
`--cron-*` flag to delete only that cron log.

`errors` reads the same API log but groups it by failure instead of printing
it: status, error code and route with its identifiers collapsed (`/orders/:id`),
ranked by how often each happened, with the newest occurrence of each. It
answers "did my change break anything" in one screen rather than a page of
NDJSON, which is the question the dev loop otherwise gives no way to answer,
since `tsx watch` reloads silently and the error lands in a terminal nobody is
watching. `--since <iso>` ignores anything older than a marker you took before
the change; `--json` emits the grouping with one full example record per group.
