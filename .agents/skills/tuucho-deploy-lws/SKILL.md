---
name: tuucho-deploy-lws
description: >-
  Guide for building a shop-owned LWS (cPanel / CloudLinux) deploy for
  tuucho-ecom: SSH and FTP transports, preprod/prod release layout, Node
  Selector, ops PHP gateway, production crons, and maintenance. Use when the
  user asks how to deploy a shop to LWS, write a deploy script, wire FTP when
  SSH is blocked, install crons, or adapt ops for their host. Does not add
  LWS knowledge into the product kernel; deploy stays shop-owned.
---

# tuucho-ecom deploy on LWS (shop-owned)

## What this skill is

tuucho-ecom ships the app, ops surface, cron **handlers**, and a PHP ops
gateway **template**. It does **not** ship a first-party LWS deploy as product
code. The shop owner (or this skill) owns how releases reach the host.

Use this skill to **design or implement** a deploy for a shop on LWS/cPanel
CloudLinux, using the patterns proven in older product `deploy.ts` as a
reference, not as something to paste back into the kernel.

## Environments

| Mode | Where | Transport | Typical role |
| ---- | ----- | --------- | ------------ |
| `dev` | Local machine | None | Docker Postgres + `npm run dev`. No upload. |
| `preprod` | LWS account | `--ssh` or `--ftp` | Staging API + shop. No production crons. |
| `prod` | Same or other LWS account | `--ssh` or `--ftp` | Live site. Install/refresh production crons. |

`APP_TARGET` (leftover process env on the Node app) selects which
`tuucho-config/kernel` overlay applies (paths from that tree’s `environments` map; shipped as `kernel/dev/` /
`config.prod.json` + private files). Product secrets stay in shop
`tuucho-config/` and plugin private JSON, not in cPanel env-vars.

## Host layout (example)

Relative to the cPanel home (`$HOME`):

```
public_html/<mode>/v<version>/     # front release (static + .htaccess)
public_html/<mode>/current         # symlink → live front release
public_html/.htaccess              # prod apex only (optional)
private_html/<mode>/v<version>/    # back release (Node app tree)
private_html/<mode>/current        # symlink → live back release (App Root)
nodevenv/private_html/<mode>/…     # CloudLinux nodevenv
bin/main-cron-*.sh                 # stable cron wrappers (prod)
public_html/ops/ or ops-preprod/   # PHP ops gateway (FTP path)
private_html/<mode>/.ops-gateway/  # gateway token file (mode 700/600)
```

Use one stable cPanel Node.js App rooted at `private_html/<mode>/current`
(not at a version folder). Create/migrate with `cloudlinux-selector`.

## SSH vs FTP

**SSH** (preferred when available):

- Upload with `rsync` (checksum, `--delete`, exclude `node_modules` / `tmp`).
- Run remote commands with `ssh` in `$HOME` (bash + `HOME` exported).
- Ops CLIs can port-forward to loopback `opsServer` (`127.0.0.1`).

**FTP** (when SSH is blocked):

- FTP alone cannot create symlinks, run `cloudlinux-selector`, or `npm install`.
- Publish the product template `tuucho/kernel/back/scripts/ops-gateway.php`
  (+ `ops-gateway.htaccess`) under `public_html/ops[-preprod]/`.
- Authenticate with `OPS_TOKEN` (same as kernel private `ops.token`).
- Gateway must `chdir` to account `$HOME` and export `HOME` (CGI starts in the
  document root otherwise and builds a phantom tree under `public_html`).
- Upload a release as **one tar**, unpack into a sibling, then rename over the
  target (per-file STOR is too slow on LWS).
- Shell commands go through the gateway `exec` endpoint; ops HTTP goes through
  the same gateway proxying loopback `/operation/*`.

Product artifacts to reuse (do not invent a second gateway):

- `tuucho/kernel/back/scripts/ops-gateway.php`
- `tuucho/kernel/back/scripts/ops-gateway.htaccess`
- Loopback ops: `opsServer` / `src/opsRoutes.ts` (never mount `/operation/*` on
  the public API)

## Deploy pipeline (preprod / prod)

Order that keeps a mid-deploy crash recoverable:

1. **Resolve version** from root `package.json` (or a patch override that
   names `vX.Y.Z` without editing `package.json`).
2. **Build fresh** front and/or back for that `APP_TARGET` (never upload a
   dist built for another env).
3. **Ensure Node app** exists at `private_html/<mode>/current` via
   `cloudlinux-selector get|create|set`.
4. **Upload** front → `public_html/<mode>/v…`, back → `private_html/<mode>/v…`.
5. **Atomic switch** `current` symlinks to the new release.
6. **Sync leftover env** (`APP_TARGET`, optional `PORT`) with
   `cloudlinux-selector set --env-vars` against a real directory (detach
   symlink for the call if CloudLinux realpath()s a stopped app).
7. **`npm install`** inside the release via the account nodevenv.
8. **`cloudlinux-selector restart`**, then poll `https://<api>/healthz`
   until 200 (restart is async).
9. **DB ops** via ops (migrate; optional reset/seed on non-prod only).
10. **Prod only:** install/refresh crontab wrappers (see below).
11. **FTP hygiene:** many shops remove the standing PHP gateway after a prod
    deploy so `/ops` is not left open between releases; reinstall when needed
    for FTP ops.

`--dev`: no upload. Migrate (or reset → migrate → seed) against local API;
start Docker + server only if `/healthz` is down.

## Maintenance

- **Prepare:** bake a maintenance banner into a normal front build+deploy.
- **Lockdown:** upload a static maintenance page and swap live `.htaccess`
  immediately. Exit lockdown with a normal deploy (rebuilds real `.htaccess`).

## Production crons

Handlers ship in the product under `tuucho/kernel/back/operation/cron/`
(`main-cron-*.sh`). Schedules and preferences: `tuucho/docs/cron/README.md`.

Shop deploy responsibilities:

1. Copy/refresh each enabled script to `~/bin/main-cron-*.sh` with the
   **absolute** path to the live `private_html/prod/current` tree.
2. Install marked crontab lines (**prod only**; never preprod by default).
3. Each job POSTs `/operation/…` with `Authorization: Bearer <OPS_TOKEN>`
   against loopback `opsServer` (or fails with structured ops errors).
4. Admin `cron*LogEnabled` only gates log read/clear, not whether the job
   processes.

Keep-warm (`* * * * *`) can restore Passenger after idle stop; it may drop a
custom `PassengerNodejs` `.htaccess` block until the next back deploy.

Full job table: [reference.md](./reference.md).

## Safety

- Require an explicit confirm for any **prod** write (deploy, reset, clear).
- Never auto-refund Stripe; never put secrets in cPanel env or cron journals.
- Public API must not mount `/operation/*` or `/ops-gateway`.
- `--reset` on prod needs a separate wipe acknowledgement beyond `--confirm`.

## When implementing a shop deploy

1. Ask which modes (preprod/prod), transport (SSH/FTP), and domains.
2. Map their cPanel paths to the layout above (adapt names if their account
   differs; keep the `current` + `vX.Y.Z` idea).
3. Prefer SSH; add FTP gateway only if SSH fails regularly.
4. Wire crons only for prod, from product `operation/cron` handlers.
5. Document shop-local scripts **outside** `tuucho/kernel` (shop repo root or
   a private ops folder). Do not reintroduce LWS host aliases into the
   published product package.

## References in this repo

- Cron behaviour: `tuucho/docs/cron/README.md`
- Ops safety model: `tuucho/docs/command/00-safety.md`
- Gateway sources: `tuucho/kernel/back/scripts/ops-gateway.php`
- Historical full example (may still exist locally as shop reference):
  `tuucho/kernel/back/scripts/deploy.ts` — treat as a pattern library, not as
  product API.
- Detail tables: [reference.md](./reference.md)
