---
name: tuucho-plugin-permission
description: >-
  Registers tuucho-ecom staff role permissions on a plugin manifest and gates
  HTTP with requirePermission. Use when adding an Admin, Roles code. Never
  adds codes to CORE_PERMISSIONS.
---

# Plugin permissions

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.

## Recipe (moved from the router; aligned with the current tree)

Put staff permissions on the manifest. They appear in Admin, Roles only while
the plugin (and every `dependsOn` parent) is on. Core does **not** hardcode
plugin codes in `CORE_PERMISSIONS`. Plugin codes join the grantable catalogue
at runtime (`enabledPluginPermissionCodes`). `PermissionCode` is `string`.

```json
"permissions": [{ "code": "loyalty", "label": "Loyalty wallet" }]
```

Code pattern: `^[a-z][a-z0-9_]{1,63}$`. Gate HTTP with
`requirePermission('your_code')` imported from
`@kernel/back/middleware/requirePermission` (do not edit it) and keep the
plugin off-path with `requirePluginEnabled` on mounts you own
(`registerHttpMount`). Example: `tuucho-commerce-loyalty`.

Do **not** add a row to kernel `CORE_PERMISSIONS`, kernel permission
migrations, or admin i18n catalogues for a plugin code. If the permission
must be a **core** section (orders, users, …), **stop and tell the user**.

Worked example in Admin, Documentation: permissions.
