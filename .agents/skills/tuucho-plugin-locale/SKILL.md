---
name: tuucho-plugin-locale
description: >-
  Adds tuucho-ecom locale plugins (tuucho-kernel-locale-en / fr and
  <id>-locale-<code> complements). Use when overlaying kernel or plugin copy,
  email catalogs, or registering an extra storefront language code.
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

Kernel UI and every bundled feature plugin package own **keys** only. Sentence
values live in locale plugins. Builtins are `en` and `fr`; extra codes are
allowed when a locale plugin calls `registerLanguage`.

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
- `<id>-locale-<code>` with `dependsOn` on the parent: plugin values. Live in
  the same feature folder as the parent. Example:
  `src/plugins/onboarding/onboarding-locale-en`. Code is a 2–3 letter
  lowercase subtag (`en`, `fr`, `th`, …).
- To offer a language beyond the builtins, the standalone kernel (or shop)
  pack for that code must call:

```ts
api.registerLanguage({
  code: 'th',
  nativeName: 'ไทย',
  ogLocale: 'th_TH',
  dateLocale: 'th-TH',
});
```

  Put the code in `tuucho-config` `i18n.enabled` (and usually `i18n.default`
  when it should lead). Vite copies `i18n.enabled` into
  `VITE_ENABLED_LANGUAGES`. Boot fails if an enabled code was never registered.

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
