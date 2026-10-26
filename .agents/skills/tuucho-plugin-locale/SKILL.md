---
name: tuucho-plugin-locale
description: >-
  Adds tuucho-ecom locale plugins (tuucho-kernel-locale-en / fr and
  <id>-locale-en / <id>-locale-fr complements). Use when overlaying kernel or
  plugin copy, or email catalogs. Never adds extra product languages.
---

# Locale plugins

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations
  from this skill unless the task is the locale-pack architecture itself.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled plugins of the same kind (copy structure, not kernel code).
- Current branch only; no extra git branch; no PR unless asked.
- Plugin keys go on that plugin’s `settingsSchema` (public) or `type: "secret"` (secret store), never kernel JSON.

## Recipe

Kernel UI and every bundled feature plugin package own **keys** only. English
and French sentence values live in locale plugins.

- Locale `package.json` may omit npm `description`; every other plugin must have one.
- Keep `@tuucho/plugin-sdk` `file:` on **one line**, matching the sibling pack
  (for example `file:../../../../plugin-sdk` under `tuucho/plugins/...`, or
  `file:../../../../../tuucho/plugin-sdk` under `src/plugins/...`). Never split
  the path across lines.
- `tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr` (`kind: locale`):
  kernel chrome + email + invoice values (`invoice.render` copy for that
  language only). Examples:
  `tuucho/plugins/kernel-locale/tuucho-kernel-locale-en`,
  `tuucho/plugins/kernel-locale/tuucho-kernel-locale-fr`.
- `<id>-locale-en` and `<id>-locale-fr` with `dependsOn` on the parent: plugin
  values. Live in the same feature folder as the parent. Example:
  `src/plugins/onboarding/onboarding-locale-en`.
- Product languages are **en+fr**. Do not add es/it/nl/pt/th.

Front:

```tsx
export const pluginFront: PluginFrontModule = {
  pluginId: 'your-id-locale-en',
  locales: [{ lang: 'en', catalog }],
};
```

Kernel locale packs also ship `adminCatalog`. Email:

```ts
api.registerEmailCatalog('en', catalog);
api.registerEmailCatalog('key:en', overlay);
api.registerEmailCatalog('fr', catalog);
api.registerEmailCatalog('key:fr', overlay);
```

Disable a complement and that plugin's keys stay untranslated for that
language even when `tuucho-kernel-locale-en` / `tuucho-kernel-locale-fr` is
on. `dependsOn` is not auto-enabled.

If you need a language that is not `en` or `fr`, **stop**. The locale shell
stays in the kernel; this skill does not extend it.
