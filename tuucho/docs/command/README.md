# Commands

Every `npm run` script in this repo, with its arguments. Root
[`COMMAND.md`](../../COMMAND.md) links here.

## Command menu

Jump straight to the command or reference you need:

| Need                                                                                 | Command / reference                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Know the guardrails before working with a target                                     | [Safety gates](./00-safety.md#safety-gates)                                                                                                                                                                                                             |
| Start the local stack                                                                | [`npm run dev`](./01-dev-build-deploy.md#npm-run-dev)                                                                                                                                                                                                   |
| Seed the standard catalogue and rules                                                | [`npm run seed`](./01-dev-build-deploy.md#npm-run-seed)                                                                                                                                                                                                 |
| Add a field or an endpoint to an existing feature                                    | [`change`](./01-dev-build-deploy.md#npm-run-change) |
| Start a new capability                                                               | [`scaffold`](./01-dev-build-deploy.md#npm-run-scaffold) |
| Know what a table holds                                                              | [`table`](./01-dev-build-deploy.md#npm-run-table) |
| Orient in a module before changing it                                                | `src/modules/<name>/README.md` · [`sync:module-docs`](./01-dev-build-deploy.md#npm-run-syncmodule-docs) |
| See what a change to a feature costs                                                 | [`context`](./01-dev-build-deploy.md#npm-run-context) |
| Find everything one feature touches                                                  | [`feature`](./01-dev-build-deploy.md#npm-run-feature) |
| Find the symbol that does something                                                  | [`where`](./01-dev-build-deploy.md#npm-run-where) |
| Run the fast domain and HTTP tests                                                   | [`test`](./04-test.md#npm-run-test) · [`test:unit`](./01-dev-build-deploy.md#npm-run-testunit) |
| Validate a cross-repository change                                                   | [`check:all`](./01-dev-build-deploy.md#npm-run-checkall) |
| Validate a change before review                                                      | [`check`](./01-dev-build-deploy.md#npm-run-check) · [`typecheck`](./01-dev-build-deploy.md#npm-run-typecheck) · [`check:architecture`](./01-dev-build-deploy.md#npm-run-checkarchitecture) · [`check:docs`](./01-dev-build-deploy.md#npm-run-checkdocs) · [`check:api-reference`](./01-dev-build-deploy.md#npm-run-checkapi-reference) · [`check:context`](./01-dev-build-deploy.md#npm-run-checkcontext) · [`check:contract`](./01-dev-build-deploy.md#npm-run-checkcontract) · [`check:policy`](./01-dev-build-deploy.md#npm-run-checkpolicy) · [`check:routes`](./01-dev-build-deploy.md#npm-run-checkroutes) · [`sync:api-reference`](./01-dev-build-deploy.md#npm-run-syncapi-reference) · [`sync:context`](./01-dev-build-deploy.md#npm-run-synccontext) · [`sync:contract`](./01-dev-build-deploy.md#npm-run-synccontract) · [`sync:policy`](./01-dev-build-deploy.md#npm-run-syncpolicy) · [`sync:routes`](./01-dev-build-deploy.md#npm-run-syncroutes) · [`sync:ratchets`](./01-dev-build-deploy.md#npm-run-syncratchets) · [`sync:errors`](./01-dev-build-deploy.md#npm-run-syncerrors--npm-run-checkerrors) · [`check:sharecard`](./01-dev-build-deploy.md#npm-run-checksharecard) · [`sync:sharecard`](./01-dev-build-deploy.md#npm-run-syncsharecard) · [`check:schema`](./01-dev-build-deploy.md#npm-run-checkschema) · [`check:sql`](./01-dev-build-deploy.md#npm-run-checksql) · [`check:env-docs`](./01-dev-build-deploy.md#npm-run-checkenv-docs) · [`check:release`](./01-dev-build-deploy.md#npm-run-checkrelease) · [`factory-sync`](./01-dev-build-deploy.md#npm-run-factory-sync--npm-run-factory-synccheck) · [`sync:schema`](./01-dev-build-deploy.md#npm-run-syncschema) |
| First-run install (fresh clone)                                                      | [`node tuucho/scripts/install.mjs`](./01-dev-build-deploy.md#first-run-install-node-tuuchoscriptsinstallmjs) |
| Mirror live root scaffold / config / shop plugins into factory backup                | [`factory-sync`](./01-dev-build-deploy.md#npm-run-factory-sync--npm-run-factory-synccheck) · [`factory-sync:check`](./01-dev-build-deploy.md#npm-run-factory-sync--npm-run-factory-synccheck) |
| Build, deploy, or maintain the project                                               | [`build`](./01-dev-build-deploy.md#npm-run-build) · [`deploy`](./01-dev-build-deploy.md#npm-run-deploy) · [`backup-local`](./01-dev-build-deploy.md#npm-run-backup-local) · [`lint`](./01-dev-build-deploy.md#npm-run-lint) · [`format`](./01-dev-build-deploy.md#npm-run-format)                                         |
| Import every product catalogue                                                       | [`product`](./02-imports.md#npm-run-product)                                                                                                                                                                                                            |
| Import or inspect nail sets                                                          | [`library`](./02-imports.md#npm-run-library)                                                                                                                                                                                                            |
| Import customer nail sets                                                            | [`library-user`](./02-imports.md#npm-run-library-user)                                                                                                                                                                                                  |
| Import single nails (compose-a-set)                                                  | [`library-nail`](./02-imports.md#npm-run-library-nail)                                                                                                                                                                                                  |
| Import accessories or couriers                                                       | [`accessory`](./02-imports.md#npm-run-accessory) · [`courier`](./02-imports.md#npm-run-courier)                                                                                                                                                         |
| Create or synchronize vouchers, cart rules, shop payment methods, or sign-in methods. Check loyalty and gift | [`voucher`](./02-imports.md#npm-run-voucher) · [`cart-rule`](./02-imports.md#npm-run-cart-rule) · [`payment-method`](./02-imports.md#npm-run-payment-method) · [`sign-in-method`](./02-imports.md#npm-run-sign-in-method) · [`loyalty`](./02-imports.md#npm-run-loyalty) · [`gift`](./02-imports.md#npm-run-gift)                               |
| Manage chats, orders, product requests, or users                                     | [`chat`](./03-ops.md#npm-run-chat) · [`order`](./03-ops.md#npm-run-order) · [`product-request`](./03-ops.md#npm-run-product-request) · [`user`](./03-ops.md#npm-run-user)                                                                               |
| Run operational server actions and backups                                           | [`operation`](./03-ops.md#npm-run-operation) · [backup / restore](./03-ops.md#backup-and-restore)                                                                                                                                                       |
| Generate local data, check the service, or read logs                                 | [`faker`](./03-ops.md#npm-run-faker) · [`healthz`](./03-ops.md#npm-run-healthz) · [`log`](./03-ops.md#npm-run-log)                                                                                                                                      |
| Run unit coverage HTML                                                               | [`test:coverage`](./04-test.md#npm-run-testcoverage)                                                                                                                                                               |

## Daily development path

For an ordinary backend change, the shortest useful path is:

```bash
npm run dev
npm run check
npm run test
```

`check` already runs `test:unit`. `npm run test` is the same unit suite.

`check` is read-only and is the default pre-review gate. The API test command
creates and removes an isolated local database. Imports, resets, deploys, and
production operations have additional side effects; use the
[safety guide](./00-safety.md) before running them.

## Remote transport

Every command that reaches a remote target (`--preprod` / `--prod`) requires
exactly one transport flag; there is no default. `--dev` is local and takes
neither.

```bash
npm run operation -- database-migrate --ssh --preprod
npm run library -- seed --ftp --preprod
npm run deploy -- --ftp --preprod --confirm
```

`--ssh` is the original path: rsync over SSH, commands over SSH. `--ftp` exists
because SSH to this host is regularly blocked at the network level. Both run
the _same_ commands on the host; only how they get there differs.

### What `--ftp` actually uses

FTP alone cannot deploy this layout — it cannot create the `current` symlinks,
run `cloudlinux-selector`, or run `npm install`. Two separate server-side
pieces fill that gap, and they are not interchangeable:

| Piece              | Where                                                                                                            | Answers on                                                        | Purpose                                                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PHP ops gateway    | `public_html/ops[-preprod]/index.php`, published from [`scripts/ops-gateway.php`](../../kernel/back/scripts/ops-gateway.php) | `OPS_GATEWAY_URL` (`ops.shop.example` / `ops-preprod.shop.example`) | Deploy's remote-exec channel **and** the `--ftp` reverse-proxy of loopback `/operation/*`. Never auto-installed by ops CLIs. `--ftp-ops-remove` takes it away; `--ftp` library/operation then fail. |
| Loopback ops server | `src/opsServer.ts`, bound to `127.0.0.1`                                                                        | never on the public API                                           | Serves `/operation/*`. `--dev` / `--ssh` talk to it directly; the PHP gateway proxies to it. **Runs no shell commands.**                                                                                |

The deploy gateway runs under PHP/Apache rather than inside the Node
application deliberately: a deploy stops that application, and a gateway living
inside it could not then restart it. It reproduces SSH's execution context
(bash, `$HOME` as the working directory, `HOME` exported) — a deploy verifies
that on every run before sending anything, because a gateway executing from its
own document root resolves relative paths inside `public_html` and reports
success while doing nothing useful.

Only `npm run deploy` may install the PHP ops gateway: an `--ftp` deploy
does so for the duration of that deploy, and the standalone `--ftp-ops` /
`--ftp-ops-remove` flags install or remove it by hand (no build, no release).
A `--prod` deploy removes it at the end by default. Ops CLIs (`operation`,
`library`, …) `--ftp` never publish it; they require it to already be
installed and talk to `OPS_GATEWAY_URL`. See
[dev-build-deploy](01-dev-build-deploy.md#--ftp-ops----ftp-ops-remove).

The gateway starts the loopback ops server on the first `--ftp` request and
reuses it afterwards. The host kills that process when it sits idle or goes
over its limits (the log then ends with `Killed`). A recorded server that no
longer holds its port 30 seconds after its spawn is treated as dead and a
fresh one is started on the same request, so that kill never surfaces as an
`ops_unavailable` error carrying the dead process's old log.

The PHP gateway authenticates with `OPS_TOKEN` over HTTPS and forwards that
Bearer header to loopback. The loopback ops server itself also requires
`Authorization: Bearer <OPS_TOKEN>` on `/operation/*` (`--dev` / `--ssh`);
`/healthz` alone stays open for readiness. `--ftp` is the PHP gateway's
token check before it proxies. FTP file transfers need `FTP_HOST`,
`FTP_PORT`, `FTP_USER` and `FTP_PASSWORD` in kernel private JSON; none of
these are ever printed.

Directory uploads go as a single tarball that is unpacked on the host, not as
one FTP transfer per file — see `ftpSyncDirectory` in
[`scripts/deploy.ts`](../../kernel/back/scripts/deploy.ts) for how that reproduces rsync's
`--delete` and its excluded-path behaviour.

See [README.md](../../../README.md) for the workflow these fit into, and
[api](../api/README.md) for the HTTP surface `library` drives.

Every command below accepts `--json`: it prints one JSON object to stdout
instead of the human-readable lines, and moves every other line (banners,
warnings, per-item progress) to stderr; safe to pipe into `jq`, a file, or
another script (e.g. `npm run library -- check --prod --json | jq
'.mismatched'`).

## Sections

| Section                                                                                       | File                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Environment variables (API safety gates)                                                      | [00-safety.md](./00-safety.md)                     |
| seed, dev, build, deploy, checks, lint, format, internal ops gateway                          | [01-dev-build-deploy.md](./01-dev-build-deploy.md) |
| product, library, library-user, library-nail, accessory, courier, voucher, cart-rule, payment-method, sign-in-method, loyalty | [02-imports.md](./02-imports.md)                   |
| chat, order, product-request, operation, user, faker, healthz, log                            | [03-ops.md](./03-ops.md)                           |
| test (fixtures, Patchright, lock, k6)                                                         | [04-test.md](./04-test.md)                         |
| front workspace scripts (dev, build, check, i18n, screens, bundle)                            | [05-front.md](./05-front.md)                       |

Related: [api](../api/README.md) · [schema](../schema/README.md) · [order lifecycle](../orders.md) · [cron](../cron/README.md)
