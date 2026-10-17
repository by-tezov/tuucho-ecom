# Plugin API

tuucho-ecom is a kernel plus plugins. Core owns catalog, cart, checkout,
orders, accounts, the admin shell, and **openings** so plugins can extend
Preferences, My profile, sign-in methods and notifications. Pages, theme,
payments, shipping, vouchers, cart rules, gifts, loyalty, product requests,
reviews, journals, expedition cron, and this developer guide are plugins.

There is no marketplace. Add a plugin by dropping a folder on disk, then
scanning (or refreshing) Admin, Plugins. The same guide is also inside admin:
**Admin, Documentation** (`docs-developer`). That item sits at the top of the
admin sidebar, above Accueil, with no group label. It is a small website
(nav plus articles). Disable the plugin and the menu disappears.

## Where plugins live

```
back/plugins/<id>/plugin.json
```

The folder name is the plugin id. It must match `"id"` in the manifest and
use only `a-z`, `0-9` and `-`.

| Folder | Kind | What it does |
| --- | --- | --- |
| `theme-default` | Theme | CSS tokens. Required. Configure: colour customizer. |
| `page-home` | Page | Landing. Required. Enable equals shop menu. |
| `page-about` | Page | About. Enable equals shop menu. |
| `page-guides` | Page | Size / shape / care. |
| `page-legal` | Page | Legal pages. |
| `page-studio-note` | Page | Minimal extra page (copy this). Configure: title and body. |
| `payment-stripe` | Payment | Stripe methods. Configure: which methods checkout may offer. |
| `shipping-home` | Shipping | Home address couriers. Configure: packet prices. |
| `shipping-mondial-relay` | Shipping | Point Relais. Configure: packet prices. |
| `commerce-vouchers` | Commerce | Promo codes. Configure opens Admin, Vouchers. |
| `commerce-cart-rules` | Commerce | Thresholds and gifts. Configure opens Admin, Cart rules. |
| `commerce-reviews` | Commerce | Avis clientes. Configure opens Admin, Reviews. |
| `commerce-product-requests` | Commerce | Demande produit. Size-request toggle on Preferences. |
| `commerce-loyalty` | Commerce | Fidélité / cagnotte. Configure opens Admin, Loyalty. |
| `commerce-gift` | Commerce | Cadeau. Configure opens Admin, Gift. |
| `journal-api` | Generic | Journal storage API. Complements depend on it. |
| `journal-admin` | Generic | API journal UI. `dependsOn: journal-api`. |
| `journal-email` | Generic | Email journal UI. `dependsOn: journal-api`. |
| `journal-cron` | Generic | Cron journals UI. `dependsOn: journal-api`. |
| `shipping-expedition-cron` | Generic | Shipment tracking cron. Complements both shipping plugins. |
| `docs-developer` | Docs | In-admin developer guide. Configure opens Admin, Documentation. |

TypeScript that must run with the API still lives under
`back/src/modules/plugins/` (hooks) or a dedicated module. A page plugin can
ship with only a manifest and settings.

## How to add a plugin

1. Copy `back/plugins/page-studio-note/` to `back/plugins/your-id/`.
2. Edit `plugin.json`: set `"id"` to `your-id` (same as the folder), choose a
   `"kind"`, and fill `name`, `description`, `route` / `nav` for a page, or
   `courierCodes` for shipping.
3. Open the shop admin: **Plugins** in the sidebar.
4. Click **Scan for new plugins**. The new id appears in the list. A refresh
   of that page also reads the folder; Scan reports what was newly inserted.
5. Enable it, then **Configure**.

No restart is required for a new `plugin.json`. Code you add under
`back/src/` still needs the API process to reload.

There is no Menus tab. If a page plugin is on, its header / burger / footer
entry shows. If it is off, the entry disappears.

## Manifest

```json
{
  "id": "page-studio-note",
  "name": "Studio note",
  "version": "1.0.0",
  "kind": "theme | page | payment | shipping | commerce | docs | generic",
  "description": "A short operator-facing summary.",
  "required": false,
  "defaultEnabled": true,
  "provides": ["StorefrontPage"],
  "dependsOn": [{ "id": "optional-parent", "version": ">=1.0.0" }],
  "engines": { "core": ">=1.0.0 <2.0.0" },
  "route": "/studio-note",
  "nav": { "key": "studio-note", "order": 45, "bottomBar": false },
  "courierCodes": ["colissimo-home"],
  "defaultSettings": {
    "title": "Studio note",
    "body": "Shown on the public page. Editable in Admin, Plugins, Configure."
  },
  "settingsSchema": {
    "title": { "type": "string", "label": "Title" },
    "body": { "type": "text", "label": "Body" }
  }
}
```

| Field | Notes |
| --- | --- |
| `id` | Must equal the folder name. |
| `kind` | `theme`, `page`, `payment`, `shipping`, `commerce`, `docs`, or `generic`. One active theme. |
| `required` | Admin cannot disable it (`page-home`, `theme-default`). |
| `defaultEnabled` | Seeded into `plugins.enabled` on first insert. |
| `provides` | Contract names this plugin implements. |
| `dependsOn` | Other plugin ids, or `{ id, version }` ranges. Complements disappear when a parent is off (`isPluginEffectivelyEnabled`). Scan/enable reject missing or out-of-range parents. Not auto-enabled. |
| `engines.core` | Semver range of the kernel, e.g. `>=1.0.0 <2.0.0`. Incompatible plugins cannot enable. |
| `permissions` | Staff codes added to Admin, Roles while this plugin (and parents) is on. |
| `route` / `nav` | Page plugins: public path and menu placement. |
| `courierCodes` | Shipping plugins: courier rows this plugin owns. |
| `defaultSettings` | Seeded into `plugins.settings` on first insert. |
| `settingsSchema` | `{ type, label }` per field. Types: `string`, `text`, `number`, `boolean`. Admin auto-builds the Configure form. |

## Lifecycle

Scan (Admin, Plugins, Scan for new plugins) reads every `plugin.json` and
inserts missing rows. `listPlugins()` also ensures rows on every read.

Enable writes `plugins.enabled` and fires the `plugin.enabled.changed`
action. Page plugins that are on appear in the shop menu.

Configure opens that plugin settings page:

- Theme tokens on `theme-default`
- Packet prices on shipping plugins
- Stripe methods on `payment-stripe`
- Page title/body from `settingsSchema`
- Vouchers, cart rules, and documentation open their own admin screens

`PATCH /admin/plugins/:id` with `{ "settings": { ... } }` merges JSON.

## Hooks and filters

WordPress-style bus in `back/src/modules/plugins/application/hooks.ts`.

```ts
import { addAction, addFilter, doAction, applyFilters } from '../application/hooks.js';

addAction('plugin.enabled.changed', (id, enabled) => {
  // side effect after an admin toggle
});

addFilter('storefront.bootstrap', (payload) => {
  return payload;
});
```

| Name | Type | When |
| --- | --- | --- |
| `plugin.enabled.changed` | action | After `PATCH /admin/plugins/:id` with `enabled`. Args: `id`, `enabled`. |
| `storefront.bootstrap` | filter | `GET /storefront/bootstrap`. Return the (possibly extended) payload. |
| `core.preferences.entries` | filter | Plugin rows on Admin, Préférences (use this instead of a blank Configure page). |
| `core.profile.entries` | filter | Extra cards on My profile. |
| `core.signIn.methods` | filter | Extra sign-in methods. |
| `core.notifications.entries` | filter | Extra notification rows. |
| `cart.shipping.methods` | filter | Shipping methods on the cart (courierCodes + prices). |
| `cart.loyalty.lines` | filter | Loyalty / cagnotte lines on cart totals. |
| `cart.vouchers` | filter | Promo codes on checkout. |
| `cart.gifts` | filter | Gift create / receiver shop. |
| `orders.history.entries` | filter | Extra rows on order history (loyalty snapshot, shipping, gifts). |

Priority is a number, default `10`. Lower runs first.

## Storefront routes

Page plugins set `route` and `nav`. Extra hyphenated routes (for example
`/studio-note`) render through `PluginContentPage`, which reads
`settings.title` and `settings.body`. Dedicated pages (home, about, guides,
legal) keep their React routes and still honour enable for menu visibility.

## Admin pages

A plugin can add an admin screen. Register the React route under `/admin/...`,
add a nav item with `pluginId`, and gate it with `usePluginEnabled(id)` plus a
server `isPluginEnabled` check. Disable the plugin and both the sidebar entry
and the HTTP routes go away (`404 plugin_disabled`).

This Documentation plugin is the example (`kind: docs`). Vouchers, cart
rules, reviews, gifts, loyalty and product requests add commerce admin pages
the same way.

## Core vs plugin (Te lock)

Stay in core: libraries, roles, orders, stock, contact, users, impersonate,
préférences, boutique+axes, plugin management, vocabulaire, collection, my
profile, session, sign-in methods (shell), addresses, payment-method shell,
order history, notifications.

Must be plugins: Demande produit, Fidélité/cagnotte, Cadeau, reviews, journal
family, vouchers, cart rules, shipping, payment gateways, pages, theme, docs,
expedition-cron.

Do not move collection, contact, users, orders, stock, roles, vocabulaire, or
shop/axes into plugins.

Openings (core APIs, prefer these over a blank Configure page):

- Préférences: `core.preferences.entries` when a full Configure page is not pertinent
- My profile: `core.profile.entries`
- Sign-in methods: `core.signIn.methods`
- Notifications: `core.notifications.entries` (participate or add rows)
- Cart: `cart.shipping.methods`, `cart.loyalty.lines`, `cart.vouchers`, `cart.gifts`
- Orders / history: `orders.history.entries`
- Services: `registerPluginService` / `getPluginService` (never private imports)
- Roles: `manifest.permissions[]`, `requirePermission`, `requirePluginEnabled`

Each preinstalled plugin ships `docs/handbook.json` (and docs-developer also ships `docs/articles.json` for the core handbook and worked examples). `GET /admin/docs` loads them. Disable a plugin and its docs group is marked disabled.

## Versioning

Core version is `CORE_VERSION` (`1.0.9`, same as `back/package.json`). Admin, Plugins shows it. Each plugin shows `version` and `engines.core`.

- Scan disables plugins whose `engines.core` or `dependsOn` range fails, and lists them in `incompatible`.
- `PATCH /admin/plugins/:id` `{ "enabled": true }` returns `409 plugin_incompatible` when the kernel is outside `engines.core`, a `dependsOn` plugin is missing, or its version is out of range.

Bump the kernel by changing `CORE_VERSION` and `package.json` together. A 1.x kernel still satisfies `>=1.0.0 <2.0.0`. A 2.0 kernel needs plugins to raise `engines.core`.

Worked examples in Admin, Documentation: profile menu, courier on cart, fidélité on cart and order history, permissions.

## Create a plugin with AI

The kernel is built so an AI can add plugins. The Cursor skill
`.cursor/skills/tuucho-create-plugin/SKILL.md` is the easiest path: point an
agent at it. Admin, Documentation has the same page.

## Core APIs and database

Never reach around the kernel. Do not query product or order tables from a
plugin HTTP router as a shortcut. Use the owning module `application/`
functions, or the public JSON API. Cross-module imports may reach another
module `application/` only, never its `http/` or `infrastructure/`.

### Plugin registry

`listPlugins()`, `isPluginEnabled(id)`, `setPluginEnabled(id, enabled)`,
`patchPluginSettings(id, settings)` live in
`back/src/modules/plugins/application/pluginStore.ts`. The `plugins` table
holds `id`, `enabled`, `settings` JSONB.

- `GET /admin/plugins` lists installed plugins
- `GET /admin/plugins/:id` is one plugin (shipping plugins include `rates`)
- `POST /admin/plugins/scan` discovers new folders
- `PATCH /admin/plugins/:id` accepts `enabled`, `settings` or `rates`
- `GET /storefront/bootstrap` is public: store identity, theme tokens, menus
  (page plugins that are on), and `plugins[]` with settings

Admin changes should call `useRefreshStorefrontBootstrap` after save.

### Store settings (core, not a plugin menu)

`GET /admin/store` and `PATCH /admin/store` own identity (`name`, `suffix`,
`taxMode`), product axes, and theme tokens. Theme tokens are edited on the
theme plugin Configure page, which PATCHes `store.theme`. Identity and axes
are **Shop** (`/admin/shop`). `taxMode` none is the auto-entrepreneur default
(no VAT line).

Preferences keys `store.identity`, `store.product_axes`, `store.theme`,
`store.menus` in `app_preferences`. Read them through `storeSettings.ts`,
not with ad-hoc SQL.

### Catalog, orders, customers

- Products: catalog application and `GET /gallery`, `GET /gallery/product/:uid`.
  Do not `UPDATE product_availability` from a plugin.
- Orders: orders application, `GET /admin/orders`, `GET /account/orders`.
  Checkout pricing is server-authoritative in `priceCheckout`.
- Customers: identity and addresses modules. PII is encrypted. Never
  `SELECT` plaintext columns that the kernel encrypts.

### Other plugin settings

Read another plugin settings from `listPlugins()` and the matching id.
Example: a page plugin can read whether `theme-default` is enabled before it
assumes tokens exist. Do not import another plugin `infrastructure/`. Prefer
`applyFilters` so several plugins can contribute.

### Courier prices

Packet prices live in `courier_packets.price` as a number or a map of ISO
country codes (`FR`, `BE`). `listCourierPacketPrices` and
`setCourierPacketPrice` in delivery/application are what the shipping plugin
Configure page uses. Import those from plugins HTTP, not from plugins
application (architecture: plugins application must not import delivery).

## Sample: theming plugin

`theme-default` is required. First-install colours live in CSS `light-dark()`
tokens: white surfaces and near-black text/buttons in light, the same system
grayed darker in dark. `document.documentElement` exposes `--color-accent`,
`--color-bg`, `--color-ink`, plus card, header and hero tokens. A fresh
`setup:cli` does not overlay hex tokens, so both schemes stay dual.

Admin, Plugins, Default theme, Configure. Each colour is a labelled field:
swatch plus hex, then Save. Changing a swatch applies the CSS variable
immediately. Save writes `store.theme` via `PATCH /admin/store`.

`ThemeTokens` in the shop reads `bootstrap.theme.tokens` and sets the same
variables. Layout chrome (header, burger, bottom bar, footer) uses those
variables. Product pages do not hard-code brand colours. Only one theme
should be enabled.

## Sample: storefront page and menu

There is no Menus tab. If `page-about` is on, About appears in the header,
burger and footer. If it is off, it disappears. Home is required.

`page-home` (`/home`) is the landing page. `page-about` (`/about`),
`page-guides` (`/sizes`), `page-legal` (`/legal`) have dedicated React
routes. Their nav keys are `home`, `about`, `guide`, `legal`.

To add a page without new React: copy `back/plugins/page-studio-note/`,
change `id`, `route` and `nav.key`, Scan, Enable. The public URL is the
route (locale prefix `/fr/studio-note`). Configure edits title and body
through `settingsSchema`. `PluginContentPage` renders those settings.

## Sample: admin page plugin

`docs-developer` (`kind: docs`) adds Admin, Documentation: a small website
(nav plus article), not a raw markdown dump. Disable it and the menu item
disappears.

`commerce-vouchers` owns promo codes. Admin, Vouchers is the CRUD. Checkout
shows the promo field only while the plugin is on. Disable it: sidebar item
gone, `GET /admin/vouchers` returns `404 plugin_disabled`, `previewVoucher`
and holds refuse the code.

`commerce-cart-rules` owns thresholds, gifts and similar alterations.
Admin, Cart rules is the CRUD. `listCartRules` returns an empty list when
the plugin is off, so checkout and the gallery preview stop applying rules.

On Admin, Plugins, Configure next to Documentation opens this guide.
Configure next to Vouchers opens `/admin/vouchers`. Configure next to Cart
rules opens `/admin/cart-rules`. Theme and shipping still open
`/admin/plugins/<id>`.

## Contracts

Core owns these TypeScript types in
`back/src/modules/plugins/domain/contracts.ts`.

### Theme

```ts
interface ThemeContract {
  id: string;
  tokens: Record<string, string>; // CSS variables, e.g. --color-accent
  fonts?: { display?: string; body?: string };
}
```

### StorefrontPage

```ts
interface StorefrontPageContract {
  id: string;
  route: string;
  navKey: string;
  required?: boolean;
}
```

### PaymentGateway

```ts
interface PaymentGatewayContract {
  id: string;
  methods: Array<'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay'>;
}
```

Disabling `payment-stripe` turns those checkout methods off.

### ShippingMethod

```ts
interface ShippingMethodContract {
  id: string;
  courierCodes: string[];
}
```

`shipping-home` owns `colissimo-home`, `chronopost-home`,
`mondial-relay-home`. `shipping-mondial-relay` owns `mondial-relay-point`.
Enabling or disabling the plugin toggles the matching `couriers.enabled`
rows.

### CheckoutAlteration / AdminPage

Vouchers and cart rules provide both: they alter checkout when enabled, and
they register admin screens. Documentation provides `AdminPage` only.

## Admin UI

| Sidebar | Path | Contents |
| --- | --- | --- |
| **Documentation** | `/admin/docs` | In-admin guide (docs-developer). Top of the sidebar, above Accueil, no group label. |
| **Plugins** | `/admin/plugins` | List, status, required, Enable, Configure, Scan |
| **Shop** | `/admin/shop` | Store identity, tax mode, product axes (Visible / Hide when only one value) |
| **Vouchers** | `/admin/vouchers` | Promo CRUD (commerce-vouchers) |
| **Cart rules** | `/admin/cart-rules` | Rule CRUD (commerce-cart-rules) |
| **Reviews** | `/admin/reviews` | Avis clientes (commerce-reviews) |
| **Loyalty** | `/admin/loyalty` | Fidélité (commerce-loyalty) |
| **Gift** | `/admin/gift` | Cadeau (commerce-gift) |
| **Product requests** | `/admin/product-requests` | Demande produit (commerce-product-requests) |

Auth: signed-in staff with the matching permission (`preferences` for
Plugins, Shop, Documentation; `vouchers` / `cart_rules` for those screens).

HTTP (also in `back/docs/api/01-admin.md`):

- `GET /admin/plugins` list, including `rates[]` on shipping plugins
- `GET /admin/plugins/:id` one plugin
- `POST /admin/plugins/scan` discover `back/plugins/*/plugin.json`
- `PATCH /admin/plugins/:id` body: `{ "enabled": true }`, `{ "settings": { ... } }`, or `{ "rates": [{ "code", "packets": [{ "key", "price" }] }] }`
- `GET` / `PATCH /admin/store` identity, axes, theme
- `GET /storefront/bootstrap` public payload the shop chrome reads

Home (`page-home`) and the default theme cannot be disabled.

## Front contracts

`GET /storefront/bootstrap` includes `plugins[]` (id, enabled, kind, route,
nav, settings) and `menus[]`. Header and footer hide a page when its plugin
is disabled. Theme tokens from bootstrap (and from the live customizer)
paint the chrome.
