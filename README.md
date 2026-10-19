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
git clone --branch 0.0.2 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
npm run setup:cli -- --yes \
  --store-name Shop \
  --admin-email admin@shop.example \
  --admin-password 'ShopAdmin1!'
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

Stripe and Mondial Relay keys are optional at install time. Checkout lists
registered **payment gateways**; live payment needs your Stripe test keys in
`kernel/back/.env/dev/.private.env` and `kernel/front/.env/dev/.private.env`.

## Third-party configuration

Env files load in layers under `kernel/back/.env/` and `kernel/front/.env/`:
`.public.env` (committed) then `.private.env` (gitignored secrets). Per-target
folders (`dev`, `preprod`, `prod`) override. Never put a secret in a
`VITE_` variable: those ship in the shop bundle.

| Concern | Where | Kernel or plugin | Variables (names only) |
| --- | --- | --- | --- |
| Postgres | Kernel | Kernel | `DATABASE_URL` (or the split host/user/password vars the installer writes) |
| Stripe charges | `tuucho-payment-stripe` plugin | Plugin registers methods; keys stay in kernel env | Back: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_REQUEST_TIMEOUT`. Front: `VITE_STRIPE_PUBLISHABLE_KEY` |
| Mondial Relay labels | `tuucho-shipping-mondial-relay` / `tuucho-shipping-home` | Plugin owns the method; credentials stay in kernel env | `MONDIAL_RELAY_API2_URL`, `MONDIAL_RELAY_API2_ENSEIGNE`, `MONDIAL_RELAY_API2_LOGIN`, `MONDIAL_RELAY_API2_PASSWORD`, `MONDIAL_RELAY_SENDER_*`, point/home courier and mode codes |
| Mondial Relay tracking | `tuucho-shipping-expedition-cron` | Complement plugin; credentials in kernel env | `MONDIAL_RELAY_API1_URL`, `MONDIAL_RELAY_API1_ENSEIGNE`, `MONDIAL_RELAY_API1_PRIVATE_KEY`, `MONDIAL_RELAY_PUBLIC_TRACKING_URL` |
| Mondial Relay picker (shop) | Front chrome + shipping plugin | Front env | `VITE_MONDIAL_RELAY_BRAND`, `VITE_MONDIAL_RELAY_PICKER_NETWORK_CODE`, optional `VITE_MONDIAL_RELAY_PICKER_COURIER_CODE`, home network/courier codes |
| Mail (SMTP) | Kernel | Kernel | `SMTP_HOST`, `SMTP_PORT`, `SMTP_NO_REPLY_USER`, `SMTP_NO_REPLY_PASSWORD`, `SMTP_FROM_NAME_PREFIX`, `EMAIL_NO_REPLY_FROM`. Chat transport: `SMTP_CHAT_HOST`, `SMTP_CHAT_PORT`, `SMTP_CHAT_USER`, `SMTP_CHAT_PASSWORD`, `EMAIL_CHAT_FROM` |
| Mail recipients | Plugin `tuucho-mail-spy` | Kernel SMTP | Live To is Admin → Spy e-mails. Seed-only if they match unlocked staff and no recipients exist yet: `EMAIL_CONTACT_RECIPIENT`, `EMAIL_CHAT_RECIPIENT`, `EMAIL_ORDER_SPY_RECIPIENT`. Kill switch `DISABLE_SPY_EMAIL`. Reply identity `CONTACT_RECIPIENT_NAME` |
| Local mail dump | Kernel | Kernel | `ROUTE_EMAIL_FOLDER` (not `false` writes under `DEV_EMAIL_USER_DIR` / `_SPY_` / `_CHAT_` instead of SMTP) |

Admin, Plugins, Scan is install (runs schema `up` when the plugin is on).
**Check for updates** then **Apply** walks every git tag between this shop and
the latest official tag (`MAJOR.MINOR.PATCH`, never `v0.0.2`, never `master`).
Plugins “Core” is root `package.json`. Check / Apply walks `shop-release.json`
vs tag `release.json`. A deployed shop cannot claim a kernel by editing
`package.json`. `plugins/user/` is not overwritten
by a Tuucho update. A user plugin with `repository` on `plugin.json` updates
from that GitHub repo only. Disable unloads the plugin and keeps its tables.
Uninstall runs `down` and removes the row. Stripe keys and carrier credentials
do not live in plugin settings: they stay in env files; the plugin only
registers the method.

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
