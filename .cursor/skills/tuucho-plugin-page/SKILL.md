---
name: tuucho-plugin-page
description: >-
  Adds a tuucho-ecom storefront page plugin and menu entry (enable equals
  visible). Use when adding a public page, nav item, or copying
  demo-page-guides. Never edits the kernel.
---

# Storefront page plugin

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## When to use

A public URL and a header/burger/footer item. There is **no Menus tab**.
Enable = menu. Off = gone. Home completions (`slot.home.*`) are
**tuucho-plugin-slot**, not this skill. Legal documents (`page-legal`)
and the accessibility statement (`page-accessibility`)
are **footer only** — do not add them to the shop info menu.

## Recipe (moved from the router)

1. Copy `src/plugins/demo/guides/demo-page-guides/` into `src/plugins/<group>/<id>/`
   (user: id must not start with `tuucho-`) or `tuucho/plugins/page/<feature>/tuucho-<id>/`
   if bundled. Leaf folder name = `id`. Put any `*-locale-*` complement in that
   same feature folder. Guides is a **demo user plugin**, not a Tuucho product plugin.
2. `kind: "page"`. Set `route` (no locale prefix) and `nav.key` / `order` /
   optional `bottomBar`. `provides: ["StorefrontPage"]`. Omit `nav` when the
   page must stay footer-only (`page-legal`, `page-accessibility`).
3. Dedicated React (see `tuucho-page-home`, `tuucho-page-about`, `demo-page-guides`, `page-legal`)
   ships `front/index.tsx` `publicRoutes`. Title/body-only pages may still use kernel
   `PluginContentPage` + `settingsSchema`. Kernel does not own home, about, sizes, or legal routes.
4. `required: true` only for pages that must never disable (`tuucho-page-home`).
5. English copy in this package. French → **tuucho-plugin-locale**.
6. Scan, enable. Configure uses `settingsSchema` (`string` / `text` /
   `number` / `boolean`). Empty Configure is hidden.

Do not add collection as a plugin. Contact is already `tuucho-contact`.

## Follow-up

Need an admin CRUD page after the public page exists → Read
`tuucho-plugin-admin`. Need a home block instead of a menu URL → Read
`tuucho-plugin-slot`. A public URL that is not `tuucho.route` on `package.json` must
join the sitemap / robots / meta through **tuucho-plugin-seo**.
