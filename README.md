# tuucho-ecom

Open-source single-shop e-commerce. One shop, plugins like WordPress,
Herd/Local friendly. MIT licensed.

Core is the mechanic: catalog, cart, checkout, orders, accounts, admin shell,
and a plugin runtime (hooks/filters, enable/disable). Pages, theme, payments
and shipping are plugins.

The sample catalog is generic demo products. The operator fills the real shop
name at setup.

## Five-minute install

Needs Node 22+, Docker (Postgres 10 on host port **5434**), and npm.

Clone a **version tag**, not untagged `master`:

```bash
git clone --branch 0.0.3 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
# public JSON is already in git: kernel/back/config/config.json and config/dev/
cp kernel/back/config/config.private.example.json kernel/back/config/config.private.json
cp kernel/back/config/dev/config.private.example.json kernel/back/config/dev/config.private.json
# replace placeholders in config/dev/config.private.json (database url, jwt, pii, ops, smtp)
npm run setup:cli -- --yes \
  --store-name Shop \
  --admin-email admin@shop.example \
  --admin-password 'ShopAdmin1!'
# APP_TARGET=dev is the local default (selects config/dev/)
npm run dev
```

Or open the web wizard: `npm run setup` then visit http://127.0.0.1:8787

After install:

| | |
| --- | --- |
| Shop | http://localhost:5174 |
| Admin | http://localhost:5174/admin |
| API | http://localhost:3010 |

Sign in with the admin e-mail you chose. A second `npm run setup` is a no-op
while `installed.lock` exists.

Stripe and Mondial Relay keys are optional at install time. Configure them
after first Admin login on **Plugins → Configure** (secret store). Do not put
them in kernel JSON.

## Configuration (JSON, not a mega `.env`)

Files live under `kernel/back/config/`. Common (all envs) sit in `config/`
itself; each environment is a subfolder. This clone ships **only** `dev/`.
A new env is a folder, not a closed `dev|preprod|prod` list.

Merge, top to bottom (bottom wins): common public → env public → common
private (or its example) → env private (or its example) → leftover process
overlay (`APP_TARGET`, `PORT`, optional `DATABASE_URL`). `APP_TARGET` is the
folder name (local default `dev`). Missing folder → error naming it.

Public JSON is committed. Private JSON is gitignored; each has a committed
functional `*.example`. Boot: missing private + example present → warning,
load example, launch. Both missing → error. Private present but required keys
missing → error naming each key. `npm --prefix kernel/back run config:doctor`
prints the same list plus every folder under `config/`.

| Concern | After first boot | File or Admin |
| --- | --- | --- |
| Kernel policy (TTLs, rates) | Committed `kernel/back/config/config.json` | Git (common public) |
| Env URLs / dirs | Committed `kernel/back/config/<env>/config.json` | Git (env public) |
| DB / JWT / PII / ops / SMTP passwords | `config/config.private.json` and `config/<env>/config.private.json` (from those `*.example` files) | Gitignored files |
| Shop name, legal, footer | Admin + `footer-identity` / `page-legal` | Admin (that env’s DB) |
| Stripe | Plugin Configure (`tuucho-payment-stripe`) | Admin (secret store on that env) |
| Mondial Relay | Plugin Configure (shipping plugins) | Admin (secret store on that env) |
| Spy recipients | Admin → Spy e-mails (`tuucho-mail-spy`) | Admin |
| Gift / loyalty / cart rules | Those plugins’ Configure or Admin commerce screens | Admin |

**How to add an environment** (copy `dev`, do not invent files in the kernel)

```bash
# public + example only — do not copy config.private.json
npm --prefix kernel/back run config:env -- create preprod
# or by hand:
# mkdir -p kernel/back/config/preprod
# cp kernel/back/config/dev/config.json kernel/back/config/preprod/config.json
# cp kernel/back/config/dev/config.private.example.json kernel/back/config/preprod/config.private.example.json
cp kernel/back/config/preprod/config.private.example.json \
   kernel/back/config/preprod/config.private.json
# edit URLs/paths/CORS in config/preprod/config.json — commit that
# fill a **new** database URL, JWT, PII, ops in the private file — never commit
# APP_TARGET=preprod  (or --env preprod on OPS CLIs)
npm --prefix kernel/back run config:doctor
```

Do **not** copy another env’s private file onto this one. `prod` is the only
indexed name, and only when that folder exists. Same steps for any name
(`staging`, `prod`, …). There is no `README.todo` on this checkout.

Install from a tag: `npm install` only at the **repo root** (npm workspaces, one lockfile). Do not `cd kernel/front && npm install`.

Admin, Plugins, Scan is install (runs schema `up` when the plugin is on).
**Check for updates** then **Apply** walks every git tag between this shop and
the latest official tag (`MAJOR.MINOR.PATCH`, never `v0.0.2`, never `master`).
Plugins “Core” and Check current are the live root `package.json`. Latest is
the newest official GitHub tag. A checkout newer than that tag is ahead (no
Apply). Matching tags: nothing to update. Older local: walk every tag.
`shop-release.json` is last-applied Apply state, not displayed current.
`plugins/user/` is not overwritten
by a Tuucho update. Kernel/all Apply copies root `package.json`. A user plugin
with npm `repository` on its `package.json` updates from that GitHub repo only. Disable unloads the plugin and keeps its tables.
Uninstall runs `down` and removes the row. Stripe keys and carrier credentials live in that plugin’s Admin Configure
(secret store), not kernel JSON.

Details: [docs/plugins.md](docs/plugins.md).

## Plugins shipped

| Plugin | Kind | Notes |
| --- | --- | --- |
| `tuucho-theme-default` | Theme | Tokens + customizer. Required. |
| `tuucho-page-home` | Page | Landing. Required. |
| `tuucho-page-about` | Page | About. Enable equals shop info menu. |
| `tuucho-payment-stripe` | Payment | Card, PayPal, Bancontact, Google Pay, Apple Pay. |
| `tuucho-shipping-home` | Shipping | Home address (Colissimo, Chronopost, Mondial Relay home). |
| `tuucho-shipping-mondial-relay` | Shipping | Point Relais pickup. |
| `tuucho-commerce-vouchers` | Commerce | Promo codes. Disable hides admin and checkout. |
| `tuucho-commerce-cart-rules` | Commerce | Thresholds and gifts. Disable hides admin and checkout. |
| `tuucho-docs-developer` | Docs | In-admin developer guide (Admin, Documentation). |
| `tuucho-seo-sitemap` / `tuucho-seo-robots` / `tuucho-seo-redirects` | SEO | Extra sitemap URLs, robots rules, and redirect apply. Hub: Settings → SEO. |

See [docs/plugins.md](docs/plugins.md) (same text as Admin, Documentation).
User storefront pages: `plugins/user/demo/guides/demo-page-guides` (size / shape / care), `plugins/user/legal/pages/page-legal` (legal notice, privacy, terms of use, terms of sale — footer only), `plugins/user/legal/pages/page-accessibility` (RGAA statement — footer only). Footer identity copy is `plugins/user/footer/identity/footer-identity`.

## Layout

Mobile-first bottom bar, burger menu, desktop nav: core chrome. The theme
skins them. Product axes default to shape / length / size: rename, hide, or
auto-hide when only one value exists. Tax mode defaults to `none` (no VAT
line), as a store setting.

## Layout on disk

```
kernel/back     API: plugin host, shells, catalog, orders, users, stock, cart
kernel/front    Shop chrome (admin nav from bootstrap, plugin UI chunks)
plugins/tuucho/ Bundled plugins grouped by kind (id starts with tuucho-)
plugins/user/   Shop / demo / zip upload (id must not start with tuucho-)
plugin-sdk/     @tuucho/plugin-sdk
sample/         Fictional catalog + courier JSON
scripts/        installer
```
