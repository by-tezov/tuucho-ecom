---
name: tuucho-create-plugin
description: >-
  Creates or extends a tuucho-ecom plugin by dispatching to one specialized
  child skill. Use when adding, extracting, or extending a plugin (page, admin,
  slot, opening, schema, locale, payment, shipping, permission, SEO, UI). Never edits
  the kernel.
---

# Create a tuucho-ecom plugin

Use this skill whenever you add, extract, or extend a plugin in
`/home/tezov/Local/tuucho-ecom`. Work only in that tree. Do not touch Pam.

This file is a **router**. Do not implement from it. **Read exactly one**
child `SKILL.md` after you pick the kind.

## Kernel is read-only

Write only `plugins/tuucho/<group>/<feature>/<id>/` (id starts with `tuucho-`;
put `*-locale-*` complements in that same feature folder) or
`plugins/user/<group>/<feature>/<id>/` (id must not start with `tuucho-`).
Standalone locale packs (`tuucho-locale-fr`) live in `plugins/tuucho/locale/`
with no fake parent. Never `kernel/`. Never
`@tuucho/plugin-sdk` contracts or kernel migrations. If the opening, slot, or
shell you need is missing, **stop and tell the user**. Do not patch the kernel
from this skill.

## Te lock

**Stay in core** (never extract): plugin runtime, shop/axes, vocabulaire,
Préférences page (plugins add an **entry**), roles UI (plugins register
codes), users/impersonate, orders, stock/libraries, collection, checkout,
My profile page (plugins add **entries**), auth session, customer addresses,
payment-method **shell**, courier **shell**, SEO **engine**, email **shell**
(SMTP / mail_jobs; plugins call `api.sendMail`), notifications page (plugins
add **entries**). Locale and theming **engines** stay kernel; language packs
and optional theme packages are plugins. `tuucho-theme-default` is not required.

**Must be plugins**: theme packages, pages, docs, payment gateways, shipping
methods, vouchers, cart rules, gifts, loyalty, Vinted review, product
requests, journals, home slots, locales, **contact** (`tuucho-contact`),
**spy e-mails** (`tuucho-mail-spy`; kernel still owns SMTP),
anything whose absence must hide UI.

## Pick one child, then Read it

| User wants | Read |
| --- | --- |
| Storefront page + menu (enable = visible) | `.cursor/skills/tuucho-plugin-page/SKILL.md` |
| Admin page, nav, settings / Configure | `.cursor/skills/tuucho-plugin-admin/SKILL.md` |
| Fill or replace a front slot / view | `.cursor/skills/tuucho-plugin-slot/SKILL.md` |
| `addFilter` / `addAction` (cart, checkout, mail, invoice, cache, HTTP) | `.cursor/skills/tuucho-plugin-opening/SKILL.md` |
| `plugin_<id>_` tables, up/down, disable vs uninstall, zip upload | `.cursor/skills/tuucho-plugin-schema/SKILL.md` |
| `tuucho-locale-fr` or `<id>-locale-fr` | `.cursor/skills/tuucho-plugin-locale/SKILL.md` |
| Payment gateway into the payment-method shell | `.cursor/skills/tuucho-plugin-payment/SKILL.md` |
| Shipping method into the courier shell | `.cursor/skills/tuucho-plugin-shipping/SKILL.md` |
| Staff role permission | `.cursor/skills/tuucho-plugin-permission/SKILL.md` |
| Register a spy / ops-notify mail channel | `.cursor/skills/tuucho-plugin-spy/SKILL.md` |
| Sitemap, robots, meta, JSON-LD, redirects | `.cursor/skills/tuucho-plugin-seo/SKILL.md` |
| Use, extend, or override kernel UI controls | `.cursor/skills/tuucho-plugin-ui/SKILL.md` |

Theme Configure hexes → admin. Theme **component** replace → tuucho-plugin-ui.
SEO extras → tuucho-plugin-seo. Cron complement → opening. FAQ /
home block → slot (not a menu page). Prefer a Preferences **entry** over a
blank Configure page. Kernel Button/Chip/Confirm → tuucho-plugin-ui (do not
invent a one-off control).

When the kind is unclear, Read
[references/kernel-index.md](references/kernel-index.md) (names only), then
load the skill it names.

## Shared rules

Leaf folder name = `id` = `[a-z0-9-]+`. Bundled ids start with `tuucho-`.
Nested grouping folders are allowed. A plugin and its `*-locale-*`
complements share one feature folder (e.g. `commerce/gift/`). Ship
`plugin.json` + `back/register.ts`.
Host `import()`s `register.ts`. Use `@tuucho/plugin-sdk`. Kernel modules:
`@kernel/front/…` (plugin fronts, CSS `composes`) and `@kernel/back/…`
(plugin backs). Do not write `../../../../../../kernel/…`. English strings in
the plugin; French is a locale complement. `engines.core` e.g.
`>=1.0.0 <2.0.0` (bump kernel patch/minor without changing the 1.x range).
Do not ALTER kernel tables. Scan/enable from Admin, Plugins. Ship
`docs/handbook.json`. Git tags for Check / Apply are `MAJOR.MINOR.PATCH`
(`1.0.9`), never `v1.0.9`. Kernel version is `CORE_VERSION`, not
`package.json`.

Complements: the API/capability plugin owns storage (`tuucho-journal-api`,
`tuucho-shipping-home`); cron/email/admin declare `dependsOn`.
`isPluginEffectivelyEnabled` is false if any ancestor is off. Runtime does
not auto-enable dependencies.

```json
{
  "id": "your-id",
  "name": "Human name",
  "version": "1.0.0",
  "kind": "theme | page | payment | shipping | commerce | docs | generic | seo | locale",
  "description": "Operator-facing summary of what it does (required except locale plugins).",
  "required": false,
  "defaultEnabled": true,
  "provides": ["AdminPage"],
  "dependsOn": [{ "id": "optional-parent", "version": ">=1.0.0" }],
  "engines": { "core": ">=1.0.0 <2.0.0" },
  "installPath": "plugins/user/<group>/your-id",
  "repository": "https://github.com/owner/your-id",
  "permissions": [{ "code": "your_code", "label": "Your section" }],
  "route": "/optional-storefront-path",
  "nav": { "key": "optional", "order": 45, "bottomBar": false },
  "courierCodes": [],
  "defaultSettings": {},
  "settingsSchema": {}
}
```

Current branch only; no extra git branch; no PR unless asked.
