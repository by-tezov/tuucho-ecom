---
name: tuucho-plugin-seo
description: >-
  Extends tuucho-ecom kernel SEO (sitemap URLs, robots rules, meta, JSON-LD,
  redirects) when a plugin adds a public URL or crawler-facing document.
  Use when a page, collection, or extra feed must participate in SEO.
  Never edits the kernel SEO engine or Settings → SEO hub.
---

# Extend kernel SEO

## Invariants

- Do not modify `kernel/`, `@tuucho/plugin-sdk` contracts, or kernel migrations.
- If the needed opening does not exist, stop. Tell the user. Do not invent a kernel patch from this skill.
- Match existing bundled SEO plugins (`tuucho-seo-sitemap`, `tuucho-seo-robots`, `tuucho-seo-redirects`).
- Current branch only; no extra git branch; no PR unless asked.
- Do **not** add Admin pages that only print `/sitemap.xml` or robots.txt. Operators use **Settings → SEO**.

## Who owns what

Kernel assembles canonicals, default meta, `/sitemap.xml`, shop robots
(`GET /storefront/robots.txt`), the `seo_redirects` table, and the hub.
API `/robots.txt` is the JSON-host crawler policy, never shop robots.
Public indexing is on only when `APP_TARGET=prod`. Filters still register on
dev/preprod so Settings → SEO can preview extras; crawlers get `Disallow: /`
and `noindex, nofollow` until prod.

| Plugin | What enabling it does |
| --- | --- |
| `tuucho-seo-sitemap` | Appends enabled page-plugin `route`s to the sitemap |
| `tuucho-seo-robots` | Appends Disallow rules for private shop paths |
| `tuucho-seo-redirects` | Applies stored rows and `seo.redirects.rules` |

## Register extras

```ts
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';

api.addFilter(CORE_OPENING_FILTERS.seoSitemap, (entries) => [
  ...entries,
  { loc: `${shopOrigin}/your-path`, lastmod: '2026-10-19', source: api.pluginId },
]);

api.addFilter(CORE_OPENING_FILTERS.seoRobots, (rules) => [
  ...rules,
  { directive: 'Disallow', value: '/your-private' },
]);

api.addFilter(CORE_OPENING_FILTERS.seoMeta, (meta) => ({
  ...meta,
  title: meta.title ?? 'Your page',
}));

api.addFilter(CORE_OPENING_FILTERS.seoJsonLd, (graph) => [...graph, { '@type': 'FAQPage' }]);

api.addFilter(CORE_OPENING_FILTERS.seoRedirects, (rules) => [
  ...rules,
  { fromPath: '/old', toPath: '/your-path', status: 301, source: api.pluginId },
]);
```

`seo.sitemap.productRows` is the catalogue PHP relay only (`/sitemap-products.xml`). Do not use it for ordinary page URLs.

A **page plugin** with `plugin.json` `route` is already listed while `tuucho-seo-sitemap` is on. Still register `seo.sitemap.entries` when the URL is not that route (`demo-page-guides` does this for `/pose` and `/capsules`; also paginated collections, extra feeds, locale-only paths).

Skip filters when the plugin should be inert if it were off: register only from `back/register.ts` (unloaded when disabled).

## Follow-up

Public page + menu → `tuucho-plugin-page`. Admin CRUD → `tuucho-plugin-admin` (never Configure-as-SEO). Tables → `tuucho-plugin-schema`. Other filters → `tuucho-plugin-opening`.
