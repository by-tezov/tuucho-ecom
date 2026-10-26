# SEO engine

Checkout: `/home/tezov/Local/tuucho-ecom` on `dev/refactor-split`. Git is read-only for this worker.

Chosen without waiting: **kernel owns assembly, public endpoints, redirects storage, and Settings → SEO**. Plugins contribute URLs, robots rules, meta, JSON-LD, and extra redirects. They do not own dead-end “view this URL” admin pages.

Public indexing is **off unless `APP_TARGET` is exactly `prod`**. `dev` and `preprod` must not look like production to crawlers. `NODE_ENV` (cPanel Application Mode) must not flip this.

## Environment policy

Detection: `config.target` from `APP_TARGET` (`dev` | `preprod` | `prod`). Helper: `isPublicSeoTarget(target)` in `kernel/back/src/config/publicSeo.ts`. Front prerender/Seo use the same rule via `__APP_TARGET__ === 'prod'`.

| Target | Public indexing | Shop robots | `/sitemap.xml` | Page meta | JSON-LD | Redirects |
| --- | --- | --- | --- | --- | --- | --- |
| `prod` | on | Allow + plugin Disallow + Sitemap | published | `index, follow` (unless the page itself is noindex) | emitted | apply while Redirects plugin is on |
| `dev`, `preprod`, anything else | off | `User-agent: *` / `Disallow: /` (no Sitemap line) | 404 | `noindex, nofollow` | omitted | still apply so staff can test |

Default is off: only the string `prod` turns indexing on. A misspelled `production` is off.

Settings → SEO Overview shows `APP_TARGET` and whether public indexing is on, so staff can see why a preprod shop is not in Google.

## Shipped

| Owner | What |
| --- | --- |
| Kernel | Canonicals and default meta (`composeSeoMeta`, `composeJsonLdGraph`). Sitemap assembly (kernel pages + catalogue + `seo.sitemap.entries`). Shop robots assembly (default Allow + Sitemap + `seo.robots.rules` on prod; Disallow all otherwise). Table `seo_redirects`, hub CRUD, apply when Redirects is on. Settings → SEO at `/admin/seo`. Public `GET /sitemap.xml` (prod only) and `GET /storefront/robots.txt`. API `/robots.txt` stays `crawlerPolicy`. |
| `tuucho-seo-sitemap` | Extra sitemap URLs: enabled page-plugin `route`s. |
| `tuucho-seo-robots` | Extra robots directives (private shop paths), used on prod. |
| `tuucho-seo-redirects` | Feature gate for applying stored + plugin redirect rules. |
| `page-guides` | Extra sitemap URLs `/pose` and `/capsules` (not the `/sizes` route). Demo extension. |
| Any plugin | `seo.meta`, `seo.jsonld.graph`, `seo.sitemap.entries`, `seo.robots.rules`, `seo.redirects.rules`. |

Disable a contributor and its extras drop out. Kernel product/page URLs and the hub stay. On non-prod, extras still register so the hub can preview; crawlers do not see them.

Kernel sitemap paths (`KERNEL_SITEMAP_PATHS`): `/`, `/gallery`, `/privacy`, `/terms`, `/sales-terms`, `/sitemap`. Page-plugin `route`s (including `/accessibility` from `page-accessibility`) and other public plugin paths are not listed here.

## Extension API

SDK `CORE_OPENING_FILTERS` plus one kernel-only product-row filter.

| Filter | Payload | When |
| --- | --- | --- |
| `seo.meta` | page meta object | Kernel composes document meta (forced `noindex, nofollow` outside prod) |
| `seo.jsonld.graph` | JSON-LD graph array | Kernel composes structured data (empty outside prod) |
| `seo.sitemap.entries` | `{ loc, lastmod?, changefreq?, priority?, source? }[]` | Kernel builds `/sitemap.xml` on prod and the hub Sitemap tab always |
| `seo.robots.rules` | `{ userAgent?: string, directive: 'Allow' \| 'Disallow' \| 'Sitemap', value: string }[]` | Kernel builds shop robots on prod |
| `seo.redirects.rules` | `{ fromPath, toPath, status: 301 \| 410, source? }[]` | Applied with the table when Redirects is on |
| `seo.sitemap.productRows` | `{ path, lastmod }[]` | Existing catalogue relay `/sitemap-products.xml` only |

Deduped by `loc` / `fromPath`. Shop loc values use the shop origin (`frontendBaseUrl`).

## Settings → SEO

Kernel item, Settings group, permission `preferences`, always listed. Route `/admin/seo?tab=`.

Tabs:

1. **Overview** — environment (prod vs not), which SEO plugins are on, what kernel still does if they are off.
2. **Sitemap** — assembled URL list (source column), count, open `/sitemap.xml`. Banner when not published.
3. **Robots** — live shop robots text, open `GET /storefront/robots.txt`. API `/robots.txt` is a different host.
4. **Redirects** — table upsert and delete. Banner when Redirects is off.

HTTP: `GET /admin/seo`, `POST /admin/seo/redirects`, `DELETE /admin/seo/redirects/:id`.

## Skill

`.cursor/skills/tuucho-plugin-seo/SKILL.md`

## Later workstreams (not this plan)

In-app Documentation article **Extend SEO**, and the kernel UI component registry, are separate plans.
