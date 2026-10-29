# LWS deploy reference (tuucho-ecom shops)

Companion to [SKILL.md](./SKILL.md). Numbers and names match the product cron
docs and the historical LWS deploy pattern.

## Mode matrix

| Concern | `dev` | `preprod` | `prod` |
| ------- | ----- | --------- | ------ |
| Build + upload | No | Yes | Yes |
| Transport flag | None | SSH or FTP | SSH or FTP |
| Node App at `private_html/<mode>/current` | Local process | Yes | Yes |
| Production crontab | No | No | Yes |
| Standing FTP ops gateway after deploy | N/A | Often keep | Often remove |
| `--reset` / faker | Allowed | Allowed | Reset only with extra wipe flag; no faker |
| Admin route token on front | Optional | Usual | Usual |

## Release folders

- Front: `public_html/<mode>/v<version>/` then `current` → that folder.
- Back: `private_html/<mode>/v<version>/` then `current` → that folder.
- Version from root `package.json`, or a patch override that deploys into an
  existing `vX.Y.Z` without bumping the package.

Retain previous `v*` folders for rollback: retarget `current` (and restart)
without rebuilding if the folder still exists.

## cloudlinux-selector cheatsheet

```bash
cloudlinux-selector get --interpreter nodejs --json
cloudlinux-selector create --interpreter nodejs --app-root private_html/<mode>/current \
  --domain <api-subdomain> --app-mode production --json
cloudlinux-selector set --interpreter nodejs --app-root private_html/<mode>/current \
  --env-vars '<json>' --json
cloudlinux-selector restart --interpreter nodejs --app-root private_html/<mode>/current --json
```

Leftover env is typically `{ "APP_TARGET": "<mode>" }` plus optional `PORT`.
Remove live keys that are not leftover so old secrets do not linger in cPanel.

## FTP gateway endpoints (conceptual)

Gateway URL examples: `https://ops.shop.example/` (prod),
`https://ops-preprod.shop.example/` (preprod).

| Capability | Role |
| ---------- | ---- |
| `GET /healthz` | Readiness (Bearer) |
| Exec / shell | Run one bash command with cwd `$HOME` |
| Proxy `/operation/*` | Forward to loopback opsServer with same Bearer |

Token file example: `private_html/<mode>/.ops-gateway/token` (mode `600`,
parent `700`).

## Production cron jobs

Schedules from `tuucho/docs/cron/README.md`. Wrappers live under `~/bin/`.
Handlers ship under `tuucho/kernel/back/operation/cron/`.

| Job | Schedule | Stable script | Enable flag |
| --- | -------- | ------------- | ----------- |
| Shipment tracking | `17 * * * *` | `bin/main-cron-shipment-tracking.sh` | `ENABLED_CRON_SHIPMENT` |
| Account deletion | `17 4 * * *` | `bin/main-cron-account-deletion.sh` | `ENABLED_CRON_ACCOUNT_DELETION` |
| Guest saved cleanup | `17 5 * * *` | `bin/main-cron-guest-saved-cleanup.sh` | `ENABLED_CRON_GUEST_SAVED_CLEANUP` |
| Loyalty | `17 6 * * *` | `bin/main-cron-loyalty.sh` | `ENABLED_CRON_LOYALTY` |
| Gift | `17 7 * * *` | `bin/main-cron-gift.sh` | `ENABLED_CRON_GIFT` |
| Gift purge | `17 8 * * *` | `bin/main-cron-gift-purge.sh` | `ENABLED_CRON_GIFT_PURGE` |
| Payment-auth-expiry spy | `17 9 * * *` | `bin/main-cron-payment-auth-expiry.sh` | `ENABLED_CRON_PAYMENT_AUTH_EXPIRY` |
| Keep warm | `* * * * *` | `bin/main-cron-warm.sh` | `ENABLED_CRON_WARM` |

Install only when the matching enable flag is on. Use crontab markers so
redeploy refreshes one block without touching unrelated user crons.

Mail drain is **in-process** (`mail_jobs` worker), not a crontab.

## SSH host config (shop machine)

Example `~/.ssh/config` entry (name is arbitrary; do not hard-code product
aliases into the published package):

```
Host lws-my-shop
  HostName <lws-ssh-host>
  User <cpanel-user>
  IdentityFile ~/.ssh/<key>
```

## Checklist before first prod cutover

- [ ] API and shop subdomains exist in cPanel
- [ ] `tuucho-config` for `prod` present on the release (public + private)
- [ ] Node app App Root is `private_html/prod/current`
- [ ] `/healthz` returns 200 after restart
- [ ] `database-migrate` ran once via ops
- [ ] Prod crons installed and one manual `~/bin/main-cron-*.sh` succeeds
- [ ] FTP gateway removed or locked down per shop policy
- [ ] Admin front URL known if using a tokenized `/<token>/admin` path
