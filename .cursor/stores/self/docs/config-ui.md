# Plugin Configure UI

Checkout: `/home/tezov/Local/tuucho-ecom`. Git **read-only** (no commit, no push, no GitHub). Do not steal Vite **5174**. Do not print secrets.

This pass: **one shared Configure chrome** for every plugin with `settingsSchema`, built from the **kernel UI kit**. Nothing “later”. Plan first; then execute in this same turn.

---

## What is wrong today

`AdminPluginConfigurePage` SettingsForm is a title, no per-field explanation, and a giant `<textarea rows={6|2}>` (CSS `min-height: 8rem`) for almost every string. Secrets are a password box that pretends to hold the value. Booleans already use `ToggleSwitch`; everything else is one-off native markup.

`pluginFront.configure` **replaces** the schema form. Contact’s extra (spy-mail recipients) hides identityMax / SMTP / media. Operators never see those knobs.

`discoverPlugins` keeps only `type` + optional `label` and **drops** `description`, `section`, `url`, `email`. Even a well-written schema cannot reach the UI.

`KERNEL_UI` has Button, ToggleSwitch, Chip, SegmentedSwitch, RequiredMark, DocsCallout, SectionHeading — and **no form field**. SectionHeading is storefront-sized (`clamp(1.75rem … 2.875rem)`). Configure must not invent a parallel kit, native `<select>`, or an unstyled textarea.

Identity methods (Admin → Preferences) is the **shell** (enable / verbose / Facebook direct OAuth). Credentials live on `tuucho-signin-*` Configure. The opening must **link**, not duplicate keys. Do not put an admin href on `CORE_OPENING_FILTERS.signIn` itself — that opening also renders on the customer account page.

---

## Invariant: kit first, then Configure

**Use the components given by the plugin or kernel UI.** If what you need is missing, **add it to that kernel or plugin component library** so others can reuse it. Do not invent one-off markup, native `<select>`, or a giant unstyled textarea on the Configure page.

**New field types land in the shared kit first, then Configure consumes them.** Order of work is not optional:

1. Register names on `KERNEL_UI`.
2. Implement wrapped defaults under `kernel/front/src/components/ui/` (`withKernelUi`).
3. Barrel + `kernel-ui-components.md` + wrappedDefaults test.
4. Then SettingsForm / ThemeForm import those names. Zero native controls on the Configure page except what a kit component itself wraps (for example `input type="color"` inside `ColorField`).

A plugin that needs a control the kernel does not own **extends** with `pluginFront.ui` (`ui.PascalCase`). Configure must not grow a private Field.

---

## Shared chrome (all plugins)

One page: `/admin/plugins/:id`.

| Surface | Who |
| --- | --- |
| Schema form | Kernel SettingsForm, data-driven from `settingsSchema` |
| Theme hexes | Kernel ThemeForm, consuming `ColorField` |
| Extra below schema | `pluginFront.configure` **composes**, never replaces, when schema also exists |
| Extra only | `pluginFront.configure` alone when there is no schema (none today except this contact extra) |

`pluginHasConfigure`: theme, or front extra, or any plugin whose `settingsSchema` / stored settings has keys. **Do not gate by kind** — commerce (gift, loyalty, vouchers, product-requests, vinted-review) and generic spy-mail must get the same chrome.

Mobile: full-width fields, control min-height 44px, save button stretches. Not desktop-only stacked giants.

Save success/error stay the page’s inline notice (ToastProvider comment: save is visible page state, not a toast).

---

## Kit additions (`KERNEL_UI`)

All new names are kernel defaults, wrapped, overridable by a theme `replace: true`.

| Name | Role |
| --- | --- |
| `ui.Field` | Label + **help text under the label** + control slot + optional error (`Typography.fieldError`). Description is part of the chrome, not a sibling `<p>` on Configure. |
| `ui.FormSection` | Compact admin group: title + one-line purpose + children. **Not** `SectionHeading` (storefront hero size). |
| `ui.TextField` | One-line control. `type`: `text` \| `url` \| `email` \| `number` \| `password`. Styled input, 44px min-height. |
| `ui.TextareaField` | Long value only (PEM, JSON, multi-line copy). Sized (`compact` ~3 rows / `long` ~6). Never the default for a URL or app id. |
| `ui.SecretField` | `Field` + `Chip` (set / not set) + replace `TextField` (password) or `TextareaField` when `long`. Empty replace = leave unchanged. **Never shows the stored value.** |
| `ui.SelectField` | Exclusive choice. ≤4 options → `SegmentedSwitch`. More → `Chip` group. **Never** native `<select>`. |
| `ui.ColorField` | Theme hex: native colour swatch (the actual colour control) + hex `TextField`. ThemeForm consumes this; do not leave raw colour inputs on the page. |

Existing kit used as-is: `Button` (save, opening link), `ToggleSwitch` (boolean, inside `Field`), `Chip`, `SegmentedSwitch`, `RequiredMark` / `RequiredFieldsNote` if a field is required later.

CSS lives next to the component (`Field.module.css`, …), not as a Configure-only dump in `AdminPlugins.module.css`. Drop `.field textarea { min-height: 8rem }` from that page module once the kit owns sizing.

---

## Schema contract

`PluginSettingField` (plugin-sdk **and** kernel `contracts.ts`, keep them twins):

```
type: 'string' | 'text' | 'number' | 'boolean' | 'secret' | 'url' | 'email'
label: string          // required — empty is a product bug
description: string    // required — empty is a product bug
section?: string
sectionTitle?: string
sectionDescription?: string
placeholder?: string
options?: { value: string; label: string }[]
long?: boolean         // secret PEM / JSON → SecretField textarea
```

`discoverPlugins` must **keep** description, section*, placeholder, options, long, and the new types. Dropping them is how today’s UI went blind.

Control map (SettingsForm, no per-plugin JSX):

| type | Control |
| --- | --- |
| `boolean` | `Field` + `ToggleSwitch` |
| `number` | `Field` + `TextField type="number"` |
| `url` | `Field` + `TextField type="url"` |
| `email` | `Field` + `TextField type="email"` |
| `secret` | `SecretField` (`long` → textarea replace) |
| `text` | `Field` + `TextareaField compact` (only when the value is long copy) |
| `string` + `options` | `SelectField` |
| `string` | `Field` + `TextField` |

Sections: consecutive keys with the same `section` id wrap in `FormSection`. First occurrence of `sectionTitle` / `sectionDescription` wins. Keys without `section` render in a default “Settings” group.

Secrets: draft starts empty. `secretKeys` from the API (names only) drives the Chip. PATCH omits empty secret strings (`patchPluginSecrets` already skips blanks; still do not send them). Encrypted at rest is already done (`plugins.secrets` sealed JSONB).

English strings live on the schema. Chrome strings (set / not set / leave empty) live on `admin.whiteLabel` + `tuucho-locale-fr` `adminCatalog`. Do not hardcode field copy on the Configure page.

---

## Plugin schemas (fill every key)

Every bundled `settingsSchema` gets a human label, a short description (what it is and when to fill it), a correct type, and a section. Empty description fails the discover test.

**Mondial Relay** — API2 (url + enseigne/login/password secrets), API1 (url + enseigne/key secrets), Point vs home codes/modes, sender address, public tracking URL + throttle/timeout.

**Stripe** — Keys (publishable string, secret + webhook secrets), timeouts / auth-expiry spy / one-time card retention.

**Facebook / Google / Apple sign-in** — App/client ids vs secrets vs return/redirect URLs vs TTL. Apple PEM is `secret` + `long: true`. `oauthReturnUrl` / `redirectUri` are `url`.

**Contact** — Limits, media dirs, SMTP (host/port/user/from + password secret), seed/forward recipients, rate limit. Schema form **plus** existing spy-channel extra **below**.

**Spy-mail, gift, loyalty, vouchers, product-requests, vinted-review, footer-identity** — same chrome; group rate-limits vs TTLs vs seed recipients vs copy.

Identity plugins: keep `addFilter(CORE_OPENING_FILTERS.signIn, …)` **without** `href`. Admin Preferences injects a `Button` to `adminPath('/plugins/' + pluginId)` so the shell does not duplicate keys and the customer account page does not grow an admin link.

`OpeningEntries`: `Button` (`to=`), not a raw `<Link>`. Optional `actionLabel` (chrome “Configure”).

---

## Tests

- Wrapped defaults resolve `Field`, `FormSection`, `TextField`, `TextareaField`, `SecretField`, `SelectField`, `ColorField`.
- `discoverDiskPlugins`: every `settingsSchema` field has non-empty `label` and `description`; `url`/`email`/`section` survive the parser.
- SettingsForm source does not contain native `<select` or a page-local `<textarea`.
- `pluginHasConfigure` is true for a commerce/generic plugin **with** schema; still false for mocks without schema (admin CRUD pages stay sidebar items).
- Mail-spy / product-requests tests that claimed `settingsSchema` undefined are stale vs isolation — they must expect a labelled schema and still a dedicated admin page.
- Contact front still registers the spy extra; Configure page composes schema + extra.
- Sign-in register files have no credential keys on the opening, only title/description.

---

## Verify (after execute)

Shop keeps booting (`/healthz`). Vite **5174** untouched. Spot-check Configure is readable and self-explanatory for at least:

- Mondial Relay (API2 vs API1 vs sender vs tracking)
- Stripe (keys vs timeouts)
- Facebook Login (app id vs secret vs return URL)
- Contact (limits/SMTP **and** spy recipients below)

Do not print secret values. Chip set/not-set is the proof.

---

## Out of scope

Kernel JSON, leftover env, secret encryption (already sealed). Do not edit the payment-method or courier shells. Do not add extra product languages; schema copy stays English. Git stays read-only.
