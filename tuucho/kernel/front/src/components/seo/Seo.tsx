import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { shopConfig } from '../../config/env';
import {
  BRAND_ASSET_DEFAULTS,
  resolveBrandAsset,
  useBrandAssets,
} from '../../plugins/BrandAssetsContext';
import { staticPageJsonLd } from '../../utils/pageSeo';
import { languageMeta } from '../../assets/i18n/languages';
import { DEFAULT_LANG, localizedPath, localizedSiblings } from '../../config/i18nRoutes';

interface SeoProps {
  title: string;
  /** Used verbatim as the `<title>`, instead of `title` plus the shop name.
   * Product pages compose their own (set name, product term, shape) and have
   * no room left for the full brand, so they shorten it themselves. */
  fullTitle?: string;
  description: string;
  /** route path, e.g. '/home', '/gallery', '/sizes' */
  path: string;
  /** Unprefixed path of this page's canonical URL, for a page that answers
   * under more than one: a product page also resolves its older
   * `/creations/<title>-<uid>` links but is canonical at `/creations/<uid>`,
   * the URL the SSR relay and the product sitemap declare. Defaults to the
   * URL the page is open at. */
  canonicalPath?: string;
  /** for pages that must stay out of search results (404) */
  noindex?: boolean;
  /** Page-specific structured data (product pages pass a Product + Offer +
   * BreadcrumbList graph). Replaces any previous page's block on
   * client-side navigation rather than accumulating one per visited route.
   * The site-wide OnlineStore block from index.html is left alone. */
  jsonLd?: Record<string, unknown>;
}

/** Marks the one <script type="application/ld+json"> this component owns, so
 * navigating between pages swaps it instead of stacking graphs. */
const PAGE_JSON_LD_ATTRIBUTE = 'data-seo-page';

function upsertJsonLd(data: Record<string, unknown> | undefined): void {
  const existing = document.head.querySelector(`script[${PAGE_JSON_LD_ATTRIBUTE}]`);
  if (!data) {
    existing?.remove();
    return;
  }
  const element = existing ?? document.createElement('script');
  if (!existing) {
    element.setAttribute('type', 'application/ld+json');
    element.setAttribute(PAGE_JSON_LD_ATTRIBUTE, '');
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(data);
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function removeLink(rel: string): void {
  document.head.querySelector(`link[rel="${rel}"]`)?.remove();
}

/** Marks the hreflang `<link>` elements this component owns, so navigating
 * between pages replaces the whole set instead of accumulating one per
 * visited route. */
const HREFLANG_ATTRIBUTE = 'data-seo-hreflang';

function upsertHreflangLinks(siblings: { lang: string; href: string }[]): void {
  document.head.querySelectorAll(`link[${HREFLANG_ATTRIBUTE}]`).forEach((el) => el.remove());
  const entries = [
    ...siblings,
    { lang: 'x-default', href: siblings.find((s) => s.lang === DEFAULT_LANG)!.href },
  ];
  for (const { lang, href } of entries) {
    const el = document.createElement('link');
    el.setAttribute('rel', 'alternate');
    el.setAttribute('hreflang', lang);
    el.setAttribute('href', `${shopConfig.siteUrl}${href}`);
    el.setAttribute(HREFLANG_ATTRIBUTE, '');
    document.head.appendChild(el);
  }
}

function removeHreflangLinks(): void {
  document.head.querySelectorAll(`link[${HREFLANG_ATTRIBUTE}]`).forEach((el) => el.remove());
}

/** Only a real --mode prod build is allowed to end up "index, follow" — see
 * entry-server.tsx's isProd, which drives the same rule for the prerendered
 * HTML crawlers see before this ever runs. Without this, a preprod build
 * would prerender noindex correctly but then flip back to "index, follow"
 * the moment this effect runs on hydration. */
const isProd = __APP_TARGET__ === 'prod';

/** Overrides the static defaults from index.html with per-page title/description/canonical/OG tags. */
export function Seo({
  title,
  fullTitle: exactTitle,
  description,
  path,
  canonicalPath,
  noindex = false,
  jsonLd,
}: SeoProps) {
  const { lang, t } = useLang();
  const location = useLocation();
  const brandAssets = useBrandAssets();
  // Product pages pass their own graph; every other route gets whatever
  // utils/pageSeo.ts defines for its path (FAQ on the guides, CollectionPage
  // on the gallery, …), which is the same block the prerenderer emits.
  // `path` (unprefixed, e.g. "/sizes") is this page's identity regardless of
  // which locale it's reached under — see localizedSiblings for the actual
  // URL, which does need the real (possibly locale-prefixed) location.
  const effectiveJsonLd = jsonLd ?? staticPageJsonLd(path, t, lang);
  // Structured data is a plain object rebuilt on every render; serializing it
  // here keeps the effect from rewriting the <script> on each one.
  const jsonLdKey = effectiveJsonLd ? JSON.stringify(effectiveJsonLd) : '';

  useEffect(() => {
    const fullTitle = exactTitle ?? `${title} · ${shopConfig.shopName}`;
    const canonicalPathname = canonicalPath ? localizedPath(canonicalPath, lang) : location.pathname;
    const url = `${shopConfig.siteUrl}${canonicalPathname}`;
    const effectiveNoindex = noindex || !isProd;
    const faviconHref = resolveBrandAsset(brandAssets, 'favicon', BRAND_ASSET_DEFAULTS.favicon);
    const ogImageRaw = resolveBrandAsset(brandAssets, 'ogImage', BRAND_ASSET_DEFAULTS.ogImage);
    const ogImage = /^https?:\/\//i.test(ogImageRaw)
      ? ogImageRaw
      : `${shopConfig.siteUrl}${ogImageRaw.startsWith('/') ? '' : '/'}${ogImageRaw}`;

    document.title = fullTitle;
    upsertMeta('name', 'robots', effectiveNoindex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('name', 'description', description);
    upsertLink('icon', faviconHref);
    // A canonical/hreflang set on a noindex page is contradictory — the URL
    // is arbitrary.
    if (effectiveNoindex) {
      removeLink('canonical');
      removeHreflangLinks();
    } else {
      upsertLink('canonical', url);
      upsertHreflangLinks(localizedSiblings(canonicalPathname));
    }
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', url);
    upsertMeta('property', 'og:locale', languageMeta(lang).ogLocale);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);
    // A noindex page's structured data can only mislead — it describes a
    // page that is explicitly not meant to appear in results.
    upsertJsonLd(
      effectiveNoindex
        ? undefined
        : jsonLdKey
          ? (JSON.parse(jsonLdKey) as Record<string, unknown>)
          : undefined,
    );
  }, [
    title,
    exactTitle,
    description,
    path,
    canonicalPath,
    location.pathname,
    lang,
    noindex,
    jsonLdKey,
    brandAssets,
  ]);

  return null;
}
