# Plugin API

tuucho-ecom is a kernel plus plugins. Core owns catalog, cart, checkout,
orders, accounts, the admin shell, and **openings** so plugins can extend
Preferences, My profile, sign-in methods and notifications. Pages, theme,
payments, shipping, vouchers, cart rules, gifts, loyalty, product requests,
Vinted review, journals, expedition cron, and this developer guide are plugins.

There is no marketplace. Add a plugin by dropping a folder on disk, then
scanning (or refreshing) Admin, Plugins. The same guide is also inside admin:
**Admin, Documentation** (`tuucho-docs-developer`). That item sits at the top of the
admin sidebar, above Accueil, with no group label. It is a small website
(nav plus articles). Disable the plugin and the menu disappears.

## Vocabulary

| Say this | Meaning |
| --- | --- |
| **Kernel** | Always-on host: plugin host, cart, checkout orchestration, orders, stock, users, payment-method shell, courier shell, product SEO fields |
| **Bundled plugin** | First-party package under `plugins/tuucho/<group>/<feature>/<id>/` (can be disabled). Id starts with `tuucho-`. |
| **User plugin** | Same contract under `plugins/user/<group>/…/<id>/` (drop-in, no kernel edit). Id must not start with `tuucho-`. When a user plugin has locale complements, parent and `*-locale-*` live in one feature folder. |
| **Opening** | Named filter or action the kernel applies (`addFilter` / `addAction`) |
| **Shell** | Kernel list that **gateways** or **shipping methods** register into |
| **Payment gateway** | e.g. `tuucho-payment-stripe`, registers methods into the payment-method shell |
| **Shipping method** | e.g. `tuucho-shipping-home`, registers courier codes into the courier shell |
| **Complement** | Plugin with `dependsOn` (expedition cron complements shipping; `<id>-locale-fr` complements a parent) |
| **Locale plugin** | `kind: locale`. Kernel UI is English. `tuucho-locale-fr` adds French. Each bundled plugin ships `<id>-locale-fr`. |
| **Secret store** | `settingsSchema` field `type: "secret"` → `plugins.secrets`. Never kernel JSON, never bootstrap, never `VITE_*`. |

Public plugin knobs go on that plugin’s `settingsSchema` / `plugins.settings`.
Do not add `MONDIAL_*`, `STRIPE_*`, or `VITE_SHOP_*` to kernel JSON.

## Robots: API origin vs storefront origin

The JSON API and the shop are different hosts.

| Origin | Who owns `/robots.txt` | What it says |
| --- | --- | --- |
| **API** (`api.` / local `:3010`) | Kernel `crawlerPolicy` | Allow fetch, plus `X-Robots-Tag: noindex` on JSON |
| **Storefront** (shop / Vite) | Kernel SEO engine, plus `seo.robots.rules` | Default `Allow: /` and `Sitemap:`; plugins add Disallow rules |

Inspect the assembled shop document at **Settings → SEO** or `GET /storefront/robots.txt` on the API. Do not mount shop robots at the API `/robots.txt`.

## Where plugins live

```
plugins/tuucho/<group>/<feature>/<id>/package.json  # bundled; tuucho.id starts with tuucho-
plugins/tuucho/<group>/<feature>/<id>/back/register.ts
plugins/tuucho/<group>/<feature>/<id>-locale-fr/    # complement sits next to parent
plugins/tuucho/locale/tuucho-locale-fr/             # standalone locale pack (no parent)
plugins/user/<group>/<feature>/<id>/                # user / upload; id must not use tuucho-
plugin-sdk/                                         # @tuucho/plugin-sdk (not a plugin)
```

The leaf `package.json` is the only plugin file. npm `version` /
`description` / optional `repository` sit at the top. Plugin fields live
under `"tuucho": { id, kind, installPath, engines.core, … }`. That
`tuucho` object is the discriminator: scan never treats `node_modules`
(skipped by name) or a plain npm package as a plugin. There is no
`plugin.json` and no stub generator.

The plugin host `import()`s `back/register.ts` for every effectively enabled
plugin. Disk manifests are the catalogue. There is no second shipped list.
Scan walks nested folders. The **leaf** folder name is the plugin id. It must
match `"id"` in the manifest and use only `a-z`, `0-9` and `-`. Grouping
folders (`tuucho/commerce/gift`, `user/demo/guides`) are not
plugins. A plugin and its `*-locale-*` complements share one feature folder
(short slug: `gift`, `faq`, `guides`). The kernel locale pack
`tuucho-locale-fr` stays in `locale/` — do not invent a fake parent for it.

| Folder | Kind | What it does |
| --- | --- | --- |
| `tuucho-theme-default` | Theme | CSS tokens. Required. Configure: colour customizer. |
| `tuucho-page-home` | Page | Landing. Required. Enable equals shop menu. |
| `tuucho-page-about` | Page | About. Enable equals shop info menu. |
| `tuucho-contact` | Generic | `/contact`. Info menu while enabled. Not a page-plugin nav.key. |
| `tuucho-home-faq` | Generic | Home FAQ block (`slot.home.faq`). Not a page. |
| `tuucho-onboarding` | Generic | Home tour (`slot.home.onboarding`) plus account replay. |
| `tuucho-home-featured` | Generic | Home new-arrivals (`slot.home.featured`). |
| `tuucho-locale-fr` | Locale | Kernel French (admin + storefront chrome + email). |
| `tuucho-payment-stripe` | Payment | Stripe methods. Checkout switches live in App Preferences, not Configure. |
| `tuucho-shipping-home` | Shipping | Home address couriers. Prices: kernel Couriers JSON page. |
| `tuucho-shipping-mondial-relay` | Shipping | Point Relais. Prices: kernel Couriers JSON page. |
| `tuucho-commerce-vouchers` | Commerce | Promo codes. Admin, Vouchers in the sidebar. |
| `tuucho-commerce-cart-rules` | Commerce | Thresholds and gifts. Admin, Cart rules in the sidebar. |
| `tuucho-commerce-vinted-review` | Commerce | Vinted reviews. Admin, Vinted review in the sidebar. |
| `tuucho-commerce-product-requests` | Commerce | Demande produit. Size-request toggle on Preferences. |
| `tuucho-commerce-loyalty` | Commerce | Fidélité / cagnotte. Admin, Loyalty in the sidebar. |
| `tuucho-commerce-gift` | Commerce | Cadeau. Admin, Gift in the sidebar. |
| `tuucho-journal-api` | Generic | Journal storage API. Complements depend on it. |
| `tuucho-journal-admin` | Generic | API journal UI. `dependsOn: tuucho-journal-api`. |
| `tuucho-journal-email` | Generic | Email journal UI. `dependsOn: tuucho-journal-api`. |
| `tuucho-journal-cron` | Generic | Cron journals UI. `dependsOn: tuucho-journal-api`. |
| `tuucho-shipping-expedition-cron` | Generic | Shipment tracking cron. Complements both shipping plugins. |
| `tuucho-docs-developer` | Docs | In-admin developer guide. Admin, Documentation in the sidebar. |
| `tuucho-seo-sitemap` | SEO | Extra page-plugin URLs on the kernel sitemap. Hub: Settings → SEO. |
| `tuucho-seo-robots` | SEO | Extra Disallow rules on kernel shop robots. Hub: Settings → SEO. |
| `tuucho-seo-redirects` | SEO | Applies the kernel `seo_redirects` table. Hub: Settings → SEO. |

User (not bundled) storefront pages:

| Folder | Kind | What it does |
| --- | --- | --- |
| `page-legal` | Page | Legal notice, privacy, terms of use, terms of sale. Footer only. |
| `page-accessibility` | Page | RGAA accessibility statement. Footer only. |
| `footer-identity` | Generic | Shop name / tagline / copyright in `slot.footer.identity`. |
| `demo-page-guides` | Page | Demo size, shape and care guides. Info menu while enabled. |

Runtime TypeScript lives in the plugin package (`back/register.ts` plus
`back/src/`). The kernel does not statically import loyalty, vouchers, gifts
or cart-rules. A page plugin can still ship with only a manifest and settings.

## How to add a plugin

1. Copy `plugins/user/demo/guides/demo-page-guides/` to
   `plugins/user/<group>/your-id/`.
2. Edit leaf `package.json`: npm `version` and `description` (locale packs may omit description),
   optional HTTPS GitHub `repository` (user plugins only). Under `"tuucho"`, set `"id"` to `your-id`
   (same as the leaf folder, not `tuucho-*`), `"kind"`, `name`, `engines.core` `>=0.0.1 <1.0.0`,
   `installPath`, plus `route` / `nav` for a page or `courierCodes` for shipping. Omit `nav` for
   footer-only documents (`page-legal`, `page-accessibility`). Depend on `@tuucho/plugin-sdk`.
3. Add `back/register.ts` that calls `addFilter` / `addAction` /
   `registerPluginService` / `registerPaymentGateway` / `registerShippingMethod`.
4. Open the shop admin: **Plugins** in the sidebar.
5. Click **Scan for new plugins**. Enable it, then **Configure**.

Toggling a plugin reloads the host. No kernel source edit is required for a
profile opening or a `checkout.quote` filter. The shipped page-plugin demo is
`plugins/user/demo/guides/demo-page-guides`.

There is no Menus tab. If a page plugin is on, its header / burger / footer
entry shows. If it is off, the entry disappears.

Admin Home is kernel chrome (urgent orders, library stats). Plugins add **numbers**
on `slot.admin.dashboard` (`ui.AdminStatCard`, loyalty) and **attention** tiles on
`slot.admin.dashboard.attention` (`ui.AdminAttentionCard`, product-requests).
Disabled plugins drop out. New home regions are extra `CORE_FRONT_SLOTS` ids.

## Languages (en + fr)

Kernel packages ship English only. The locale shell (switcher, `t()`, catalog
load) stays in the kernel. Product languages are English and French; extra
codes (es/it/nl/pt/th) are not supported.

- Enable `tuucho-locale-fr` to offer French in the switcher and overlay kernel chrome.
- Disable it and the shop stays English.
- Every bundled feature plugin is English in its own package.
- French for a plugin is `<id>-locale-fr` with `dependsOn` on the parent
  (`kind: locale`). Disable the complement and that plugin stays English even
  when `tuucho-locale-fr` is on.
- Register extra email copy with `api.registerEmailCatalog('key:fr', catalog)`.
  Kernel email uses `emailStrings(language)` which reads the `fr` catalog.

## Manifest

Leaf `package.json` only. npm fields plus a `tuucho` block:

```json
{
  "name": "@tuucho/plugin-demo-page-guides",
  "private": true,
  "type": "module",
  "version": "1.0.0",
  "description": "A short operator-facing summary.",
  "repository": "https://github.com/acme/demo-page-guides",
  "tuucho": {
    "id": "demo-page-guides",
    "name": "Guides",
    "kind": "theme | page | payment | shipping | commerce | docs | generic | seo | locale",
    "required": false,
    "defaultEnabled": true,
    "provides": ["StorefrontPage"],
    "dependsOn": [{ "id": "optional-parent", "version": ">=1.0.0" }],
    "engines": { "core": ">=0.0.1 <1.0.0" },
    "installPath": "plugins/user/demo/guides/demo-page-guides",
    "route": "/sizes",
    "nav": { "key": "guide", "order": 30, "bottomBar": false },
    "courierCodes": ["colissimo-home"],
    "defaultSettings": {
      "title": "Page title",
      "body": "Shown on the public page. Editable in Admin, Plugins, Configure."
    },
    "settingsSchema": {
      "title": { "type": "string", "label": "Title" },
      "body": { "type": "text", "label": "Body" }
    }
  },
  "dependencies": {
    "@tuucho/plugin-sdk": "file:../../../../../plugin-sdk"
  }
}
```

| Field | Notes |
| --- | --- |
| `id` | Must equal the leaf folder name. Bundled: `tuucho-*`. User: anything else matching `[a-z0-9-]+`. |
| `description` | Short operator-facing summary of what the plugin does. Required. Scan skips and archive import rejects a non-locale plugin with a missing or empty description. Locale plugins (`*-locale-[a-z]{2}` complements and standalone packs such as `tuucho-locale-fr`) may omit it. |
| `installPath` | Repo-relative posix path of the package folder (leaf equals `id`). Tuucho ids: `plugins/tuucho/…`. User ids: `plugins/user/…`. Required on archive import. |
| `repository` | Optional HTTPS GitHub repo root (`https://github.com/owner/repo`) on **user** plugins only. Check for updates uses that origin for this id. Ignored on `tuucho-*`. Missing means zip-only. |
| `kind` | `theme`, `page`, `payment`, `shipping`, `commerce`, `docs`, `generic`, `seo`, or `locale`. One active theme. |
| `required` | Admin cannot disable it (`tuucho-page-home`, `tuucho-theme-default`). |
| `defaultEnabled` | Seeded into `plugins.enabled` on first insert. |
| `provides` | Contract names this plugin implements. |
| `dependsOn` | Other plugin ids, or `{ id, version }` ranges. Complements disappear when a parent is off (`isPluginEffectivelyEnabled`). Scan/enable reject missing or out-of-range parents. Not auto-enabled. |
| `engines.core` | Semver range of the kernel. Shipped plugins use `>=0.0.1 <1.0.0`. Incompatible plugins cannot enable. |
| `permissions` | Staff codes added to Admin, Roles while this plugin (and parents) is on. |
| `route` / `nav` | Page plugins: public path and menu placement. |
| `courierCodes` | Shipping plugins: courier rows this plugin owns. |
| `defaultSettings` | Seeded into `plugins.settings` on first insert. |
| `settingsSchema` | `{ type, label }` per field. Types: `string`, `text`, `number`, `boolean`, `secret`. Admin auto-builds the Configure form. `secret` is write-only and never sent on storefront bootstrap. |

## Lifecycle

Scan (Admin, Plugins, Scan for new plugins) reads every plugin `package.json` (`tuucho` block) and
inserts missing rows. That is **install**: the host then applies pending
`back/migrations/` `up` files for enabled compatible plugins.
`listPlugins()` also ensures rows on every read.

Enable writes `plugins.enabled` after running pending `up` files, then fires
the `plugin.enabled.changed` action. Page plugins that are on appear in the
shop menu. Disable unloads back and front and **keeps** tables.

Uninstall is a separate action (`POST /admin/plugins/:id/uninstall` with
`{ "confirm": true }`). It runs `down`, drops leftover `plugin_<id>_…`
tables, flushes that plugin's namespaced cache, and deletes the `plugins`
row. Required plugins cannot uninstall.
If the folder was deleted first, the row stays with `missingFromDisk` until
you uninstall or restore the folder.

## Schema: how a plugin gets tables

A plugin **must not ALTER kernel tables**. Extra data lives in tables the
plugin owns:

1. Add one `back/migrations/001_something.js` baseline (filename
   `^\d{3,}[_-][a-z0-9][a-z0-9_-]*\.js$`). Do not start a 001-then-002 chain
   unless new work lands after this reset.
2. Export `up(client)` and `down(client)`. `up` creates
   `plugin_<id with underscores>_…` (hyphens in the id become underscores).
   Foreign keys may point at kernel entities (`users(id)`, `orders(id)`).
3. The host wraps `client.query` and rejects SQL that mutates any other
   table name.
4. Enable, scan (when enabled), and boot of an enabled plugin apply pending
   files, then set `plugins.schema_version` to the package `version`. Applied
   filenames are stored in `plugins_schema_migrations`.

Worked example: `plugins/tuucho/messaging/mail-spy/tuucho-mail-spy/back/migrations/001_spy_mail.js`
creates `plugin_tuucho_mail_spy_channels` (and recipients) and drops them on uninstall.
Kernel unit tests assert the prefix, reject `ALTER TABLE products`, and run
that up/down pair.

Disable ≠ uninstall. Disable keeps `plugin_tuucho_mail_spy_channels`.
Uninstall drops it.

Configure is only that plugin's settings form (`/admin/plugins/:id`). Omit
the link when there is no form. Admin CRUD (docs, SEO, journals, commerce
inboxes) is a sidebar item via `adminNav`, not Configure. Courier texts,
times, prices and parcels are the kernel Couriers JSON page.

- Theme tokens on `tuucho-theme-default`
- Stripe methods on `tuucho-payment-stripe`
- Page title/body from `settingsSchema`

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
| `cart.lines` | filter | Agnostic cart extras. Kernel has no voucher/loyalty fields here. |
| `checkout.quote` | filter | Extra lines and `quote.plugins[pluginId]`. Kernel totals = merchandise + shipping − rules + extraLines. |
| `checkout.lines` | filter | Priced quote items after `checkout.quote`. |
| `checkout.totals` | filter | After extraLines; kernel recomputes `quote.total` from extraLines. |
| `checkout.prepare` | filter | Pre-price locks (`phase`: lock / afterPrice) and reserve-time hold release (`phase`: release). |
| `checkout.release` | filter | Purpose-agnostic hold release: unpaid reservation, blocked review, `purpose: 'account.delete'`. |
| `checkout.reserve` | filter | After the reservation row exists: plugin holds. Return `{ ok, reason?, priced }`. |
| `checkout.confirm` | filter | Consume holds, snapshot extras. Return `{ ok, reason? }`. |
| `orders.snapshot` | filter | Plugin bag frozen onto `orders.plugin_snapshot` at confirm. |
| `orders.history.entries` | filter | Extra rows on order history. History reads the snapshot, not live plugin state. |
| `invoice.render` | filter | Theme tokens, extra lines, extra blocks, and invoice copy overlay (`copy` + `language`). Kernel template is English; locale-fr supplies French. |
| `invoice.document` | filter | Return `{ bytes }` to replace the PDF, else kernel template + render. |
| `mail.send` / `mail.templates` / `mail.recipients` | filter | Templates via `registerMailTemplate`; BCC via `mail.recipients`. |
| `seo.meta` / `seo.jsonld.graph` / `seo.sitemap.entries` | filter | Kernel product SEO; plugins append. |

Priority is a number, default `10`. Lower runs first.

## Storefront routes

Page plugins set `route` and optional `nav`. Extra hyphenated routes render
through `PluginContentPage`, which reads `settings.title` and `settings.body`.
Dedicated pages (home, about, guides, legal) keep their React routes.
Guides (`demo-page-guides`) honour enable for the Guides menu. Legal
(`page-legal`) has no nav: documents stay in the footer.

## Admin pages

A plugin can add an admin screen. Register the React route under `/admin/...`,
add a nav item with `pluginId`, and gate it with `usePluginEnabled(id)` plus a
server `isPluginEnabled` check. Disable the plugin and both the sidebar entry
and the HTTP routes go away (`404 plugin_disabled`).

This Documentation plugin is the example (`kind: docs`). Vouchers, cart
rules, Vinted review, gifts, loyalty and product requests add commerce admin pages
the same way.

## Core vs plugin (Te lock)

Stay in core: libraries, roles, orders, stock, contact, users, impersonate,
préférences, boutique+axes, plugin management, vocabulaire, collection, my
profile, session, sign-in methods (shell), addresses, payment-method shell,
order history, notifications.

Must be plugins: Demande produit, Fidélité/cagnotte, Cadeau, Vinted review, journal
family, vouchers, cart rules, shipping, payment gateways, pages, theme, docs,
expedition-cron.

Do not move collection, contact, users, orders, stock, roles, vocabulaire, or
shop/axes into plugins.

Openings (core APIs, prefer these over a blank Configure page):

- Préférences: `core.preferences.entries` when a full Configure page is not pertinent
- My profile: `core.profile.entries`
- Sign-in methods: `core.signIn.methods`
- Notifications: `core.notifications.entries` (participate or add rows)
- Cart: `cart.shipping.methods`, `cart.lines`
- Checkout: `checkout.quote`, `checkout.lines`, `checkout.totals`, `checkout.prepare`, `checkout.release`, `checkout.reserve`, `checkout.confirm`
- Orders: `orders.snapshot`, `orders.history.entries`
- Invoice: `invoice.render`, `invoice.document`
- Mail: `mail.send`, `mail.templates`, `mail.recipients`
- SEO: `seo.meta`, `seo.jsonld.graph`, `seo.sitemap.entries`, `seo.robots.rules`, `seo.redirects.rules`
- Front slots: `slot.cart.summary`, `slot.cart.line`, `slot.checkout.payment`, `slot.product.actions`, `slot.account.profile`, `slot.account.profile.details`, `slot.account.profile.credentials`, `slot.account.profile.end`, `slot.account.notifications`, `slot.order.detail`, `slot.order.history.row`, `slot.home.faq`, `slot.home.onboarding`, `slot.home.featured`, `slot.admin.dashboard`, `slot.admin.dashboard.attention`, `slot.footer.identity`
- Front views: `view.cart`, `view.product`, `view.invoice.preview` (plugin may replace the whole view)
- Cache: `api.cache` (`pluginCache.namespace(pluginId)`), TTL, `sensitivity: public|private`, flushed on uninstall
- Services: `registerPluginService` / `getPluginService` (never private imports)
- Roles: `manifest.permissions[]`, `requirePermission`, `requirePluginEnabled`

Each preinstalled plugin ships `docs/handbook.json` (and docs-developer also ships `docs/articles.json` for the core handbook and worked examples). `GET /admin/docs` loads them. Disable a plugin and its docs group is marked disabled.

## Versioning

Admin, Plugins “Core” and Check current are the live **root** `package.json` version. Latest is the newest official GitHub tag (`MAJOR.MINOR.PATCH`, no `v`). Local greater than latest: this checkout is ahead of the published tag, no Apply. Equal: nothing to update. Local less than latest: walk every tag. `shop-release.json` is last-applied Apply state (hashes, jump cursor), not the displayed current. Each plugin shows npm `version` and `tuucho.engines.core` from its leaf `package.json`. Kernel/all Apply copies root `package.json`. Never `plugins/user/`.

- Scan disables plugins whose `engines.core` or `dependsOn` range fails, and lists them in `incompatible`.
- `PATCH /admin/plugins/:id` `{ "enabled": true }` returns `409 plugin_incompatible` when the kernel is outside `engines.core`, a `dependsOn` plugin is missing, or its version is out of range.

Bump the product by changing root `package.json` `version`. Official-repo CI (`npm run check:release`) keeps `release.json` and `plugins/tuucho/manifest.json` `kernel` in lockstep with that root version, and rejects a `version` field on `kernel/back/package.json`, `kernel/front/package.json`, or `plugin-sdk/package.json`. Plugin `engines.core` for this 0.x line is `>=0.0.1 <1.0.0`. A 1.0 kernel needs plugins to raise that range. Git tags are `MAJOR.MINOR.PATCH` with no `v` prefix.

Worked examples in Admin, Documentation: profile menu, courier on cart, fidélité on cart and order history, permissions.

## Create a plugin with AI

The kernel is built so an AI can add plugins. Creating a plugin by hand is
possible. The default AI path is the Cursor **router** skill
`.cursor/skills/tuucho-create-plugin/SKILL.md`: it picks one specialized
skill (page, admin, slot, opening, schema, locale, payment, shipping, or
permission) and loads that file. Admin, Documentation has the same page.

## Core APIs and database

Never reach around the kernel. Do not query product or order tables from a
plugin HTTP router as a shortcut. Use the owning module `application/`
functions, or the public JSON API. Cross-module imports may reach another
module `application/` only, never its `http/` or `infrastructure/`.

### Plugin registry

`listPlugins()`, `isPluginEnabled(id)`, `setPluginEnabled(id, enabled)`,
`uninstallPlugin(id, confirm)`, `patchPluginSettings(id, settings)` live in
`kernel/back/src/modules/plugins/application/pluginStore.ts`. The `plugins`
table holds `id`, `enabled`, `settings` JSONB, and `schema_version`. Applied
migration filenames live in `plugins_schema_migrations`.

- `GET /admin/plugins` lists installed plugins (`schemaVersion`, `missingFromDisk`)
- `GET /admin/plugins/:id` is one plugin
- `POST /admin/plugins/scan` discovers new folders and runs pending `up` when enabled
- `POST /admin/plugins/upload` accepts a `.zip` or `.tgz` (`archive` file). Unpacks a `tuucho-*` id under `plugins/tuucho/…` and every other id under `plugins/user/…` after zip-slip / absolute-path / kernel-overwrite checks, then scan+enable. Rejects `engines.core` mismatch (`409 plugin_incompatible`).
- `POST /admin/plugins/updates/check` reads the latest **tag** on the official origin (and each user plugin `repository`). Never `master`.
- `POST /admin/plugins/updates/apply` walks every tag between the shop and latest (2 then 3 then 4 then 5), snapshots first, restores on failure. Scope: `all`, `kernel`, `plugins`, or `plugin` (that folder only). Tuucho Apply never writes `plugins/user/`.
- `GET /admin/plugins/updates/status` is the Apply log.
- `PATCH /admin/plugins/:id` accepts `enabled` or `settings`
- `POST /admin/plugins/:id/uninstall` body `{ "confirm": true }` runs `down` then deletes the row
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
Example: a page plugin can read whether `tuucho-theme-default` is enabled before it
assumes tokens exist. Do not import another plugin `infrastructure/`. Prefer
`applyFilters` so several plugins can contribute.

### Courier prices

Packet prices live in `courier_packets.price` as a number or a map of ISO
country codes (`FR`, `BE`). Staff edit texts, times, prices and parcels on
the kernel Couriers page (`/admin/couriers`, permission `courier_edit`) as
one JSON document per courier, country, network, or the parcel file. Enable
flags stay on Preferences. Do not ALTER kernel courier tables from a plugin.

## Sample: theming plugin

`tuucho-theme-default` is required. First-install colours live in CSS `light-dark()`
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

There is no Menus tab. If `tuucho-page-about` is on, About appears in the header,
burger and footer. If it is off, it disappears. Home is required.

`tuucho-page-home` (`/home`) is the landing page. `tuucho-page-about` (`/about`)
is in the shop info menu. `demo-page-guides` (`/sizes`, plus `/pose` and
`/capsules`) is the demo Guides user plugin. `page-legal` (`/legal`,
`/privacy`, `/terms`, `/sales-terms`) is a user plugin and footer-only.
`page-accessibility` (`/accessibility`) is a user plugin and footer-only.
`footer-identity` fills `slot.footer.identity`.

To add a page with dedicated React: copy `plugins/user/demo/guides/demo-page-guides/`
into `plugins/user/<group>/`, change `id`, `route` and `nav.key`, Scan, Enable. Title/body-only
pages can omit `front/` and let `PluginContentPage` read `settingsSchema`.

## Sample: admin page plugin

`tuucho-docs-developer` (`kind: docs`) adds Admin, Documentation: a small website
(nav plus article), not a raw markdown dump. Disable it and the menu item
disappears.

`tuucho-commerce-vouchers` owns promo codes. Admin, Vouchers is the CRUD. Checkout
shows the promo field only while the plugin is on. Disable it: sidebar item
gone, `GET /admin/vouchers` returns `404 plugin_disabled`, `previewVoucher`
and holds refuse the code.

`tuucho-commerce-cart-rules` owns thresholds, gifts and similar alterations.
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

Disabling `tuucho-payment-stripe` turns those checkout methods off.

### ShippingMethod

```ts
interface ShippingMethodContract {
  id: string;
  courierCodes: string[];
}
```

`tuucho-shipping-home` owns `colissimo-home`, `chronopost-home`,
`mondial-relay-home`. `tuucho-shipping-mondial-relay` owns `mondial-relay-point`.
Enabling or disabling the plugin toggles the matching `couriers.enabled`
rows.

### CheckoutAlteration / AdminPage

Vouchers and cart rules provide both: they alter checkout when enabled, and
they register admin screens. Documentation provides `AdminPage` only.

## Admin UI

| Sidebar | Path | Contents |
| --- | --- | --- |
| **Documentation** | `/admin/docs` | In-admin guide (tuucho-docs-developer). Top of the sidebar, above Accueil, no group label. |
| **Plugins** | `/admin/plugins` | List, status, required, Enable, Configure, Scan, Uninstall |
| **Couriers** | `/admin/couriers` | JSON groups for texts, times, prices, parcels (`courier_edit`) |
| **Shop** | `/admin/shop` | Store identity, tax mode, product axes (Visible / Hide when only one value) |
| **Vouchers** | `/admin/vouchers` | Promo CRUD (tuucho-commerce-vouchers) |
| **Cart rules** | `/admin/cart-rules` | Rule CRUD (tuucho-commerce-cart-rules) |
| **Vinted review** | `/admin/reviews` | Vinted reviews (tuucho-commerce-vinted-review) |
| **Loyalty** | `/admin/loyalty` | Fidélité (tuucho-commerce-loyalty) |
| **Gift** | `/admin/gift` | Cadeau (tuucho-commerce-gift) |
| **Product requests** | `/admin/product-requests` | Demande produit (tuucho-commerce-product-requests) |

Auth: signed-in staff with the matching permission (`preferences` for
Plugins, Shop, Documentation; `vouchers` / `cart_rules` for those screens).

HTTP (also in `back/docs/api/01-admin.md`):

- `GET /admin/plugins` list
- `GET /admin/plugins/:id` one plugin
- `POST /admin/plugins/scan` discover nested plugin `package.json` (`tuucho` block) under `plugins/tuucho/` and `plugins/user/` (runs `up` for enabled plugins)
- `PATCH /admin/plugins/:id` body: `{ "enabled": true }` or `{ "settings": { ... } }`
- `GET /admin/courier-catalog` and `PUT /admin/courier-catalog/…` JSON groups (permission `courier_edit`)
- `POST /admin/plugins/:id/uninstall` body `{ "confirm": true }`
- `GET` / `PATCH /admin/store` identity, axes, theme
- `GET /storefront/bootstrap` public payload the shop chrome reads

Home (`tuucho-page-home`) and the default theme cannot be disabled.

## Front contracts

`GET /storefront/bootstrap` includes `plugins[]` (id, enabled, kind, route,
nav, settings) and `menus[]`. Header and footer hide a page when its plugin
is disabled. Theme tokens from bootstrap (and from the live customizer)
paint the chrome.
