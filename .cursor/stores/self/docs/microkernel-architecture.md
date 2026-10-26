# Microkernel architecture plan

Checkout: `/home/tezov/Local/tuucho-ecom` (`CORE_VERSION` 1.0.9). Git is read-only. Do not treat repo `tuucho/docs/microkernel.md` as truth until it is rewritten: it described a pre-split runtime.

**Product vision file** `/cursor/stores/self/docs/project-context.md` was not on disk (`/cursor` does not exist on this worker). Vision used here is Te’s stated intent plus README / skills: ready-to-use e-commerce for French micro-entreprises. Kernel = mechanic. Pre-bundled `plugins/tuucho` = what almost every small shop needs. Shop-specific code = `plugins/user/`.

**Verdict:** Te is **directionally right**. Gallery, product, stock, cart, orders, invoices, users/roles, and **shells** for payment, courier, SEO, and **email** live in the kernel. Locale and theming are **engines in the kernel** with **packages that look like plugins**. Contact is a **pre-bundled Tuucho plugin** (shop mailbox, not a primitive). Checkout and the plugin host stay kernel.

This file is the living plan **and** the execution log for this turn.

---

## 0. What the tree is today

| Layer | Path | Role |
| --- | --- | --- |
| Kernel back | `kernel/back/src/modules/` | Plugin host loads `back/register.ts` via `loadPluginRuntime.ts`. Email, payment, courier, SEO shells live here. |
| Kernel front | `kernel/front/src/` | App chrome, gallery, cart, admin shell. PluginHost eager-globs `plugins/**/front/index.tsx`. |
| SDK | `plugin-sdk/` | Hooks, `PluginRegisterApi`, payment/shipping/HTTP/mail shells, cache. |
| Bundled plugins | `plugins/tuucho/<group>/<feature>/<id>/` | Ids start with `tuucho-`. Set listed in `plugins/tuucho/manifest.json`. |
| User plugins | `plugins/user/` | Demo and zip upload. Never overwrite `plugins/tuucho`. |
| Sample shop | `sample/` + installer | Shop atelier. Not a second kernel. |

Runtime is a loadable kernel: enabled plugins `import()` `register.ts` and call `addFilter` / `registerPaymentGateway` / `registerHttpMount` / `api.sendMail`.

---

## 1. Kernel vs plugins (corrected)

### 1.1 Kernel mechanic (stay)

Gallery, product, stock, cart, **checkout orchestration**, orders, invoices, addresses, vocabulaire / axes, users / roles / impersonate, auth session, plugin host, admin chrome, UI registry (`KERNEL_UI`), **Preferences / My profile / notifications pages** (plugins add **rows**).

### 1.2 Kernel shells (plugins register into them; plugins do not own the transport)

| Shell | Kernel engine | Plugin role |
| --- | --- | --- |
| **Email** | `kernel/back/src/modules/messaging/` (`sendMail` / SMTP / folder routing, `mail_jobs`, `sendTemplatedMail`, filters `mail.send` / `mail.templates` / `mail.recipients`) | Register templates and catalogs. Call `api.sendMail` / `api.sendTemplatedMail` / `api.enqueueMailJob`. **No plugin SMTP.** |
| Payment | `payments/` + `registerPaymentGateway` | Stripe (and later others) register methods. |
| Courier | `delivery/` + `shipping/` + `registerShippingMethod` | Home / Mondial / expedition-cron. |
| SEO | `seo/` engine, Settings → SEO, `APP_TARGET===prod` gate | Extra sitemap entries, robots rules, **redirects apply** (optional plugin). |

**Email verdict:** the kernel **already had** the engine. This turn binds it on `PluginRegisterApi` (`setMailSender` in the SDK, same pattern as the cache sealer). Plugins must not add nodemailer/SMTP.

### 1.3 Engines in kernel, packages that look like plugins

**Locale.** Language switch, `assembleDictionary`, English dictionaries, `ENABLED_LANGUAGES` = kernel. French = `tuucho-kernel-locale-fr` plus `*-locale-fr` overlays.

**Theming.** `theme.css`, `ThemeTokens`, header / burger / bottom bar = kernel. `tuucho-theme-default` is optional Configure hexes + `storefront.theme.slots`, **not** `required`. A later theme package may `replace` `KERNEL_UI`.

### 1.4 Must stay kernel, missing from Te’s first list

Plugin host, checkout, addresses, Preferences/profile/notifications **pages**, vocabulary, admin chrome, mail **worker**, UI registry defaults.

### 1.5 Contact is a plugin

Guest `POST /contact`, account chat, admin Contact hub, permission `messages` = **`tuucho-contact`** at `plugins/tuucho/messaging/contact/tuucho-contact`. Tables `unconnected_*` / `chat_*` stay kernel-named (no live PII migration). Product-request HTTP on `/contact/product-request` stays with `tuucho-commerce-product-requests`. Kernel must not own the shop mailbox.

### 1.6 Correctly plugins

Commerce extras, Stripe gateway, shipping methods, home slots, docs, journals, locale packs, `plugins/user/demo/guides/page-guides`, **contact**. Legal pages are the user plugin `page-legal` (footer only).

---

## 2. Wrong aspects (and what this execution did)

1. **`pluginBridges.ts`** — gone as an id list. Dispatch is `listedPluginServices()` + method name (`callPluginMethod` / `peekPluginMethod`). Named wrappers remain so checkout/orders keep compiling; they no longer mention `tuucho-commerce-*`.
2. **Payment method booleans** — shop prefs stay on the **payment-method shell** (any `kind === 'payment'` Configure, disable clears that gateway's methods). Root `package.json` no longer depends on `stripe`. Kernel `stripeClient.ts` picks `listPaymentGateways().find(g => g.getClient)`, not `tuucho-payment-stripe`.
3. **Secretly-kernel plugin UI** — journals (`crons`, `api-log`, `email-log`) and the Mondial picker page left `App.tsx`. Activity journal stays kernel (`CORE_PERMISSIONS`).
4. **SEO plugin ids** — unchanged from the previous turn (engine lists pages itself).
5. **Theme required** — cleared earlier.
6. **Contact/chat application** — moved into `tuucho-contact` (HTTP + application + ops inbound). Product-request application/HTTP/admin moved into `tuucho-commerce-product-requests`. Kernel callers (admin users, DB backfill) use `callPluginMethod`.
7. **FAQ accordion copy** — English items live in `home-faq` (`faqItems.ts` + `front/catalog.ts`). Kernel `t.faq.items` is empty. French overlay remains `home-faq-locale-fr`. `assembleDictionary` merges non-locale catalogs into English.
8. **Catalogue `'nail'` defaults** — sitemap/filter-option helpers no longer default to `'nail'`. Front gallery catalog axis is `'sets' | 'units'`. Stored `product_type` values are Shop identity (cannot drop without a data migration).
9. **Front host is eager** — **bundler constraint**, documented on `PluginHost.tsx`. Screen map still reads only kernel `App.tsx`.
10. **Pre-bundle policy** — unchanged.

---

## 3. Ordered plan vs this turn

| Slice | Status |
| --- | --- |
| A Tell the truth | Done |
| B Fold fake plugins | Done (packages kept) |
| C Extract secretly-kernel plugin UI | Contact application + journals + Mondial picker **done** |
| D Payment/courier real shells | Stripe id special cases + root dep **done**. Method toggles stay on the shell |
| E Kill `pluginBridges` ids | **Done** (shim remains, id-agnostic) |
| F Generic catalogue | Defaults/front axis **done**. Stored `nail` / `nail_single` **cannot move** |
| G Pre-bundle policy | Done earlier |
| H Install/update | Done earlier |

---

## 4. Install + update (simple model)

**One public GitHub repo. `master` plus version tags (`1.0.9` = root `package.json` version, no `v` prefix). Running kernel identity is live root `package.json` (`CORE_VERSION`). `tuucho-versioning.lock.json` is gitignored last-applied Apply state (missing on a fresh clone is fine). One bundled-plugins manifest JSON. Shop owner updates the whole tree. Admin Check / Apply pulls official tags. Zip upload writes `plugins/user/` (or `plugins/tuucho/` for `tuucho-*` ids).**

Manifest path: `plugins/tuucho/manifest.json`. Disk leaf `package.json` with a `tuucho` object is scan source of truth. Admin Plugins shows enable/disable/Configure/uninstall only.

---

## 5. Inventory after this turn

Contact/chat **application + HTTP** live in `tuucho-contact`. Product-request application + HTTP live in `tuucho-commerce-product-requests`. Kernel keeps PII table names (`unconnected_*`, `chat_*`), the mail worker, `ImageAttachField`, and HTTP clients under `kernel/front/src/api/contact.ts` / `chat.ts`.

Journal admin screens live in `tuucho-journal-cron` / `admin` / `email`. Mondial picker page + widget live in `tuucho-shipping-mondial-relay`. Kernel cart/address screens consume a generic `PickupPoint`.

### Gone this turn

- Kernel `modules/contact` and `modules/chat` application/HTTP (except leftover READMEs until module-docs regen)
- Journal screens and Mondial picker in `App.tsx`
- `tuucho-commerce-*` strings in `pluginBridges.ts`
- Hardcoded `tuucho-payment-stripe` in `stripeClient`, Configure, and plugin disable
- Root `stripe` npm dependency
- Kernel English `t.faq.items` copy
- Function defaults of `productType = 'nail'`
- Front gallery catalog label `'nails'` (now `'units'`)

### Truly cannot move (with why)

| Stay | Why |
| --- | --- |
| `unconnected_*` / `chat_*` tables + kernel migrations | Live PII. No shop-data rewrite this turn. |
| Mail worker / SMTP / `mail_jobs` | Email **shell**. Plugins enqueue and register deliverers. |
| Payment method prefs (`payment_*_enabled`) | Payment-method **shell**. Any payment plugin's Configure edits them. |
| `kernel/back` `stripe` dependency | Testhost/scripts talk to Stripe's API directly (`import Stripe from 'stripe'`). Plugin already has its own `stripe` dep. |
| `getStripe()` / `platform/stripe/stripeClient.ts` name | Payment shell handle. Filename is historical; the lookup is gateway-agnostic. |
| Stored `product_type` `'nail'` / `'nail_single'` / `'accessory'` | Shop catalogue identity in the DB. Sitemap/gallery/hydration read it. |
| Vite eager glob + `sync:screens` | Bundler/scanner constraint. Disable hides UI; JS stays in the graph. Screen map does not walk `pluginFront`. |
| `ImageAttachField` | Shared kernel upload widget (admin thread composer too). |

---

## Paths

| File | Role |
| --- | --- |
| This plan | `.cursor/stores/self/docs/microkernel-architecture.md` (and worker store copy) |
| Repo doc | `tuucho/docs/microkernel.md` |
| Skill lock | `.cursor/skills/tuucho-create-plugin/SKILL.md` |
| Bundled set | `plugins/tuucho/manifest.json` |
