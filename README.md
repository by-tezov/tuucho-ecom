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
git clone --branch 0.0.4 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
# public JSON is already in git: tuucho-config/config.json and tuucho-config/dev/
cp tuucho-config/config.private.example.json tuucho-config/config.private.json
cp tuucho-config/dev/config.private.example.json tuucho-config/dev/config.private.json
# replace placeholders in tuucho-config/dev/config.private.json (database url, jwt, pii, ops, smtp)
npm run setup:cli -- --yes \
  --store-name Shop \
  --admin-email admin@shop.example \
  --admin-password 'ShopAdmin1!'
# APP_TARGET=dev is the local default (selects tuucho-config/dev/)
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

Files live under `tuucho-config/`. Common (all envs) sit in that folder;
each environment is a subfolder. This clone ships **only** `dev/`.
A new env is a folder, not a closed `dev|preprod|prod` list.

Merge, top to bottom (bottom wins): common public → env public → common
private (or its example) → env private (or its example) → leftover process
overlay (`APP_TARGET`, `PORT`, optional `DATABASE_URL`). `APP_TARGET` is the
folder name (local default `dev`). Missing folder → error naming it.

Public JSON is committed. Private JSON is gitignored; each has a committed
functional `*.example`. Boot: missing private + example present → warning,
load example, launch. Both missing → error. Private present but required keys
missing → error naming each key. `npm --prefix tuucho/kernel/back run config:doctor`
prints the same list plus every folder under `tuucho-config/`.

Plugin credentials use the same public / private / example split under
`tuucho-config/plugins/<plugin-id>/` (user plugins: next to `package.json`, or
`tuucho.configDir`). Runtime source of truth is still the shop DB. First
launch loads files once when that plugin has no operator values; boot never
overwrites Admin. Import and Update from files need `plugin_config_import`;
Export (including secrets) needs `plugin_config_export`. Ordinary Configure
save stays `preferences`. See Admin → Documentation → **Config files**.

| Concern | After first boot | File or Admin |
| --- | --- | --- |
| Kernel policy (TTLs, rates) | Committed `tuucho-config/config.json` | Git (common public) |
| Env URLs / dirs | Committed `tuucho-config/<env>/config.json` | Git (env public) |
| DB / JWT / PII / ops / SMTP passwords | `tuucho-config/config.private.json` and `tuucho-config/<env>/config.private.json` (from those `*.example` files) | Gitignored files |
| Plugin public settings | Committed `tuucho-config/plugins/<id>/config.json` (user plugins: beside `package.json`) | Git, then first launch / Update from files / Configure |
| Plugin secrets | Gitignored `config.private.json` next to that public file (`*.example` committed) | Gitignored file, then sealed `plugins.secrets` |
| Shop name, legal, footer | Admin + `footer-identity` / `page-legal` | Admin (that env’s DB) |
| Stripe | Plugin Configure + `tuucho-config/plugins/tuucho-payment-stripe/` | Admin (secret store on that env) |
| Mondial Relay | Plugin Configure + shipping plugin JSON | Admin (secret store on that env) |
| Spy recipients | Admin → Spy e-mails (`tuucho-mail-spy`) | Admin |
| Gift / loyalty / cart rules | Those plugins’ Configure or Admin commerce screens | Admin |

**How to add an environment** (copy `dev`, do not invent files in the kernel)

```bash
# public + example only — do not copy config.private.json
npm --prefix tuucho/kernel/back run config:env -- create preprod
# or by hand:
# mkdir -p tuucho-config/preprod
# cp tuucho-config/dev/config.json tuucho-config/preprod/config.json
# cp tuucho-config/dev/config.private.example.json tuucho-config/preprod/config.private.example.json
cp tuucho-config/preprod/config.private.example.json \
   tuucho-config/preprod/config.private.json
# edit URLs/paths/CORS in tuucho-config/preprod/config.json — commit that
# fill a **new** database URL, JWT, PII, ops in the private file — never commit
# APP_TARGET=preprod  (or --env preprod on OPS CLIs)
npm --prefix tuucho/kernel/back run config:doctor
```

Do **not** copy another env’s private file onto this one. `prod` is the only
indexed name, and only when that folder exists. Same steps for any name
(`staging`, `prod`, …). There is no `README.todo` on this checkout.

Install from a tag: `npm install` only at the **repo root** (npm workspaces, one lockfile). Do not `cd tuucho/kernel/front && npm install`.

Admin, Plugins, Scan is install (runs schema `up` when the plugin is on).
**Check for updates** then **Apply** walks every git tag between this shop and
the latest official tag (`MAJOR.MINOR.PATCH`, never `v0.0.2`, never `master`).
Plugins “Core” and Check current are the live root `package.json`. Latest is
the newest official GitHub tag. A checkout newer than that tag is ahead (no
Apply). Matching tags: nothing to update. Older local: walk every tag.
`shop-release.json` is last-applied Apply state, not displayed current.
`src/plugins/` is not overwritten
by a Tuucho update (Apply is scoped to `tuucho/`). Kernel/all Apply copies root `package.json`. A user plugin
with `tuucho.repo` / `branch` / `folder` (or npm `repository`) updates from that GitHub repo only. Disable unloads the plugin and keeps its tables.
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
User storefront pages: `src/plugins/demo/guides/demo-page-guides` (size / shape / care), `src/plugins/legal/pages/page-legal` (legal notice, privacy, terms of use, terms of sale — footer only), `src/plugins/legal/pages/page-accessibility` (RGAA statement — footer only). Footer identity copy is `src/plugins/footer/identity/footer-identity`.

## Layout

Mobile-first bottom bar, burger menu, desktop nav: core chrome. The theme
skins them. Product axes default to shape / length / size: rename, hide, or
auto-hide when only one value exists. Tax mode defaults to `none` (no VAT
line), as a store setting.

## Layout on disk

```
tuucho/kernel/back     API: plugin host, shells, catalog, orders, users, stock, cart
tuucho/kernel/front    Shop chrome (admin nav from bootstrap, plugin UI chunks)
tuucho/plugins/        Bundled plugins grouped by kind (id starts with tuucho-; no extra tuucho/ segment)
src/plugins/           Shop / demo / zip upload (id must not start with tuucho-)
tuucho/plugin-sdk/     @tuucho/plugin-sdk
tuucho-config/         Operator public + private JSON
tuucho/kernel-surface.json  Published filters, slots, UI, gift peer service
sample/                Fictional catalog + courier JSON
scripts/               installer + first-setup
```
