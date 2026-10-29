---
name: tuucho-plugin-opening
description: >-
  Registers tuucho-ecom addFilter / addAction openings (cart, checkout, mail,
  invoice, cache, HTTP mounts, plugin services). Use when extending
  checkout, profile entries, or kernel-named filters. SEO extras use
  tuucho-plugin-seo. Never edits the kernel.
---

# Openings (`addFilter` / `addAction`)

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## Contract

Names and payloads: Read `plugin-sdk/src/contracts.ts`
(`CORE_OPENING_FILTERS`, `ExtraLine`, `CheckoutQuote`, `InvoiceRenderState`).
Index of every kernel name:
`.cursor/skills/tuucho-create-plugin/references/kernel-index.md`.
Filters/actions on the kernel but **not** on the SDK enum:
[references/extra-openings.md](references/extra-openings.md).

```ts
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';

api.addFilter(CORE_OPENING_FILTERS.preferences, (entries) => [
  ...entries,
  { id: 'my-pref', pluginId: api.pluginId, title: 'My toggle', description: '…' },
]);
```

Default priority 10; lower runs first.

## SDK openings (moved from the router)

| Filter | Surface |
| --- | --- |
| `core.preferences.entries` | Admin, Préférences — prefer this over a blank Configure page |
| `core.profile.entries` | Bootstrap profile links (not My profile layout — cards use `slot.account.profile.*`) |
| `core.signIn.methods` | Sign-in methods |
| `core.notifications.entries` | Notifications rows |
| `cart.shipping.methods` / `cart.lines` | Cart |
| `checkout.quote` / `lines` / `totals` / `prepare` / `release` / `reserve` / `confirm` | Checkout |
| `orders.snapshot` / `orders.history.entries` | Orders |
| `invoice.render` / `invoice.document` | Invoice |
| `mail.send` / `mail.templates` / `mail.recipients` | Mail |
| `storefront.bootstrap` | Public bootstrap |

SEO (`seo.meta`, `seo.jsonld.graph`, `seo.sitemap.entries`, `seo.robots.rules`,
`seo.redirects.rules`) → **tuucho-plugin-seo**.

Checkout: kernel quote/lines/totals have **no** voucher or loyalty field
names. Push `extraLines` (`{ id, pluginId, label, amount }`) and
`snapshot.plugins[pluginId]`. Skip pricing when the plugin is off. Examples:
`tuucho-commerce-vouchers`, `tuucho-commerce-loyalty`.

Also: `api.addAction('plugin.enabled.changed', …)`, `api.cache` (TTL,
`sensitivity: public|private`; flushed on uninstall),
`registerPluginService` / `getPluginService` (never import another plugin
`http/` or `infrastructure/`), `registerHttpMount`, `registerMailTemplate`.

Worked examples in Admin, Documentation: profile menu, courier on cart,
fidélité extraLines + snapshot, permissions.

## Follow-up

Tables → `tuucho-plugin-schema`. Gateway/courier registration → payment or
shipping skills. Front slot for a cart line → `tuucho-plugin-slot`.
