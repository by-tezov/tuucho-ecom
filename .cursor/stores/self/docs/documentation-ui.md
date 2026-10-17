# Documentation reader

Checkout: `/home/tezov/Local/tuucho-ecom` on `dev/refactor-split`. Git is read-only. Preferences.md was not found. `/cursor/stores/self` is not writable on this machine.

Handbook **UI** stays in `kernel/front/src/components/ui/docs/` (callouts, cadres, steps, tables, defs, highlighted code). This turn is **content**: developer APIs, not identity cards.

## Rule for a page

Ship a Documentation page only when a developer (or an IA) can act from it: openings, slots, routes, storage, permissions, how to extend, code.

Do **not** generate Package / Version / Kind / Enabled / "No Configure form". Locale packs stay off the rail (kernel article **Locale overlays** covers the pattern). `tuucho-docs-developer`'s own handbook is omitted so the rail is not titled Documentation twice.

`handbookArticle()` now returns `null` when `sections` is empty. `buildDocsSite()` does not invent filler.

## IA

| Section | Pages | Ids |
| --- | --- | --- |
| Start here | Welcome; How the shop is built | `welcome`, `architecture` |
| Kernel APIs | Register API; Openings; Front slots; UI registry; Permissions; **Contact**; Other kernel surfaces; Locale overlays | `kernel-register`, `core-openings`, `front-slots`, `kernel-ui`, `permissions`, `contact`, `kernel-surfaces`, `locales` |
| Extend the shop | Extend SEO; Plugins talking to plugins | `extend-seo`, `plugin-to-plugin` |
| Ship a plugin | Anatomy; Create with Cursor; Versioning; Storage and uninstall | `create-plugin`, `create-plugin-ai`, `versioning`, `data-lifecycle` |
| Walkthroughs | Profile card; Courier; Loyalty; Staff permission | `example-*` |
| Bundled (by install path) | Real plugin handbooks only | `plugin-<id>` |

Contact is **kernel**, not a plugin. The article covers guest form, account chat, admin hub, tables, encryption, routes, `messages` / `users`, mail, preferences, and the explicit absence of a contact opening.

## Plugin pages that stay

Every non-locale bundled plugin that does something has `docs/handbook.json` **sections** (FAQ how entries get in, theme tokens + UI replace, page enable=menu, commerce filters, Stripe gateway, shipping shell, SEO contributors, journals, demo extension).

FAQ: entries are `t.faq.items` `{ q, a }[]` from kernel English + locale-fr overlay. No CRUD table. Replace `slot.home.faq` to ship a different FAQ.

## Writing

- Short blocks. One idea per cadre, row, or step.
- Invariants in callouts.
- No em dash or en dash. Name screens: Settings → SEO, Admin → Plugins, Admin → Roles.
- Public indexing is on only when `APP_TARGET` is `prod` (Extend SEO).
