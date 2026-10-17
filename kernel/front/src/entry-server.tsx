import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router';
import { LanguageProvider } from './assets/i18n';
import { en } from './assets/i18n/strings.en';
import type { Lang, Strings } from './assets/i18n/types';
import { StorefrontBootstrapProvider } from './plugins/StorefrontBootstrap';
import { assembleDictionary } from './plugins/localeCatalog';
import { shopConfig, legalConfig } from './config/env';
import { AuthProvider } from './state/AuthContext';
import { CartProvider } from './hooks/CartProvider';
import { GiftReceiverProvider } from './hooks/useGiftReceiver';
import { OrdersProvider } from './hooks/useOrders';
import { GalleryFavoritesProvider } from './hooks/useGalleryFavorites';
import { ThemeProvider } from './theme/ThemeProvider';
import { AppErrorBoundary } from './components/app/AppErrorBoundary';
import { PRERENDERED_PATHS } from './config/prerenderedPaths';
import {
  DEFAULT_LANG,
  ENABLED_LANGUAGES,
  OG_LOCALES,
  localizedPath,
  localizedSiblings,
  orderedLanguages,
  stripLangPrefix,
} from './config/i18nRoutes';
import {
  PrerenderPayloadProvider,
  PRERENDER_PAYLOAD_ELEMENT_ID,
  type PrerenderPayload,
} from './state/PrerenderPayload';
import { staticPageJsonLd } from './utils/pageSeo';
import { seoKeywords } from './utils/seoKeywords';
import App from './App.tsx';

/** Every dictionary, keyed by language — safe to import eagerly here (this
 * file is Node-only build tooling, never shipped to the browser, so none of
 * the bundle-size concern that keeps them lazy-loaded client-side applies —
 * see assets/i18n/index.ts's own comment on that). */
const DICTIONARIES: Record<Lang, Strings> = {
  en: assembleDictionary(en, 'en', 'all'),
  fr: assembleDictionary(en, 'fr', 'all'),
};

/**
 * Build-time entry for scripts/prerender.mjs (never shipped to the browser).
 * Renders each public route to static HTML in every enabled language and
 * produces the matching <head> tags, so crawlers — including the social ones
 * that never execute JavaScript — see the real content and metadata.
 */

export interface PrerenderPage {
  /** route path, e.g. '/fr/gallery' or '/en/gallery' */
  path: string;
  /** output filename inside dist/, e.g. 'fr/gallery.html' or 'it/gallery.html' */
  file: string;
  title: string;
  description: string;
  /** The language this exact page was built in. */
  lang: Lang;
  /** Sitemap `<lastmod>`, when the page has a date of its own. Nothing sets
   * this today — every page falls back to the build date — but the sitemap
   * writer honours it, so a per-set modification date can be threaded
   * through here if the feed ever exposes one. */
  lastmod?: string;
  /** Sitemap hints — see scripts/prerender.mjs. */
  changefreq?: string;
  priority?: string;
}

/** file/title/description for each of PRERENDERED_PATHS in language `t` —
 * that list (not this one) is the source of truth for which paths get
 * prerendered, since main.tsx also depends on it staying accurate. Keyed by
 * path so the two can't silently drift apart; the `pages` export below still
 * fails loudly (missing property) if a path here doesn't have an entry. */
function pageMetaFor(t: Strings): Record<string, { file: string; title: string; description: string }> {
  return {
    // `/` is the entry splash (client navigates to /home or /gallery). Accueil
    // content lives at `/home` for SEO and deliberate "Accueil" navigation.
    '/': { file: 'index.html', title: t.seo.homeTitle, description: t.seo.homeDesc },
    '/home': { file: 'home.html', title: t.seo.homeTitle, description: t.seo.homeDesc },
    '/gallery': { file: 'gallery.html', title: t.seo.galleryTitle, description: t.seo.galleryDesc },
    '/about': { file: 'about.html', title: t.seo.aboutTitle, description: t.seo.aboutDesc },
    '/contact': { file: 'contact.html', title: t.seo.contactTitle, description: t.seo.contactDesc },
    '/capsules': { file: 'capsules.html', title: t.seo.capsulesTitle, description: t.seo.capsulesDesc },
    '/pose': { file: 'pose.html', title: t.seo.poseTitle, description: t.seo.poseDesc },
    '/sizes': { file: 'sizes.html', title: t.seo.guideTitle, description: t.seo.guideDesc },
    '/legal': { file: 'legal.html', title: t.seo.legalTitle, description: t.seo.legalDesc },
    '/privacy': { file: 'privacy.html', title: t.seo.privacyTitle, description: t.seo.privacyDesc },
    '/terms': { file: 'terms.html', title: t.seo.termsTitle, description: t.seo.termsDesc },
    '/sales-terms': {
      file: 'sales-terms.html',
      title: t.seo.salesTermsTitle,
      description: t.seo.salesTermsDesc,
    },
    '/sitemap': { file: 'sitemap.html', title: t.seo.sitemapTitle, description: t.seo.sitemapDesc },
  };
}

/** Sitemap weighting for the static pages. The catalogue and the home page
 * are what should be crawled often; the legal pages essentially never
 * change and shouldn't compete for crawl budget with the catalogue. */
const PAGE_SITEMAP_HINTS: Record<string, { changefreq: string; priority: string }> = {
  '/': { changefreq: 'weekly', priority: '0.8' },
  '/home': { changefreq: 'weekly', priority: '1.0' },
  '/gallery': { changefreq: 'daily', priority: '0.9' },
  '/capsules': { changefreq: 'monthly', priority: '0.7' },
  '/pose': { changefreq: 'monthly', priority: '0.7' },
  '/sizes': { changefreq: 'monthly', priority: '0.7' },
  '/about': { changefreq: 'monthly', priority: '0.6' },
  '/contact': { changefreq: 'monthly', priority: '0.5' },
};
const LEGAL_SITEMAP_HINT = { changefreq: 'yearly', priority: '0.2' };

/** One page per (path, language) pair. Every enabled language, including
 * French, is written under `xx/*.html` (`fr/gallery.html`, `en/gallery.html`).
 * Root `index.html` is a separate splash/SPA entry, not the French canonical. */
const localizedPages: PrerenderPage[] = PRERENDERED_PATHS.filter((path) => path !== '/').flatMap((path) => {
  const hint = PAGE_SITEMAP_HINTS[path] ?? LEGAL_SITEMAP_HINT;
  return orderedLanguages().map((lang) => {
    const meta = pageMetaFor(DICTIONARIES[lang])[path];
    if (!meta)
      throw new Error(`entry-server: PRERENDERED_PATHS has "${path}" but pageMetaFor has no entry for it`);
    return {
      path: localizedPath(path, lang),
      file: `${lang}/${meta.file}`,
      title: meta.title,
      description: meta.description,
      lang,
      ...hint,
    };
  });
});

const rootSplashMeta = pageMetaFor(DICTIONARIES[DEFAULT_LANG])['/'];
if (!rootSplashMeta) {
  throw new Error('entry-server: pageMetaFor is missing the "/" splash entry');
}
const rootSplash: PrerenderPage = {
  path: '/',
  file: 'index.html',
  title: rootSplashMeta.title,
  description: rootSplashMeta.description,
  lang: DEFAULT_LANG,
};

export const pages: PrerenderPage[] = [rootSplash, ...localizedPages];

/**
 * Public pages written as a file of their own with an indexable head but an
 * empty body: the same document for every visitor, but a lazy route, which
 * prerendering would have to make eager (hydration) at the cost of the entry
 * chunk. Without a file, the URL fell through to the SPA fallback, which is
 * the `/` splash and carries `noindex`, so the page could never be indexed
 * although the sitemap listed it. No payload is embedded, so main.tsx takes
 * its createRoot branch exactly as for any SPA-fallback route.
 */
export const headOnlyPages: PrerenderPage[] = orderedLanguages().map((lang) => {
  const t = DICTIONARIES[lang];
  return {
    path: localizedPath('/gift', lang),
    file: `${lang}/gift.html`,
    title: t.gift.seoCreateTitle,
    description: t.gift.seoCreateDesc,
    lang,
    changefreq: 'monthly',
    priority: '0.6',
  };
});

/** Nothing here ever renders a product page. Every per-set surface is
 * dynamic by rule: a real visitor gets the SPA shell for `/creations/<slug>`
 * and ProductPage fetches the set from kernel/back on mount, while a
 * link-preview bot is redirected by public/.htaccess to that backend's
 * `/gallery/set/:uid/preview`, which builds the Open Graph tags from the
 * database on every request. A build-time snapshot would be stale the moment
 * the catalogue changed, and would make the frontend build depend on a live
 * API — so this file must stay catalogue-free. */

export { shopConfig };
export { ENABLED_LANGUAGES, localizedSiblings };

/** Only a real `--mode prod` build is allowed to tell crawlers to index it —
 * dev/preprod get `noindex` and no canonical (see renderHead below) and
 * scripts/prerender.mjs uses this same flag to keep them out of
 * robots.txt/sitemap.xml too. Same __APP_TARGET__ Vite already injects for
 * Header.tsx's dev/preprod tint (see vite.config.ts's `define`). */
export const isProd = __APP_TARGET__ === 'prod';

/** Shared by render() and renderPayloadScript() so the two can never embed a
 * different payload than what was actually rendered. `lang`/`dict` are only
 * included for a non-default-language page — see PrerenderPayload's doc
 * comment for why the default language doesn't need them (it's the one
 * eagerly-bundled dictionary, so there's no lazy-chunk flash to avoid). */
function buildPayload(page: PrerenderPage): PrerenderPayload {
  return {
    path: page.path,
    ...(page.lang !== DEFAULT_LANG && { lang: page.lang, dict: DICTIONARIES[page.lang] }),
  };
}

export function render(page: PrerenderPage): string {
  const payload = buildPayload(page);
  return renderToString(
    <StrictMode>
      <StaticRouter
        {...(shopConfig.routerBasename ? { basename: shopConfig.routerBasename } : {})}
        location={page.path}
      >
        <PrerenderPayloadProvider value={payload}>
          <StorefrontBootstrapProvider>
          <LanguageProvider>
            <AppErrorBoundary>
              <AuthProvider>
                <ThemeProvider>
                  <OrdersProvider>
                    <GiftReceiverProvider>
                      <CartProvider>
                        <GalleryFavoritesProvider>
                          <App />
                        </GalleryFavoritesProvider>
                      </CartProvider>
                    </GiftReceiverProvider>
                  </OrdersProvider>
                </ThemeProvider>
              </AuthProvider>
            </AppErrorBoundary>
          </LanguageProvider>
          </StorefrontBootstrapProvider>
        </PrerenderPayloadProvider>
      </StaticRouter>
    </StrictMode>,
  );
}

/** The build-time payload, embedded in the page so hydration renders the
 * exact same tree the prerender did (see state/PrerenderPayload.tsx).
 * `<` is escaped so a set's own text can never close the script early. */
export function renderPayloadScript(page: PrerenderPage): string {
  const payload = buildPayload(page);
  const json = JSON.stringify(payload).replaceAll('<', '\\u003c');
  return `<script id="${PRERENDER_PAYLOAD_ELEMENT_ID}" type="application/json">${json}</script>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
}

export function renderTitle(page: PrerenderPage): string {
  return `<title>${escapeAttr(`${page.title} · ${shopConfig.shopName}`)}</title>`;
}

/** Postal code + town, split out of the single-line VITE_LEGAL_ADDRESS
 * ("41800 Montoir-sur-le-Loir") that the legal-notice page prints verbatim.
 * schema.org wants them as separate properties; anything that doesn't match
 * that shape is passed through as the street line rather than guessed at. */
function postalAddress(): Record<string, string> | undefined {
  const raw = legalConfig.address.trim();
  if (!raw) return undefined;
  const matched = /^(\d{5})\s+(.+)$/.exec(raw);
  if (matched?.[1] && matched[2]) {
    return {
      '@type': 'PostalAddress',
      addressCountry: 'FR',
      postalCode: matched[1],
      addressLocality: matched[2],
    };
  }
  return { '@type': 'PostalAddress', addressCountry: 'FR', streetAddress: raw };
}

/** The site-wide graph: who the shop is, and the site itself. Emitted on
 * every page — product pages add their own Product node on top (see
 * utils/productSeo.ts).
 *
 * Deliberately no `aggregateRating`: the home page shows up to three real
 * Vinted reviews hand-picked in the administration (GET /reviews), which is
 * a curated selection, not the shop's full review record. Google's
 * structured-data policy treats self-serving rating markup on a curated
 * subset as spam, and a manual action costs far more than the stars are
 * worth.
 */
function siteJsonLd(image: string, lang: Lang): Record<string, unknown> {
  const sameAs = Object.values(shopConfig.platformUrls).filter((href) => href.startsWith('http'));
  const address = postalAddress();
  const t = DICTIONARIES[lang];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'OnlineStore',
        '@id': `${shopConfig.siteUrl}/#shop`,
        name: shopConfig.shopName,
        // The spellings people type that are not the exact shop name, above
        // all the plural "Shop". Without it a search engine has no
        // way to tie that query to this entity, because the singular "Nail"
        // is the only form that appears in the French title and headings.
        ...(shopConfig.brandAliases.length > 0 && { alternateName: shopConfig.brandAliases }),
        url: `${shopConfig.siteUrl}/`,
        email: shopConfig.contactEmail,
        image,
        logo: image,
        areaServed: { '@type': 'Country', name: 'France' },
        currenciesAccepted: 'EUR',
        description: t.seo.homeDesc,
        keywords: seoKeywords(lang),
        ...(legalConfig.owner && { founder: { '@type': 'Person', name: legalConfig.owner } }),
        ...(legalConfig.siren && {
          identifier: {
            '@type': 'PropertyValue',
            propertyID: 'SIREN',
            value: legalConfig.siren.replace(/\s+/g, ''),
          },
        }),
        ...(address && { address }),
        ...(legalConfig.phone && { telephone: legalConfig.phone }),
        ...(sameAs.length > 0 && { sameAs }),
      },
      {
        '@type': 'WebSite',
        '@id': `${shopConfig.siteUrl}/#website`,
        url: `${shopConfig.siteUrl}/`,
        name: shopConfig.shopName,
        ...(shopConfig.brandAliases.length > 0 && { alternateName: shopConfig.brandAliases }),
        inLanguage: OG_LOCALES[lang].replace('_', '-'),
        publisher: { '@id': `${shopConfig.siteUrl}/#shop` },
      },
    ],
  };
}

function scriptTag(data: Record<string, unknown>): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
}

/** The tag block substituted for the `<!--app-head-->` placeholder in index.html. */
export function renderHead(page: PrerenderPage): string {
  const url = `${shopConfig.siteUrl}${page.path === '/' ? '/' : page.path}`;
  const siteImage = `${shopConfig.siteUrl}/og-image.jpg`;
  const image = siteImage;
  const t = DICTIONARIES[page.lang];
  const fullTitle = escapeAttr(`${page.title} · ${shopConfig.shopName}`);
  const description = escapeAttr(page.description);
  const imageAlt = escapeAttr(t.hero.imgAlt);
  const siblings = localizedSiblings(page.path);
  const indexable = isProd && page.path !== '/';

  return [
    `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}" />`,
    `<meta name="description" content="${description}" />`,
    // A canonical/hreflang set on a noindex page is contradictory — the URL
    // is arbitrary (same rule as Seo.tsx's own noindex handling). Root `/`
    // is the human splash / language negotiator, not a French canonical.
    ...(indexable ? [`<link rel="canonical" href="${url}" />`] : []),
    ...(indexable
      ? siblings.map(
          ({ lang, href }) =>
            `<link rel="alternate" hreflang="${lang}" href="${shopConfig.siteUrl}${href}" />`,
        )
      : []),
    ...(indexable
      ? [
          `<link rel="alternate" hreflang="x-default" href="${shopConfig.siteUrl}${siblings.find((s) => s.lang === DEFAULT_LANG)!.href}" />`,
        ]
      : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(shopConfig.shopName)}" />`,
    `<meta property="og:title" content="${fullTitle}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:locale" content="${OG_LOCALES[page.lang]}" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    // The shop banner is a known 1200x630.
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${imageAlt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${fullTitle}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${escapeAttr(image)}" />`,
    ...(indexable
      ? [
          scriptTag(siteJsonLd(siteImage, page.lang)),
          ...(() => {
            const pageGraph = staticPageJsonLd(stripLangPrefix(page.path).rest, t, page.lang);
            return pageGraph ? [scriptTag(pageGraph)] : [];
          })(),
        ]
      : []),
    // Joined with nothing rather than an indented newline: every entry is a
    // self-closing meta/link or a script tag, all inside <head>, where
    // whitespace between tags renders nothing and only costs bytes. On a page
    // with all seven hreflang siblings that is around 40 lines of indentation.
  ].join('');
}
