# Plugin API

tuucho-ecom is a kernel plus plugins. Core owns catalog, cart, checkout,
orders, accounts, the admin shell, and **openings** so plugins can extend
Preferences, My profile, sign-in methods and notifications. Pages, theme,
payments, shipping, vouchers, cart rules, gifts, loyalty, product requests,
Vinted review, journals, expedition cron, and this developer guide are plugins.

There is no marketplace. Add a plugin by dropping a folder on disk, then
Check for updates on Admin, Plugins. That check also scans for new folders.
The same guide is also inside admin:
**Admin, Documentation** (`tuucho-docs-developer`). That item sits at the top of the
admin sidebar, above Accueil, with no group label. It is a small website
(nav plus articles). Disable the plugin and the menu disappears.

## Vocabulary

| Say this            | Meaning                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kernel**          | Always-on host: plugin host, cart, checkout orchestration, orders, stock, users, payment-method shell, courier shell, product SEO fields                                                                       |
| **Bundled plugin**  | First-party package under `tuucho/plugins/<group>/<feature>/<id>/` (can be disabled). Id starts with `tuucho-`.                                                                                                 |
| **User plugin**     | Same contract under `src/plugins/<group>/…/<id>/` (drop-in, no kernel edit; gitignored shop tree). Id must not start with `tuucho-`. When a user plugin has locale complements, parent and `*-locale-*` live in one feature folder. |
| **Opening**         | Named filter or action the kernel applies (`addFilter` / `addAction`)                                                                                                                                          |
| **Shell**           | Kernel list that **gateways** or **shipping methods** register into                                                                                                                                            |
| **Payment gateway** | e.g. `tuucho-payment-stripe`, registers methods into the payment-method shell                                                                                                                                  |
| **Shipping method** | e.g. `tuucho-shipping-home`, registers courier codes into the courier shell                                                                                                                                    |
| **Complement**      | Plugin with `dependsOn` (expedition cron complements shipping; `<id>-locale-en` / `<id>-locale-fr` complements a parent)                                                                                                          |
| **Locale plugin**   | `kind: locale`. Kernel and plugins own keys only. `tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr` supply values. Each bundled plugin ships `<id>-locale-en` and `<id>-locale-fr`.                                      |
| **Secret store**    | `settingsSchema` field `type: "secret"` → `plugins.secrets`. Never kernel JSON, never bootstrap, never `VITE_*`.                                                                                               |

Public plugin knobs go on that plugin’s `settingsSchema` / `plugins.settings`.
Do not add `MONDIAL_*`, `STRIPE_*`, or `VITE_SHOP_*` to kernel JSON.

## Robots: API origin vs storefront origin

The JSON API and the shop are different hosts.

| Origin                           | Who owns `/robots.txt`                     | What it says                                                  |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| **API** (`api.` / local `:3010`) | Kernel `crawlerPolicy`                     | Allow fetch, plus `X-Robots-Tag: noindex` on JSON             |
| **Storefront** (shop / Vite)     | Kernel SEO engine, plus `seo.robots.rules` | Default `Allow: /` and `Sitemap:`; plugins add Disallow rules |

Inspect the assembled shop document at **Settings → SEO** or `GET /storefront/robots.txt` on the API. Do not mount shop robots at the API `/robots.txt`.

## Where plugins live

```
tuucho/plugins/<group>/<feature>/<id>/package.json     # bundled; tuucho.id starts with tuucho-
tuucho/plugins/<group>/<feature>/<id>/back/register.ts
tuucho/plugins/<group>/<feature>/<id>-locale-en/       # English complement next to parent
tuucho/plugins/<group>/<feature>/<id>-locale-fr/       # French complement next to parent
tuucho/plugins/kernel-locale/tuucho-kernel-locale-en/  # standalone English pack (no parent)
tuucho/plugins/kernel-locale/tuucho-kernel-locale-fr/  # standalone French pack (no parent)
src/plugins/<group>/<feature>/<id>/                    # user / upload / shop examples; id must not use tuucho-
tuucho/factory-backup/plugins/                         # shipped shop examples (first-install → src/plugins/)
tuucho/factory-backup/config/                          # shipped JSON → tuucho-config/ on first install
tuucho/plugin-sdk/                                     # @tuucho/plugin-sdk (not a plugin)
```

The leaf `package.json` is the only plugin file. npm `version` /
`description` / optional `repository` sit at the top. Plugin fields live
under `"tuucho": { id, kind, installPath, engines.core, … }`. That
`tuucho` object is the discriminator: scan never treats `node_modules`
(skipped by name) or a plain npm package as a plugin. There is no
`plugin.json` and no stub generator.

Kernel and plugin config files sit side by side in one directory. Public files are `config.json` and `config.<env>.json`. Private files (gitignored) are `config.private.json` and `config.private.<env>.json`. Examples are `config.private.example.json` and `config.private.<env>.example.json`, and only when that layer has keys. A plugin with no secret settings has no private file and no private example. Staff roles are `config.role.json` and `config.role.<env>.json` in the shop config root. Built-in roles `user` and `super-admin` are not listed. Names are not listed: they live in the language files, and English is the default. `config.role.json` is not an environment named `role`.

The plugin host `import()`s `back/register.ts` for every effectively enabled
plugin. Disk manifests are the catalogue. There is no second shipped list.
Scan walks nested folders. The **leaf** folder name is the plugin id. It must
match `"id"` in the manifest and use only `a-z`, `0-9` and `-`. Grouping
folders (`commerce/gift`, `demo/guides`) are not
plugins. A plugin and its `*-locale-*` complements share one feature folder
(short slug: `gift`, `faq`, `guides`). The kernel locale pack
`tuucho-kernel-locale-en` and `tuucho-kernel-locale-fr` stay in `kernel-locale/` — do not invent a fake parent for them.

Shop examples under `src/plugins/` (not bundled; first-install copy from
`tuucho/factory-backup/plugins/`): `page-home`, `page-about`,
`home-faq`, `home-featured`, `onboarding` (+ their locale packs).

| Folder                             | Kind     | What it does                                                              |
| ---------------------------------- | -------- | ------------------------------------------------------------------------- |
| `tuucho-theme-default`             | Theme    | CSS tokens. Required. Configure: colour customizer.                       |
| `tuucho-contact`                   | Generic  | `/contact`. Info menu while enabled. Not a page-plugin nav.key.           |
| `tuucho-kernel-locale-en`                 | Locale   | Kernel English (admin + storefront chrome + email + invoice).             |
| `tuucho-kernel-locale-fr`                 | Locale   | Kernel French (admin + storefront chrome + email + invoice).              |
| `tuucho-payment-stripe`            | Payment  | Stripe methods. Checkout switches live in App Preferences, not Configure. |
| `tuucho-shipping-home`             | Shipping | Home address couriers. Prices: kernel Couriers JSON page.                 |
| `tuucho-shipping-mondial-relay`    | Shipping | Point Relais. Prices: kernel Couriers JSON page.                          |
| `tuucho-commerce-vouchers`         | Commerce | Promo codes. Admin, Vouchers in the sidebar.                              |
| `tuucho-commerce-cart-rules`       | Commerce | Thresholds and gifts. Admin, Cart rules in the sidebar.                   |
| `tuucho-commerce-vinted-review`    | Commerce | Vinted reviews. Admin, Vinted review in the sidebar.                      |
| `tuucho-commerce-product-requests` | Commerce | Demande produit. Size-request toggle on Preferences.                      |
| `tuucho-commerce-loyalty`          | Commerce | Fidélité / cagnotte. Admin, Loyalty in the sidebar.                       |
| `tuucho-commerce-gift`             | Commerce | Cadeau. Admin, Gift in the sidebar.                                       |
| `tuucho-journal-api`               | Generic  | Journal storage API. Complements depend on it.                            |
| `tuucho-journal-admin`             | Generic  | API journal UI. `dependsOn: tuucho-journal-api`.                          |
| `tuucho-journal-email`             | Generic  | Email journal UI. `dependsOn: tuucho-journal-api`.                        |
| `tuucho-journal-cron`              | Generic  | Cron journals UI. `dependsOn: tuucho-journal-api`.                        |
| `tuucho-shipping-expedition-cron`  | Generic  | Shipment tracking cron. Complements both shipping plugins.                |
| `tuucho-docs-developer`            | Docs     | In-admin developer guide. Admin, Documentation in the sidebar.            |
| `tuucho-seo-sitemap`               | SEO      | Extra page-plugin URLs on the kernel sitemap. Hub: Settings → SEO.        |
| `tuucho-seo-robots`                | SEO      | Extra Disallow rules on kernel shop robots. Hub: Settings → SEO.          |
| `tuucho-seo-redirects`             | SEO      | Applies the kernel `seo_redirects` table. Hub: Settings → SEO.            |

User (not bundled) storefront pages:

| Folder               | Kind    | What it does                                                     |
| -------------------- | ------- | ---------------------------------------------------------------- |
| `page-legal`         | Page    | Legal notice, privacy, terms of use, terms of sale. Footer only. |
| `page-accessibility` | Page    | RGAA accessibility statement. Footer only.                       |
| `footer-identity`    | Generic | Shop name / tagline / copyright in `slot.footer.identity`.       |
| `page-guides`   | Page    | Demo size, shape and care guides. Info menu while enabled.       |

Runtime TypeScript lives in the plugin package (`back/register.ts` plus
`back/src/`). The kernel does not statically import loyalty, vouchers, gifts
or cart-rules. A page plugin can still ship with only a manifest and settings.

## How to add a plugin

1. Copy `src/plugins/demo/guides/page-guides/` to
   `src/plugins/<group>/your-id/` (in this product repo, also mirror under
   `tuucho/factory-backup/plugins/` then `npm run factory-sync`).
2. Edit leaf `package.json`: npm `version` and `description` (locale packs may omit description),
   optional HTTPS GitHub `repository` (user plugins only). Under `"tuucho"`, set `"id"` to `your-id`
   (same as the leaf folder, not `tuucho-*`), `"kind"`, `name`, `engines.core` `>=0.0.1 <1.0.0`,
   `installPath` under `src/plugins/…`, plus `route` / `nav` for a page or `courierCodes` for shipping. Omit `nav` for
   footer-only documents (`page-legal`, `page-accessibility`). Depend on `@tuucho/plugin-sdk`.
3. Add `back/register.ts` that calls `addFilter` / `addAction` /
   `registerPluginService` / `registerPaymentGateway` / `registerShippingMethod`.
4. Open the shop admin: **Plugins** in the sidebar.
5. Click **Check for updates**. That scans for the new folder. Enable it, then **Configure**.

Toggling a plugin reloads the host (Admin uses a transient toast for
enable/disable, not a click-to-dismiss dialog). No kernel source edit is
required for a profile opening or a `checkout.quote` filter. The shipped
page-plugin demo is `src/plugins/demo/guides/page-guides`.

There is no Menus tab. If a page plugin is on, its header / burger / footer
entry shows. If it is off, the entry disappears.

Admin Home is kernel chrome (urgent orders, library stats). Plugins add **numbers**
on `slot.admin.dashboard` (`ui.AdminStatCard`, loyalty) and **attention** tiles on
`slot.admin.dashboard.attention` (`ui.AdminAttentionCard`, product-requests).
Disabled plugins drop out. New home regions are extra `CORE_FRONT_SLOTS` ids.

## Languages

Kernel and feature plugins own **keys** only (`t.nav.home`, email catalog
keys). Sentence values live in locale packs. The locale shell (switcher,
`t()`, catalog load) stays in the kernel. Builtins are English and French;
a shop adds more codes with `api.registerLanguage({ code, nativeName, ogLocale, dateLocale? })` from a locale plugin `register()`.

The `i18n` section of `tuucho-config/kernel/config.json` (`default`, `enabled`) is
served on the bootstrap payload as
`i18n: { default, enabled, languages }` (`enabled` is intersected with the
registered language registry; `languages` carries native name / OG / date
metadata for those codes). Vite copies `i18n.enabled` into
`VITE_ENABLED_LANGUAGES` at build so the front list can include codes that
are not hard-coded in the kernel. On the front, `applyStorefrontBootstrap`
narrows that build list to the bootstrap intersection (a shop turns a
language off without a rebuild) and a valid `default` becomes the runtime
default language (`runtimeDefaultLang()` in
`kernel/front/src/config/runtimeI18n.ts`). Before bootstrap lands, the
build-time default `'en'` holds. Config load accepts `^[a-z]{2,3}$` codes;
boot fails if an enabled code was never registered.

- Enable `tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr` to offer that language in the
  switcher and supply kernel chrome, admin, email, and invoice values.
- Disable a kernel locale pack and that language leaves the switcher.
- Every bundled feature plugin ships `<id>-locale-en` and `<id>-locale-fr`
  with `dependsOn` on the parent (`kind: locale`). Disable a complement and
  that plugin's keys stay untranslated for that language even when the
  matching kernel locale pack is on.
- Extra codes (for example `th`): ship `tuucho-kernel-locale-th` (or a shop
  pack) that calls `registerLanguage` and contributes `front/catalog.ts`
  plus `registerEmailCatalog('th', …)`. Name packs `*-locale-<code>` with a
  2–3 letter code.
- Register email values with `api.registerEmailCatalog('en'|'fr'|code, catalog)`
  or `api.registerEmailCatalog('key:lang', catalog)`.
  `emailStrings(language)` and `localizedCatalog(language, key)` read those
  packs only.

## Manifest

Leaf `package.json` only. npm fields plus a `tuucho` block:

```json
{
  "name": "@tuucho/plugin-page-guides",
  "private": true,
  "type": "module",
  "version": "1.0.0",
  "description": "A short operator-facing summary.",
  "repository": "https://github.com/acme/page-guides",
  "tuucho": {
    "id": "page-guides",
    "name": "Guides",
    "kind": "theme | page | payment | shipping | commerce | docs | generic | seo | locale",
    "required": false,
    "defaultEnabled": true,
    "provides": ["StorefrontPage"],
    "dependsOn": [{ "id": "optional-parent", "version": ">=1.0.0" }],
    "engines": { "core": ">=0.0.1 <1.0.0" },
    "installPath": "src/plugins/demo/guides/page-guides",
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

| Field             | Notes                                                                                                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | Must equal the leaf folder name. Bundled: `tuucho-*`. User: anything else matching `[a-z0-9-]+`.                                                                                                                                                                              |
| `description`     | Short operator-facing summary of what the plugin does. Required. Scan skips and archive import rejects a non-locale plugin with a missing or empty description. Locale plugins (`*-locale-[a-z]{2}` complements and standalone packs such as `tuucho-kernel-locale-fr`) may omit it. |
| `installPath`     | Repo-relative posix path of the package folder (leaf equals `id`). Tuucho ids: `tuucho/plugins/…`. User ids: `src/plugins/…`. Required on archive import.                                                                                                                      |
| `repository`      | Optional HTTPS GitHub repo root (`https://github.com/owner/repo`) on **user** plugins only. Check for updates uses that origin for this id. Ignored on `tuucho-*`. Missing means zip-only.                                                                                    |
| `kind`            | `theme`, `page`, `payment`, `shipping`, `commerce`, `docs`, `generic`, `seo`, or `locale`. One active theme.                                                                                                                                                                  |
| `required`        | Admin cannot disable it (`tuucho-theme-default`). Storefront example pages (`page-home`, `page-about`) live under `src/plugins/` and are not bundled.                                                                                                                          |
| `defaultEnabled`  | Seeded into `plugins.enabled` on first insert.                                                                                                                                                                                                                                |
| `provides`        | Contract names this plugin implements.                                                                                                                                                                                                                                        |
| `dependsOn`       | Other plugin ids, or `{ id, version }` ranges. Complements disappear when a parent is off (`isPluginEffectivelyEnabled`). Scan/enable reject missing or out-of-range parents. Not auto-enabled.                                                                               |
| `engines.core`    | Semver range of the kernel. Shipped plugins use `>=0.0.1 <1.0.0`. Incompatible plugins cannot enable.                                                                                                                                                                         |
| `permissions`     | Staff codes added to Admin, Roles while this plugin (and parents) is on.                                                                                                                                                                                                      |
| `route` / `nav`   | Page plugins: public path and menu placement.                                                                                                                                                                                                                                 |
| `courierCodes`    | Shipping plugins: courier rows this plugin owns.                                                                                                                                                                                                                              |
| `defaultSettings` | Seeded into `plugins.settings` on first insert.                                                                                                                                                                                                                               |
| `settingsSchema`  | `{ type, label }` per field. Types: `string`, `text`, `number`, `boolean`, `secret`. Admin auto-builds the Configure form. `secret` is write-only and never sent on storefront bootstrap.                                                                                     |

## Lifecycle

Check for updates (Admin, Plugins) scans first: it reads every plugin `package.json` (`tuucho` block) and
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

Worked example: `tuucho/plugins/messaging/mail-spy/tuucho-mail-spy/back/migrations/001_spy_mail.js`
creates `plugin_tuucho_mail_spy_channels` (and recipients) and drops them on uninstall.
Spy copies are not read from those tables. Who receives which channel is the
`rules` list in that plugin's `config.json` (Plugins, Configure). An empty
list sends nothing, and no role is filled in.
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

| Name                                                    | Type   | When                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin.enabled.changed`                                | action | After `PATCH /admin/plugins/:id` with `enabled`. Args: `id`, `enabled`.                                                                                                                                                                                                                                                                                                      |
| `storefront.bootstrap`                                  | filter | `GET /storefront/bootstrap`. Return the (possibly extended) payload. Filters run before menu pruning: they see every menu, including menus of disabled plugins, so a filter can remap such a menu onto its own enabled plugin id. After filters return, menus whose `pluginId` is disabled drop out (`core-catalog` always stays).                                           |
| `core.preferences.entries`                              | filter | Plugin rows on Admin, Préférences (use this instead of a blank Configure page).                                                                                                                                                                                                                                                                                              |
| `core.profile.entries`                                  | filter | Extra cards on My profile.                                                                                                                                                                                                                                                                                                                                                   |
| `core.signIn.methods`                                   | filter | Extra sign-in methods.                                                                                                                                                                                                                                                                                                                                                       |
| `core.notifications.entries`                            | filter | Extra notification rows.                                                                                                                                                                                                                                                                                                                                                     |
| `cart.shipping.methods`                                 | filter | Shipping methods on the cart (courierCodes + prices).                                                                                                                                                                                                                                                                                                                        |
| `cart.lines`                                            | filter | Agnostic cart extras. Kernel has no voucher/loyalty fields here.                                                                                                                                                                                                                                                                                                             |
| `checkout.quote`                                        | filter | Extra lines and `quote.plugins[pluginId]`. Kernel totals = merchandise + shipping − rules + extraLines.                                                                                                                                                                                                                                                                      |
| `checkout.lines`                                        | filter | Priced quote items after `checkout.quote`.                                                                                                                                                                                                                                                                                                                                   |
| `checkout.totals`                                       | filter | After extraLines; kernel recomputes `quote.total` from extraLines.                                                                                                                                                                                                                                                                                                           |
| `checkout.prepare`                                      | filter | Pre-price locks (`phase`: lock / afterPrice) and reserve-time hold release (`phase`: release). The priced-cart context may carry `excludeReservationId`, the cart's own covering gift/checkout hold, for stock-aware syncs.                                                                                                                                                  |
| `checkout.release`                                      | filter | Purpose-agnostic hold release: unpaid reservation, blocked review, `purpose: 'account.delete'`.                                                                                                                                                                                                                                                                              |
| `checkout.reserve`                                      | filter | After the reservation row exists: plugin holds. Return `{ ok, reason?, priced }`.                                                                                                                                                                                                                                                                                            |
| `checkout.confirm`                                      | filter | Consume holds, snapshot extras. Return `{ ok, reason? }`.                                                                                                                                                                                                                                                                                                                    |
| `orders.snapshot`                                       | filter | Plugin bag frozen onto `orders.plugin_snapshot` at confirm.                                                                                                                                                                                                                                                                                                                  |
| `orders.history.entries`                                | filter | Extra rows on order history. History reads the snapshot, not live plugin state.                                                                                                                                                                                                                                                                                              |
| `gift.receiverBudget`                                   | filter | Inside the gift receiver summary, before the remaining budget is computed. Receives `[]` plus `{ offer, items }`; returns extra budget lines `{ productType, unitPrice, quantity, label? }[]` counted by the same nail/accessory math as real gift items, without appearing among the receiver's items.                                                                      |
| `gift.receiverLines` / `gift.receiverSummary`           | filter | Presentation-only overlays on the receiver summary and its item lines, after the budget math.                                                                                                                                                                                                                                                                                |
| `loyalty.preview.cartExtras`                            | filter | Loyalty earn quote (account cart and guest items). Receives `{ lines: [], extraSets: [] }` plus `{ userId, source, lines }` (the lines already quoted); return extra merchandise lines `{ productId, quantity, unitPrice, size? }[]` merged into the earn math, and set contributions `{ quantity, nailCount, lineTotal }[]` merged into volume-tier and gift-per-set rules. |
| `invoice.render`                                        | filter | Theme tokens, extra lines, extra blocks, and invoice copy (`copy` + `language`). Locale packs supply values for the order language.                                                                                                                                                                                                                                          |
| `invoice.document`                                      | filter | Return `{ bytes }` to replace the PDF, else kernel template + render.                                                                                                                                                                                                                                                                                                        |
| `mail.send` / `mail.templates` / `mail.recipients`      | filter | Templates via `registerMailTemplate`; BCC via `mail.recipients`.                                                                                                                                                                                                                                                                                                             |
| `seo.meta` / `seo.jsonld.graph` / `seo.sitemap.entries` | filter | Kernel product SEO; plugins append.                                                                                                                                                                                                                                                                                                                                          |

Priority is a number, default `10`. Lower runs first.

## Storefront routes

Page plugins set `route` and optional `nav`. Extra hyphenated routes render
through `PluginContentPage`, which reads `settings.title` and `settings.body`.
Dedicated pages (home, about, guides, legal) keep their React routes.
Guides (`page-guides`) honour enable for the Guides menu. Legal
(`page-legal`) has no nav: documents stay in the footer.

Plugin React routes (`publicRoutes`, `customerRoutes`, `adminRoutes` in
`front/index.tsx`) are deduplicated by path. Bundled plugins load first and
user plugins last, and the last enabled candidate wins: a user plugin can
shadow a bundled page by registering the same path, and disabling the user
plugin falls back to the bundled one. When every candidate for a path is
disabled, the route renders the shop 404 page instead of a blank page.
Plugin front and locale globs use the `@plugins-bundled` / `@plugins-user`
vite aliases (`kernel/front/importAliases.ts`), never relative `../` chains.

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
- Gift: `gift.receiverBudget`, `gift.receiverLines`, `gift.receiverSummary`
- Loyalty: `loyalty.preview.cartExtras`
- Invoice: `invoice.render`, `invoice.document`
- Mail: `mail.send`, `mail.templates`, `mail.recipients`
- SEO: `seo.meta`, `seo.jsonld.graph`, `seo.sitemap.entries`, `seo.robots.rules`, `seo.redirects.rules`
- Front slots: `slot.cart.summary`, `slot.cart.line`, `slot.checkout.payment`, `slot.product.actions`, `slot.account.profile`, `slot.account.profile.details`, `slot.account.profile.credentials`, `slot.account.profile.end`, `slot.account.notifications`, `slot.order.detail`, `slot.order.history.row`, `slot.home.faq`, `slot.home.onboarding`, `slot.home.featured`, `slot.admin.dashboard`, `slot.admin.dashboard.attention`, `slot.footer.identity`, `slot.gallery.card.compose`, `slot.gallery.lightbox.compose` (per-slot props in Front contracts below)
- Front views: `view.cart`, `view.product`, `view.invoice.preview`, `view.boot.splash` (plugin may replace the whole view)
- Cache: `api.cache` (`pluginCache.namespace(pluginId)`), TTL, `sensitivity: public|private`, flushed on uninstall
- Services: `registerPluginService` / `getPluginService` (never private imports). The gift plugin's service includes the receiver surface (`loadReceiverOffer`, `loadReceiverSummary`, `putReceiverItem`, `removeReceiverItem`, `putReceiverDestination`), the PIN/lock/cart helpers (`assertGiftPinSession`, `unlockGiftPin`, `coveringStockReservationIdForActiveCart`, ...), and the budget classification (`isNailGiftItem`, `isAccessoryGiftItem`, `remainingFrom`) so peers never import gift internals directly.
- Roles: `manifest.permissions[]`, `requirePermission`, `requirePluginEnabled`

Each preinstalled plugin ships `docs/handbook.json` (and docs-developer also ships `docs/articles.json` for the core handbook and worked examples). `GET /admin/docs` loads them. Disable a plugin and its docs group is marked disabled.

## Versioning

Admin, Plugins “Core” and Check current are the live **root** `package.json` version. Latest is the newest official GitHub tag (`MAJOR.MINOR.PATCH`, no `v`). Local greater than latest: this checkout is ahead of the published tag, no Apply. Equal: nothing to update. Local less than latest: walk every tag. `tuucho-versioning.lock.json` is last-applied Apply state (gitignored hashes / jump cursor; setup / Apply write it locally), not the displayed current. Each plugin shows npm `version` and `tuucho.engines.core` from its leaf `package.json`. Kernel Apply writes `tuucho/kernel`, `tuucho/plugin-sdk`, `tuucho/factory-backup`, `tuucho/docs`, `tuucho/scripts`, `tuucho/sample`, the versioning catalog, and root `package.json`; `all` adds `tuucho/plugins`. Never `src/plugins/` or `tuucho-config/`. Apply replaces each scoped tree wholesale but never writes or removes a path outside that list, so root-level moves between 0.0.5 and 0.0.6 (root `docs/` removed, `scripts/` trimmed, root `AGENTS.md` / `.agents/` / `.prettierrc` added, docs relocated to `tuucho/docs`) require `git pull`; from 0.0.6 on, `tuucho/docs` is in scope again.

- Scan disables plugins whose `engines.core` or `dependsOn` range fails, and lists them in `incompatible`.
- `PATCH /admin/plugins/:id` `{ "enabled": true }` returns `409 plugin_incompatible` when the kernel is outside `engines.core`, a `dependsOn` plugin is missing, or its version is out of range.

Bump the product by changing root `package.json` `version`. Official-repo CI (`npm run check:release`) keeps `tuucho/tuucho-versioning.json` and `tuucho/plugins/manifest.json` `kernel` in lockstep with that root version, and rejects a `version` field on `kernel/back/package.json`, `kernel/front/package.json`, or `plugin-sdk/package.json`. Plugin `engines.core` for this 0.x line is `>=0.0.1 <1.0.0`. A 1.0 kernel needs plugins to raise that range. Git tags are `MAJOR.MINOR.PATCH` with no `v` prefix.

### What 0.0.7 changes for plugin authors

- `api.registerLanguage({ code, nativeName, ogLocale, dateLocale? })` opens the storefront language registry beyond en/fr. Bootstrap `i18n` gains `languages` metadata; Vite sets `VITE_ENABLED_LANGUAGES` from config `i18n.enabled`.
- `brandAssets` gains optional `favicon`, `ogImage`, and `lockProbe` absolute URLs (kernel public/ paths remain the defaults). Ops lock-probe still hits `{front}/lock-probe.jpg`.
- Cart commands expose `wrapNotifiedAdd` and `notifyCartAdded` for plugins that write extras / custom lines and need the header "adding…" → green notice path.
- `paths.publicMediaDir` (and private subdir keys) strip a cosmetic leading `/` so `/media` resolves under `PUBLIC_DIR`. Local-dev `/media` is mounted before public plugin catch-all middleware.
- `config.private.json` is not listed as an environment by `config:doctor` (same exclusion as `config.role.json`).

### What 0.0.6 changes for plugin authors

- New openings: `view.boot.splash` replaces the boot splash view, per-slot props arrive through `SlotPropsContext` / `useSlotProps`, `gift.receiverBudget` and `loyalty.preview.cartExtras` filters are live, the gift plugin service exports the receiver surface, and the storefront bootstrap payload gains `i18n` plus `brandAssets`.
- Plugin route shadowing is settled: bundled plugins load first, user plugins last, the last enabled candidate for a path wins, and a path whose candidates are all disabled falls through to the shop 404.
- Plugin code can import shop front code through the `@shop/*` alias (repo `src/`), and front / locale globs stay on `@plugins-bundled` / `@plugins-user`.
- Config gains `paths.outputDir` (roots every generated artifact, default `<root>/output`) and `i18n.default` / `i18n.enabled` (validated against supported languages at boot).

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
- `POST /admin/plugins/upload` accepts a `.zip` or `.tgz` (`archive` file). Unpacks a `tuucho-*` id under `tuucho/plugins/…` and every other id under `src/plugins/…` after zip-slip / absolute-path / kernel-overwrite checks, then scan+enable. Rejects `engines.core` mismatch (`409 plugin_incompatible`).
- `POST /admin/plugins/updates/check` reads the latest **tag** on the official origin (and each user plugin `repository`). Never `master`. A private repository uses the fine-grained token saved for that URL on Admin, Core. No saved token means the fetch stays public.
- `POST /admin/plugins/updates/apply` walks every tag between the shop and latest (2 then 3 then 4 then 5), snapshots first, restores on failure. Scope: `all`, `kernel`, `plugins`, or `plugin` (that folder only). Kernel writes `tuucho/kernel`, `tuucho/plugin-sdk`, `tuucho/factory-backup`, `tuucho/docs`, `tuucho/scripts`, `tuucho/sample`, the versioning catalog, and root `package.json`; `all` adds `tuucho/plugins`. Tuucho Apply never writes `src/plugins/` or `tuucho-config/`. Paths outside the scope list are never written or removed, so root-level moves need `git pull` (0.0.5 to 0.0.6).
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

There is no Menus tab. If `page-about` is on, About appears in the header,
burger and footer. If it is off, it disappears.

Storefront page plugins are shop examples under `src/plugins/` (never bundled
as `tuucho-*`). `page-home` (`/home`) is the landing page. `page-about`
(`/about`) is in the shop info menu. `page-guides` (`/sizes`, plus `/pose`
and `/capsules`) is the demo Guides user plugin. `page-legal` (`/legal`,
`/privacy`, `/terms`, `/sales-terms`) is footer-only. `page-accessibility`
(`/accessibility`) is footer-only. `footer-identity` fills
`slot.footer.identity`.

Home FAQ / featured slots live under `src/plugins/home/`;
onboarding under `src/plugins/onboarding/`.

To add a page with dedicated React: copy `src/plugins/demo/guides/page-guides/`
into `src/plugins/<group>/`, change `id`, `route` and `nav.key`, Check for updates, Enable. Title/body-only
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

| Sidebar              | Path                      | Contents                                                                                   |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| **Documentation**    | `/admin/docs`             | In-admin guide (tuucho-docs-developer). Top of the sidebar, above Accueil, no group label. |
| **Plugins**          | `/admin/plugins`          | List, status, required, Enable, Configure, Check for updates, Uninstall                    |
| **Couriers**         | `/admin/couriers`         | JSON groups for texts, times, prices, parcels (`courier_edit`)                             |
| **Shop**             | `/admin/shop`             | Store identity, tax mode, product axes (Visible / Hide when only one value)                |
| **Vouchers**         | `/admin/vouchers`         | Promo CRUD (tuucho-commerce-vouchers)                                                      |
| **Cart rules**       | `/admin/cart-rules`       | Rule CRUD (tuucho-commerce-cart-rules)                                                     |
| **Vinted review**    | `/admin/reviews`          | Vinted reviews (tuucho-commerce-vinted-review)                                             |
| **Loyalty**          | `/admin/loyalty`          | Fidélité (tuucho-commerce-loyalty)                                                         |
| **Gift**             | `/admin/gift`             | Cadeau (tuucho-commerce-gift)                                                              |
| **Product requests** | `/admin/product-requests` | Demande produit (tuucho-commerce-product-requests)                                         |

Auth: signed-in staff with the matching permission (`preferences` for
Plugins, Shop, Documentation; `vouchers` / `cart_rules` for those screens).

HTTP (also in `tuucho/docs/api/01-admin.md`):

- `GET /admin/plugins` list
- `GET /admin/plugins/:id` one plugin
- `POST /admin/plugins/scan` discover nested plugin `package.json` (`tuucho` block) under `tuucho/plugins/` and `src/plugins/` (runs `up` for enabled plugins)
- `PATCH /admin/plugins/:id` body: `{ "enabled": true }` or `{ "settings": { ... } }`
- `GET /admin/courier-catalog` and `PUT /admin/courier-catalog/…` JSON groups (permission `courier_edit`)
- `POST /admin/plugins/:id/uninstall` body `{ "confirm": true }`
- `GET` / `PATCH /admin/store` identity, axes, theme
- `GET /storefront/bootstrap` public payload the shop chrome reads

The default theme (`tuucho-theme-default`) cannot be disabled. Example landing
pages under `src/plugins/` can be disabled or replaced.

## Front contracts

`GET /storefront/bootstrap` includes `plugins[]` (id, enabled, kind, route,
nav, settings) and `menus[]`. Header and footer hide a page when its plugin
is disabled. Theme tokens from bootstrap (and from the live customizer)
paint the chrome.

### Slot props (`useSlotProps`)

A plugin's `slots: { [name]: <Foo/> }` entries are static ReactNodes. When the
hosting kernel surface has context worth handing down it publishes a props
record through `SlotPropsContext`; plugin code reads it with
`useSlotProps<T>()` from `@kernel/front/plugins/slotProps` (also re-exported
from `@kernel/front/plugins/PluginHost`). The plugin-sdk is backend-only, so
front helpers come from `@kernel/front/…`, same as `PluginFrontModule` types.
Modules that never call the hook keep working unchanged (`{}` by default).

| Slot                            | Props                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `slot.gallery.card.compose`     | `{ product: GalleryItem }` — the card's own item (title, price, availability, photos by shape/length) |
| `slot.gallery.lightbox.compose` | `{ product: GalleryItem, media }` — the lightbox item plus its currently displayed photo              |
| every other slot                | no props yet (`{}`)                                                                                   |

`PluginView` accepts the same `props` record for replaceable views.

### Front views

`views: { [name]: <Foo/> }` replaces a whole kernel surface while the plugin
is enabled; disabling the plugin restores the kernel surface. Unlike routes
(last enabled candidate wins), a view has a single owner: the first loaded
module declaring it.

| View                   | Replaces                | Props (via `useSlotProps`)                         |
| ---------------------- | ----------------------- | -------------------------------------------------- |
| `view.cart`            | Shop cart surface       | none                                               |
| `view.product`         | Product view            | none                                               |
| `view.invoice.preview` | Invoice preview         | none                                               |
| `view.boot.splash`     | Cold-boot splash on `/` | `{ ariaLabel, markAria, tagline, instant, speed }` |

`view.boot.splash` props keep the replacement honest on accessibility and
timing: `ariaLabel` / `markAria` / `tagline` are the localized RGAA labels and
copy, `instant` is the prefers-reduced-motion flag (skip choreography), and
`speed` is `VITE_BOOT_SPLASH_SPEED`. The exit timing and navigation stay in
the kernel (`SplashEntry`); the view only paints.

### Brand assets

Static brand artwork (hero, about, guide/pose illustrations, onboarding
photos) is overridable without forking the front. The bootstrap payload
carries `brandAssets: Record<string, string>` — the kernel seeds it empty and
a plugin fills it through the `storefront.bootstrap` filter (key → absolute
image URL). Kernel components resolve `override ?? kernelDefault`, so a bare
install still paints the kernel demo images from
`kernel/front/src/assets/images/manifest.ts` and
`assets/images/onboarding/manifest.ts`.

Front code reads overrides with `useBrandAsset(key)` /
`useBrandAssets()` / `resolveBrandAsset(assets, key, default)` from
`@kernel/front/plugins/BrandAssetsContext`. The key list is `BRAND_ASSET_KEYS`
in the same module: `favicon`, `ogImage`, `lockProbe`, `hero`,
`aboutPortrait`, `aboutDesk`, `aboutColor1..3`, `guideMeasureStep1..3`,
`guideSizeChart`, `poseKit`, `posePrep1..3`, `posePrep4Glue`,
`posePrep4Patch`, `posePrep5`, `poseVideoPoster`, `onboardingHandmade`,
`onboardingCustom`, `onboardingLoyalty`, `onboardingDeals`. Defaults for the
first three are `/favicon.svg`, `/og-image.jpg`, and `/lock-probe.jpg`.
