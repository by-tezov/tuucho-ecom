# tuucho-ecom as a loadable kernel

Read from the tree at `/home/tezov/Local/tuucho-ecom` (product version is `tuucho/tuucho-versioning.json` `kernel`, sourced from `tuucho/factory-backup/root/package.json`).

**Verdict:** this is a **loadable kernel** with a real plugin host (`loadPluginRuntime.ts` `import()`s each enabled `back/register.ts`). It is not a fully clean microkernel: some admin screens and `pluginBridges.ts` still special-case plugin ids. The living architecture plan is `.cursor/stores/self/docs/microkernel-architecture.md`.

## Layers

| Layer | Path | Role |
| --- | --- | --- |
| Kernel | `tuucho/kernel/` | Catalogue, cart, checkout, orders, accounts, plugin host, UI registry, **shells** for email, payment, courier, SEO. |
| SDK | `tuucho/plugin-sdk/` | `PluginRegisterApi`: hooks, HTTP mounts, payment/shipping register, `sendMail` / `sendTemplatedMail` / `enqueueMailJob`. |
| Bundled plugins | `tuucho/plugins/` | First-party shop features. Ids start with `tuucho-`. Set listed in `tuucho/plugins/manifest.json`. |
| User plugins | `src/plugins/` | Shop-owned zip uploads and demos (gitignored; first-install copy from `tuucho/factory-backup/plugins/`). Never overwritten by Tuucho Apply. |
| Factory backup | `tuucho/factory-backup/` | Shipped templates: `root/` → clone root scaffold (first install), `config/` → `tuucho-config/`, `plugins/` → `src/plugins/`, optional `migrations/kernel/` for `config:migrate`. |

## Shells

Plugins register into kernel shells. They do not own SMTP, Stripe settlement, or the SEO Settings hub.

- **Email:** `api.sendMail` / templates / `mail_jobs`. Bound by the host via `setMailSender`.
- **Payment:** `registerPaymentGateway`.
- **Courier:** `registerShippingMethod`.
- **SEO:** engine lists kernel pages, catalogue, and enabled page-plugin routes. Extra filters `seo.sitemap.entries` / `seo.robots.rules`. Redirects apply is `tuucho-seo-redirects`.

## Contact

Guest form + account chat + admin inbox = **`tuucho-contact`**. Tables stay kernel-named. Product requests stay `tuucho-commerce-product-requests`.

## Install / update

One public repo, one tag (`MAJOR.MINOR.PATCH`, no `v` prefix), `tuucho/tuucho-versioning.json` on every tag (historical tags still use `release.json` / `tuucho-release.json`; Check/Apply fall back). Product version ships as `tuucho/factory-backup/root/package.json` and the versioning catalog. First install: `node tuucho/scripts/install.mjs` (copies factory root / config / plugins once). Shop owners clone a tag. Admin Core **Check for updates** / **Apply** compares the kernel (`tuucho/tuucho-versioning.json` `kernel`) to the latest official GitHub tag and walks every intermediate tag when local is behind. Admin Plugins checks plugin updates only. Local ahead of the published tag has no Apply. `tuucho-versioning.lock.json` records last-applied Apply state (gitignored; missing on a fresh clone is fine until setup or Apply writes it). Zip install still writes `src/plugins/` (or `tuucho/plugins/` for `tuucho-*` ids). Tuucho Apply never writes shop root scaffold, `src/plugins/`, or `tuucho-config/`. Kernel Apply writes `tuucho/kernel`, `tuucho/plugin-sdk`, `tuucho/factory-backup`, `tuucho/docs`, `tuucho/scripts`, `tuucho/sample`, and the versioning catalog; `all` adds `tuucho/plugins`. In this product repo, after editing live root scaffold, `tuucho-config/`, or `src/plugins/`, run `npm run factory-sync`.

## Stale claims (do not reuse)

Older copies of this file said there was no plugin JS runtime and no `addFilter` callers. That described a pre-split tree. Ignore it.
