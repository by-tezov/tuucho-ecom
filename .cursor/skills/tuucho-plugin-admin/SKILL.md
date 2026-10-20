---
name: tuucho-plugin-admin
description: >-
  Adds a tuucho-ecom admin page, sidebar nav, and Configure/settings form. Use
  when adding Admin UI, adminNav, handbook docs, or theme Configure. Never
  edits the kernel.
---

# Admin page plugin

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.

## Recipe (moved from the router)

1. Manifest `provides: ["AdminPage"]` and `permissions` if staff-gated (then
   **tuucho-plugin-permission**).
2. `adminNav`: `{ id, group, to, permission, order, label }`. `to` is the
   path after `/admin`. `pluginId` is the folder id.
3. `front/index.tsx` `adminRoutes` with `element`. Gate the page with
   `usePluginEnabled(id)` (NotFound when off).
4. HTTP via `api.registerHttpMount({ scope: 'admin', path, router })`. On the
   router: `requirePermission('your_code')`. Do **not** add a kernel HTTP
   router.
5. Prefer `settingsSchema` for Configure (auto form at
   `/admin/plugins/<id>`). Use `type: "secret"` for write-only credentials
   (never kernel JSON, never bootstrap). Prefer a Preferences **entry**
   (`core.preferences.entries`) when a dedicated page is not pertinent.
6. Do **not** reuse Plugins → Configure as a link to docs, SEO, journals, or
   any other admin screen. Configure is only `settingsSchema` / theme at
   `/admin/plugins/<id>`. Payment-method switches stay in Preferences. Courier texts, times, prices and
   parcels are the kernel Couriers JSON page (`courier_edit`). A dedicated
   admin page uses `adminNav` + `adminRoutes`.
7. `docs/handbook.json` (identity, Configure, openings, cart/order/profile).
   Optional `docs/articles.json`.

Copy structure from `tuucho-docs-developer` (docs site), `tuucho-commerce-loyalty` (CRUD +
dashboard card is a **slot**), or `tuucho-theme-default` (colour Configure writing
`store.theme` through the store API — do not invent a second required theme).

Scan is **install**. Enable runs schema `up`. Disable unloads code and keeps
tables. Uninstall is **tuucho-plugin-schema**.

## Follow-up

HTTP + filters → `tuucho-plugin-opening`. Tables → `tuucho-plugin-schema`.
Admin Home cards → `tuucho-plugin-slot` (`slot.admin.dashboard`).
