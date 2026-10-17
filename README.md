# tezov-ecommerce

Open-source single-shop e-commerce. One atelier, plugins like WordPress,
Herd/Local friendly. MIT licensed.

Core is the mechanic: catalog, cart, checkout, orders, accounts, admin shell,
and a plugin runtime (hooks/filters, enable/disable). Pages, theme, payments
and shipping are plugins.

The sample shop is **Lumen**, a fictional handmade atelier. It is not a
Lumen clone.

## Five-minute install

Needs Node 22+, Docker (Postgres 10 on host port **5434**), and npm.

```bash
cd /home/tezov/Local/e-com_white-brand
npm run setup:cli -- --yes \
  --store-name Lumen \
  --admin-email admin@lumen.test \
  --admin-password 'LumenAdmin1!'
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
the methods; live payment needs your Stripe test keys in
`back/.env/dev/.private.env` and `front/.env/dev/.private.env`.

## Plugins shipped

| Plugin | Kind | Notes |
| --- | --- | --- |
| `theme-default` | Theme | Tokens + customizer. Required. |
| `page-home` | Page | Landing. Required. |
| `page-about` | Page | Sample about. |
| `page-guides` | Page | Size / shape / care guides. |
| `page-legal` | Page | Terms, privacy, cookies. |
| `payment-stripe` | Payment | Card, PayPal, Bancontact, Google Pay, Apple Pay. |
| `shipping-home` | Shipping | Home address (Colissimo, Chronopost, Mondial Relay home). |
| `shipping-mondial-relay` | Shipping | Point Relais pickup. |
| `commerce-vouchers` | Commerce | Promo codes. Disable hides admin and checkout. |
| `commerce-cart-rules` | Commerce | Thresholds and gifts. Disable hides admin and checkout. |
| `docs-developer` | Docs | In-admin developer guide (Admin, Documentation). |

See [docs/plugins.md](docs/plugins.md) (same text as Admin, Documentation).

## Layout

Mobile-first bottom bar, burger menu, desktop nav: core chrome. The theme
skins them. Product axes default to shape / length / size: rename, hide, or
auto-hide when only one value exists. Tax mode defaults to `none` (no VAT
line), as a store setting.

## Layout on disk

```
front/     Vite + React shop
back/      Node API + Postgres
sample/    Fictional catalog + courier JSON (replaces a manager project)
scripts/   installer
```
