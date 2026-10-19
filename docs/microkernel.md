# tuucho-ecom as a loadable kernel

Read from the tree at `/home/tezov/Local/tuucho-ecom` (product version is root `package.json`).

**Verdict:** this is a **loadable kernel** with a real plugin host (`loadPluginRuntime.ts` `import()`s each enabled `back/register.ts`). It is not a fully clean microkernel: some admin screens and `pluginBridges.ts` still special-case plugin ids. The living architecture plan is `.cursor/stores/self/docs/microkernel-architecture.md`.

## Layers

| Layer | Path | Role |
| --- | --- | --- |
| Kernel | `kernel/` | Catalogue, cart, checkout, orders, accounts, plugin host, UI registry, **shells** for email, payment, courier, SEO. |
| SDK | `plugin-sdk/` | `PluginRegisterApi`: hooks, HTTP mounts, payment/shipping register, `sendMail` / `sendTemplatedMail` / `enqueueMailJob`. |
| Bundled plugins | `plugins/tuucho/` | First-party shop features. Ids start with `tuucho-`. Set listed in `plugins/tuucho/manifest.json`. |
| User plugins | `plugins/user/` | Shop-owned zip uploads and demos. Never overwrite `plugins/tuucho`. |

## Shells

Plugins register into kernel shells. They do not own SMTP, Stripe settlement, or the SEO Settings hub.

- **Email:** `api.sendMail` / templates / `mail_jobs`. Bound by the host via `setMailSender`.
- **Payment:** `registerPaymentGateway`.
- **Courier:** `registerShippingMethod`.
- **SEO:** engine lists kernel pages, catalogue, and enabled page-plugin routes. Extra filters `seo.sitemap.entries` / `seo.robots.rules`. Redirects apply is `tuucho-seo-redirects`.

## Contact

Guest form + account chat + admin inbox = **`tuucho-contact`**. Tables stay kernel-named. Product requests stay `tuucho-commerce-product-requests`.

## Install / update

One public repo, one tag (`MAJOR.MINOR.PATCH`, no `v` prefix), `release.json` on every tag. In this product repo the version Te publishes is root `package.json`. Shop owners clone a tag, then Admin, Plugins **Check for updates** / **Apply** walks every intermediate tag via `shop-release.json` vs tag `release.json`. A deployed shop cannot claim a kernel by editing `package.json`. Zip install still writes `plugins/user/` (or `plugins/tuucho/` for `tuucho-*` ids). Tuucho Apply never writes `plugins/user/` or the shop root `package.json`.

## Stale claims (do not reuse)

Older copies of this file said there was no plugin JS runtime and no `addFilter` callers. That described a pre-split tree. Ignore it.
