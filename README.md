# tuucho-ecom

Open-source single-shop e-commerce. One shop, plugins like WordPress,
Herd/Local friendly. MIT licensed.

Core is the mechanic: catalog, cart, checkout, orders, accounts, admin shell,
and a plugin runtime (hooks/filters, enable/disable). Pages, theme, payments
and shipping are plugins.

The sample catalog is generic demo products: a public library, private user
stock, and accessories. First install imports them with the sample couriers.
User stock is attached to the super-admin created at setup. The operator fills
the real shop name at setup.

## Five-minute install

Needs Node 22+, Docker (Postgres 10 on host port **5434**), and npm.

Clone a **version tag**, not untagged `master`. Pack git does **not** ship a
live root `package.json` (shop-owned after first install), so first run is
always a direct Node command (there is no `npm run setup`):

```bash
git clone --branch 0.0.9 --depth 1 https://github.com/by-tezov/tuucho-ecom.git
cd tuucho-ecom
# copies tuucho/factory-backup/root → clone root (once), then config → tuucho-config/
node tuucho/scripts/install.mjs --yes \
  --store-name Shop \
  --admin-email admin@shop.example \
  --admin-password 'ShopAdmin1!'
# APP_TARGET=dev is the local default (env key in tuucho-config/kernel/config.json)
npm run dev
```

Or open the web wizard: `node tuucho/scripts/install.mjs` then visit
http://127.0.0.1:8787

After install:

| | |
| --- | --- |
| Shop | http://localhost:5174 |
| Admin | http://localhost:5174/admin |
| API | http://localhost:3010 |

Sign in with the admin e-mail you chose. A second install is a no-op while
`installed.lock` exists.

Stripe and Mondial Relay keys are optional at install time. Configure them
after first Admin login on **Plugins → Configure** (secret store). Do not put
them in kernel JSON.

## Configuration (JSON, not a mega `.env`)

Kernel files live under `tuucho-config/kernel/`. Shop stamps stay at the
root (`plugins.json`, `migrate-stamp.json`, `plugins/`). Each config tree
(kernel, and each plugin under `tuucho-config/plugins/<id>/`) may declare
its own `environments` map in that tree’s common `config.json`. Paths in
the map are relative to that tree only. Folder style (`dev/config.json`),
name style (`config.dev.json`), or a mix are all valid when the map says so.
When the map is absent, the loader still discovers both layouts. Shipped
templates use folder style under `tuucho/factory-backup/config/kernel/dev/`
with an explicit map; first install copies them into local `tuucho-config/`.

Merge, top to bottom (bottom wins): common public → env public → common
private (or its example) → env private (or its example) → leftover process
overlay (`APP_TARGET`, `PORT`, optional `DATABASE_URL`). `APP_TARGET` must
match a kernel env key (local default `dev`). Missing env → error naming it.

Pack git ships templates only under `tuucho/factory-backup/`. Live
`tuucho-config/` is operator-owned (gitignored in this repo), created by
setup / `config:migrate`. Private JSON stays gitignored; each has a
functional `*.example` in the factory (and after install, locally). Boot:
missing private + example present → warning, load example, launch. Both
missing → error. Private present but required keys missing → error naming
each key. `npm --prefix tuucho/kernel/back run config:doctor` prints the
same list plus every known kernel environment.

`paths.outputDir` (env `OUTPUT_DIR`) roots every generated artifact: reports,
caches, log downloads, coverage, the dev email preview tree, and the local
Docker Compose env (`<outputDir>/docker/.compose.env`, written by
`composeEnv.mjs` / `composeUp.mjs` from private JSON). Unset it defaults to
`<clone root>/output`; a relative value resolves against the clone root. When
`paths.publicDir` / `paths.privateDir` / `paths.devDir` are unset they fall
back to `<outputDir>/public`, `<outputDir>/private` and `<outputDir>/dev`; an
explicit per-key value always wins. That Compose env is never written under
`tuucho/`.

`i18n.default` (env `I18N_DEFAULT_LANG`) is the fallback language for
`Accept-Language` and stored-preference resolution; `i18n.enabled` (env
`I18N_ENABLED_LANGS`, comma-separated) is the list the storefront bootstrap
advertises. Both are validated against the supported languages at boot: an
unsupported value fails startup with the offending entry named.

Plugin credentials use the same public / private / example split under
`tuucho-config/plugins/<plugin-id>/` (user plugins: next to `package.json`, or
`tuucho.configDir`). Runtime source of truth is still the shop DB. First
launch loads files once when that plugin has no operator values; boot never
overwrites Admin. Import and Update from files need `plugin_config_import`;
Export (including secrets) needs `plugin_config_export`. Ordinary Configure
save stays `preferences`. See Admin → Documentation → **Config files**.

| Concern | After first boot | File or Admin |
| --- | --- | --- |
| Kernel policy (TTLs, rates) | Local `tuucho-config/kernel/config.json` (from factory) | Operator file |
| Languages (default, enabled) | `i18n` in that common public file | Operator file |
| Env URLs / dirs | Paths from that file’s `environments` map (shipped template: `kernel/<env>/config.json`) | Operator file |
| DB / JWT / PII / ops / SMTP passwords | Common + env private files under `tuucho-config/kernel/` (from those `*.example` files) | Gitignored secrets |
| Plugin public settings | Local `tuucho-config/plugins/<id>/config.json` (user plugins: beside `package.json`) | Operator file, then first launch / Update from files / Configure |
| Plugin secrets | Gitignored `config.private.json` next to that public file (`*.example` in factory) | Gitignored file, then sealed `plugins.secrets` |
| Shop name, legal, footer | Admin + `footer-identity` / `page-legal` | Admin (that env’s DB) |
| Front Vite timings / UX flags (`VITE_*`) | Optional `tuucho-config/front.json` + `front.<env>.json` | Operator file (see `front.example.json`) |
| First-paint shell title / public favicon | `shellTitle` in front JSON; optional `tuucho-config/front-public/` | Operator files |
| Brand artwork (hero, about, guide, onboarding images) | Bootstrap `brandAssets`, set by a plugin’s `storefront.bootstrap` filter | Plugin (kernel demo images stay the default) |
| Stripe | Plugin Configure + `tuucho-config/plugins/tuucho-payment-stripe/` | Admin (secret store on that env) |
| Mondial Relay | Plugin Configure + shipping plugin JSON | Admin (secret store on that env) |
| Spy recipients | Admin → Spy e-mails (`tuucho-mail-spy`) | Admin |
| Gift / loyalty / cart rules | Those plugins’ Configure or Admin commerce screens | Admin |

**How to add an environment** (copy `dev`, do not invent files in the kernel)

```bash
# public + example only — creates kernel/<name>/ and appends environments.<name>
npm --prefix tuucho/kernel/back run config:env -- create preprod
cp tuucho-config/kernel/preprod/config.private.example.json \
   tuucho-config/kernel/preprod/config.private.json
# edit URLs/paths/CORS in tuucho-config/kernel/preprod/config.json
# fill a **new** database URL, JWT, PII, ops in the private file — never commit
# APP_TARGET=preprod  (or --env preprod on OPS CLIs)
npm --prefix tuucho/kernel/back run config:doctor
```

Do **not** copy another env’s private file onto this one. Same steps for any
name (`staging`, `prod`, …). There is no `README.todo` on this checkout.

Install from a tag: after first install, `npm install` only at the **repo root**
(npm workspaces, one lockfile). Do not `cd tuucho/kernel/front && npm install`.

Admin, Plugins, Scan is install (runs schema `up` when the plugin is on).
**Check for updates** then **Apply** walks every git tag between this shop and
the latest official tag (`MAJOR.MINOR.PATCH`, never `v0.0.2`, never `master`).
Plugins “Core” and Check current are `tuucho/tuucho-versioning.json` `kernel`
(updated with Apply under `tuucho/`). Latest is the newest official GitHub tag.
A checkout newer than that tag is ahead (no Apply). Matching tags: nothing to
update. Older local: walk every tag. `tuucho-versioning.lock.json` is gitignored
last-applied Apply state (setup / Apply write it locally), not displayed current.
Generate the catalog with `node tuucho/scripts/tuucho-versioning.mjs` before
tagging (reads `tuucho/factory-backup/root/package.json` version).
Shipped templates live under `tuucho/factory-backup/` (`root/`, `config/`,
`plugins/`). First install copies them to live shop trees; later:
`npm run config:migrate` for config steps. Live root scaffold, `tuucho-config/`,
and `src/plugins/` are gitignored shop-owned trees. Apply never overwrites them.
In this product repo, after editing those live trees, run `npm run factory-sync`
(or `node tuucho/scripts/factory-sync.mjs`) so factory backup matches
(`factory-sync:check` / `check:factory-sync` fails on drift).
Kernel Apply writes `tuucho/kernel`, `tuucho/plugin-sdk`,
`tuucho/factory-backup`, `tuucho/docs`, `tuucho/scripts`, `tuucho/sample`, and
the versioning catalog; `all` adds `tuucho/plugins`. Never shop root
`package.json`, `tuucho-config/`, or `src/plugins/`. A user plugin
with `tuucho.repo` / `branch` / `folder` (or npm `repository`) updates from that GitHub repo only. Disable unloads the plugin and keeps its tables.
Uninstall runs `down` and removes the row. Stripe keys and carrier credentials live in that plugin’s Admin Configure
(secret store), not kernel JSON.

Details: [tuucho/docs/plugins.md](tuucho/docs/plugins.md).

## Plugins shipped

| Plugin | Kind | Notes |
| --- | --- | --- |
| `tuucho-theme-default` | Theme | Tokens + customizer. Required. |
| `tuucho-payment-stripe` | Payment | Card, PayPal, Bancontact, Google Pay, Apple Pay. |
| `tuucho-shipping-home` | Shipping | Home address delivery (folder `shipping/home-delivery`). |
| `tuucho-shipping-mondial-relay` | Shipping | Point Relais pickup. |
| `tuucho-commerce-vouchers` | Commerce | Promo codes. Disable hides admin and checkout. |
| `tuucho-commerce-cart-rules` | Commerce | Thresholds and gifts. Disable hides admin and checkout. |
| `tuucho-docs-developer` | Docs | In-admin developer guide (Admin, Documentation). |
| `tuucho-seo-sitemap` / `tuucho-seo-robots` / `tuucho-seo-redirects` | SEO | Extra sitemap URLs, robots rules, and redirect apply. Hub: Settings → SEO. |

See [tuucho/docs/plugins.md](tuucho/docs/plugins.md) (same text as Admin, Documentation).
User storefront pages (not bundled): `src/plugins/home/main/page-home`, `src/plugins/about/page-about`, `src/plugins/demo/guides/page-guides` (size / shape / care), `src/plugins/legal/legal/page-legal` (legal notice, privacy, terms of use, terms of sale, footer only), `src/plugins/legal/accessibility/page-accessibility` (RGAA statement, footer only). Footer identity copy is `src/plugins/footer/identity/footer-identity`.

## Layout

Mobile-first bottom bar, burger menu, desktop nav: core chrome. The theme
skins them. Product axes default to shape / length / size: rename, hide, or
auto-hide when only one value exists. Tax mode defaults to `none` (no VAT
line), as a store setting.

## Layout on disk

```
tuucho/kernel/back     API: plugin host, shells, catalog, orders, users, stock, cart
tuucho/kernel/front    Shop chrome (admin nav from bootstrap, plugin UI chunks)
tuucho/plugins/        Bundled plugins grouped by kind (id starts with tuucho-; no extra tuucho/ segment)
src/plugins/           Shop / demo / zip upload (gitignored; first-install copy; id must not start with tuucho-)
tuucho/plugin-sdk/     @tuucho/plugin-sdk
tuucho/docs/           All project documentation (api, schema, command, cron, front, plugins.md)
tuucho/factory-backup/root/     Shipped shop-root scaffold (package.json, AGENTS, …), first install only
tuucho/factory-backup/config/   Shipped JSON templates, copied to tuucho-config/ on first install
tuucho/factory-backup/plugins/  Shipped shop examples, copied to src/plugins/ on first install
tuucho/factory-backup/migrations/ Optional config:migrate steps (publisher-owned; see .example.json)
tuucho-config/         Operator public + private JSON (survives Apply)
tuucho/sample/         Fictional catalog + courier JSON
tuucho/scripts/        pack scripts (dev, install, versioning, factory-sync)
output/                Generated artifacts (paths.outputDir; includes docker/.compose.env; gitignored)
.agents/               Live agent skills (from factory root; gitignored); AGENTS.md live at root
.prettierrc            Live formatter config (from factory root; gitignored)
```

Import aliases (live root `tsconfig.json` + `tuucho/kernel/front/importAliases.ts`):
`@kernel/front/*` and `@kernel/back/*` reach kernel sources, `@tuucho/plugin-sdk`
the SDK entry, `@shop/*` the repo `src/` tree, and `@plugins-bundled` /
`@plugins-user` the plugin globs.
