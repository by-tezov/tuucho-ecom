---
name: tuucho-plugin-locale
description: >-
  Adds tuucho-ecom French locale plugins (locale-fr and <id>-locale-fr
  complements). Use when overlaying kernel or plugin copy, or email catalogs.
  Never adds extra product languages.
---

# Locale plugins

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.

## Recipe (moved from the router)

Kernel UI and every bundled feature plugin package are **English only**.
French is a locale plugin.

- Locale `plugin.json` may omit `description`; every other plugin must have one.
- `tuucho-locale-fr` (`kind: locale`): kernel chrome + email + invoice overlay
  (`invoice.render` copy). Example: `plugins/tuucho/locale/tuucho-locale-fr`.
- `<id>-locale-fr` with `dependsOn` on the parent: plugin copy. Live in the
  same feature folder as the parent. Example:
  `plugins/tuucho/home/onboarding/tuucho-onboarding-locale-fr`.
- Product languages are **en+fr**. Do not add es/it/nl/pt/th.

Front overlay:

```tsx
export const pluginFront: PluginFrontModule = {
  pluginId: 'your-id-locale-fr',
  locales: [{ lang: 'fr', catalog }],
};
```

Kernel French also ships `adminCatalog`. Email:

```ts
api.registerEmailCatalog('fr', catalog);
api.registerEmailCatalog('key:fr', overlay);
```

Disable the complement and that plugin stays English even when `tuucho-locale-fr`
is on. `dependsOn` is not auto-enabled.

If you need a language that is not `fr`, **stop**. The locale shell stays in
the kernel; this skill does not extend it.
