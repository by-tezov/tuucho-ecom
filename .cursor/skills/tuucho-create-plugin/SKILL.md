# Create a tuucho-ecom plugin

Use this skill whenever you add, extract, or extend a plugin in
`/home/tezov/Local/tuucho-ecom`. Work only in that tree. Do not touch Pam.

The kernel is built so an AI can add plugins. Follow this file instead of
inventing a parallel architecture.

## Core vs plugin (Te lock)

**Stay in core** (always on, never extract):

- Plugin runtime (scan, enable/disable, `dependsOn`, permission registration)
- Shop / Boutique settings including product axes
- Vocabulaire
- Préférences (kernel page; plugins may add an **entry**)
- Roles (kernel UI; plugins register permission codes)
- Users, impersonate (Usurper un compte)
- Orders, order history
- Stock, libraries
- Collection page (catalog)
- Contact (storefront + admin)
- My profile (kernel page; plugins may add **entries**)
- Auth: session, cache, connection. Sign-in methods are core with an **opening**
- Customer addresses
- Payment-method shell (wallet / stored methods). Gateways stay plugins
- Notifications (kernel page; plugins may add **entries**)

**Must be plugins** (enable/disable hides UI and behaviour):

- Theme (`theme-default`), page plugins, `docs-developer`
- Payment gateways (`payment-stripe`) registering into the payment-method shell
- Shipping methods + complementary `shipping-expedition-cron`
- Vouchers, cart rules, gifts (`commerce-gift`), loyalty (`commerce-loyalty`)
- Reviews (`commerce-reviews`)
- Product requests (`commerce-product-requests`)
- Journal family: `journal-api`, `journal-admin`, `journal-email`, `journal-cron`
- Anything whose absence must hide UI and behaviour

Do not move collection, contact, users, orders, stock, roles, vocabulaire, or
shop/axes into plugins.

Openings (core APIs): `core.preferences.entries`, `core.profile.entries`,
`core.signIn.methods`, `core.notifications.entries`. Use a preference entry
instead of a Configure page when that page is not pertinent.

## Folder and manifest

Drop `back/plugins/<id>/plugin.json`. Folder name = `id` = `[a-z0-9-]+`.

```json
{
  "id": "your-id",
  "name": "Human name",
  "version": "1.0.0",
  "kind": "theme | page | payment | shipping | commerce | docs | generic",
  "description": "Operator-facing summary.",
  "required": false,
  "defaultEnabled": true,
  "provides": ["AdminPage"],
  "dependsOn": [{ "id": "optional-parent", "version": ">=1.0.0" }],
  "engines": { "core": ">=1.0.0 <2.0.0" },
  "permissions": [{ "code": "your_code", "label": "Your section" }],
  "route": "/optional-storefront-path",
  "nav": { "key": "optional", "order": 45, "bottomBar": false },
  "courierCodes": [],
  "defaultSettings": {},
  "settingsSchema": {}
}
```

Kinds: `theme` (one active), `page`, `payment`, `shipping`, `commerce`, `docs`,
`generic`. `required: true` cannot be disabled (`page-home`, `theme-default`).

Scan from Admin, Plugins (or refresh the list). Enable. Scan/enable **reject**
a plugin when `engines.core` does not match the kernel (`CORE_VERSION`, shown
on Admin, Plugins) or a `dependsOn` plugin is missing / out of range
(`409 plugin_incompatible`). Configure only if the plugin has a real form or a
deep-linked admin page. Empty Configure is hidden.

Ship `docs/handbook.json` (identity, Configure, openings, cart/order/profile)
so Admin, Documentation can load your page. Optional `docs/articles.json`
adds extra handbook pages.

## Permissions

Put staff permissions on the manifest (`permissions[]`). They appear in Admin,
Roles only while the plugin (and every `dependsOn` parent) is on. Core does
not hardcode plugin codes in `CORE_PERMISSIONS`. Gate HTTP with
`requirePermission('your_code')` and `requirePluginEnabled('your-id')`.

The code must already exist in the `permissions` vocabulary (migration) and
in `PERMISSIONS` in `staffPermissions.ts` so TypeScript knows it. Then the
manifest is what makes it **grantable**.

## Complement plugins (`dependsOn`)

Do not jam cron, email, and admin UI into one monolith.

- API / capability plugin owns storage or the public contract (`journal-api`,
  `shipping-home`).
- Complements declare `dependsOn: ["that-id"]` (`journal-admin`,
  `journal-email`, `journal-cron`, `shipping-expedition-cron`).
- `isPluginEffectivelyEnabled(id)` is false if the plugin or any ancestor is
  off. Complements disappear; the parent can stay on without them.

Runtime does not auto-enable dependencies. Document them in `description`.

## Core openings (prefer these over a blank Configure page)

Register a filter (default priority 10; lower runs first):

```ts
import { addFilter } from '../application/hooks.js';

addFilter('core.preferences.entries', (entries) => [
  ...entries,
  { id: 'my-pref', pluginId: 'your-id', title: 'My toggle', description: '…' },
]);
```

| Filter | Surface | When to use |
| --- | --- | --- |
| `core.preferences.entries` | Admin, Préférences | A toggle or note belongs on Preferences, not a dedicated Configure page |
| `core.profile.entries` | Account, My profile | Extra profile cards |
| `core.signIn.methods` | Sign-in methods (prefs + account) | Extra OAuth / auth method |
| `core.notifications.entries` | Account notifications + prefs notifications | Extra notification rows |

Example: `commerce-product-requests` keeps the size-request toggle on
Préférences (Boutique tab) instead of inventing a Configure form.

Also: `plugin.enabled.changed` action, `storefront.bootstrap` filter,
`cart.shipping.methods`, `cart.loyalty.lines`, `cart.vouchers`, `cart.gifts`,
`orders.history.entries`.

Worked examples in Admin, Documentation: profile menu (`core.profile.entries`),
courier on cart (`courierCodes` + rates), fidélité on cart
(`priceLoyaltyIfEnabled`) and order history (`loyalty_credit` snapshot),
permissions (`manifest.permissions` + `requirePermission` + Rôles).

## Versioning

Kernel: `CORE_VERSION` in `coreVersion.ts`, same as `back/package.json`.
Plugin: `version` plus `engines.core` (e.g. `>=1.0.0 <2.0.0`). `dependsOn`
may pin `{ id, version }`. Incompatible plugins cannot enable. Bump kernel
patch/minor without changing the 1.x range. A 2.0 kernel needs plugins to
raise `engines.core`.

## Services (plugin to plugin)

```ts
registerPluginService('journal-api', { append, query });
const journal = await getPluginService('journal-api');
if (!journal) return;
```

Never import another plugin `http/` or `infrastructure/`. Call
`isPluginEffectivelyEnabled(id)` or `getPluginService(id)`.

## Admin page

1. Manifest `provides: ["AdminPage"]` and `permissions` if staff-gated.
2. React route under `/admin/...`.
3. `pluginId` on the `adminNav` item.
4. `usePluginEnabled(id)` on the page (NotFound when off).
5. `requirePluginEnabled(id)` on the router (`404 plugin_disabled`).
6. Optional Configure deep link in `front/src/routes/pluginConfigure.ts`.

## Storefront page / menu

Page plugins set `route` + `nav`. Enable equals menu. There is no Menus tab.
Copy `back/plugins/page-studio-note/` for a page with only title/body settings.

## Checkout / shipping / payment

- Vouchers and cart rules: `CheckoutAlteration`. Skip pricing when the plugin
  is off.
- Shipping: `courierCodes` + packet prices on Configure.
- Payment gateway: register methods into the core payment-method shell.
- Cron jobs: their own complement plugin, not hidden in core.

## Reading core and other plugins

Never reach around the kernel. Use owning-module `application/` functions or
the public JSON API. Cross-module imports may reach another module's
`application/` only, never `http/` or `infrastructure/`.

- Registry: `listPlugins`, `isPluginEnabled`, `isPluginEffectivelyEnabled`,
  `patchPluginSettings` in `pluginStore.ts`.
- Store identity / axes: `storeSettings.ts`, Admin Shop (`/admin/shop`).
- Database: orders, products, customers through those modules. PII is
  encrypted. Do not `SELECT` plaintext encrypted columns.

In-admin copy of this guide: Admin, Documentation (`docs-developer`). Repo
copy: `docs/plugins.md`.
