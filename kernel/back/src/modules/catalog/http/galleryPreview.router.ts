import { Router, type Request, type Response } from 'express';
import { config } from '../../../config/env.js';
import { isPublicSeoTarget, PRIVATE_SEO_ROBOTS, PUBLIC_SEO_ROBOTS } from '../../../config/publicSeo.js';
import { pool } from '../../../db/pool.js';
import { getProductByUid } from '../application/products.js';
import { listPublicProductUidsForSitemap } from '../application/productSitemap.js';
import {
  escapeHtml,
  firstPhotoUrl,
  itemOptionKey,
  itemPagePath,
  localizedFrontendPath,
  productJsonLd,
  setPagePath,
} from '../application/seoDocument.js';
import { productSeoDescription, productSeoTitle } from '../domain/productSeoCopy.js';
import { defaultCopyContext } from '../application/productVariants.js';
import { isLanguage, LANGUAGES, requestLanguage, type Language } from '../../../utils/language.js';
import type { GalleryItem } from '../../../types.js';
import {
  isGalleryItemPubliclyAccessible,
  outOfStockProductsEnabled,
} from '../application/outOfStockVisibility.js';

import { PRODUCT_UID_PATTERN } from '../domain/productUid.js';
import { applyFilters } from '../../plugins/application/hooks.js';

export const galleryPreviewRouter = Router();

const SITE_NAME = config.company.name;
const DEFAULT_OG_IMAGE = `${config.frontendBaseUrl}/og-image.jpg`;

/** The language segment of a shared front-end URL is passed through the
 * bot-only rewrite as `?lang=`. It must win over the crawler's own device
 * language: a French URL shared from an English phone is still French. Keep
 * the header fallback for direct API requests and old redirects. */
function previewLanguage(req: Request): Language {
  const language = typeof req.query.lang === 'string' ? req.query.lang.toLowerCase() : undefined;
  return typeof language === 'string' && isLanguage(language) ? language : requestLanguage(req);
}

function genericPreviewHtml(galleryUrl: string, language: Language): string {
  const url = escapeHtml(galleryUrl);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>${SITE_NAME}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${SITE_NAME}">
<meta property="og:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}">
<meta property="og:url" content="${url}">
<meta http-equiv="refresh" content="0;url=${url}">
</head>
<body><a href="${url}">${SITE_NAME}</a></body>
</html>`;
}

/** Minimal server-rendered HTML with correct per-product Open Graph tags and
 * Product JSON-LD, built fresh from the database on every request. This
 * project has no build-time prerendering (the catalogue changes constantly,
 * and nobody redeploys the front on every product edit), so this is the
 * only place a link-preview bot (WhatsApp, iMessage, Facebook, ...) or a
 * non-JS-executing search crawler can read correct metadata for a product.
 * Only bots ever see this route: kernel/front's own `public/.htaccess`
 * redirects matching bot user-agents requesting either `/creations/<slug>`
 * or `/gallery?product=<uid>` here, carrying the source URL's locale as
 * `?lang=`; a real visitor's browser reaches the real interactive page and
 * never resolves this URL at all — the
 * `<meta http-equiv="refresh">` is just a safety net for the rare case a
 * bot-flagged request reaches a real person anyway (e.g. an in-app browser
 * sharing a bot-like user agent). `canonicalUrl` is always the
 * localized `/creations/<uid>` short link (accepted by the front's own
 * uidFromSlug, see productUrl.ts), regardless of which of the two URL
 * families the request came in on — one canonical identity per product and
 * locale, avoiding duplicate-content ambiguity; `redirectUrl` is where a
 * stray human actually bounces to, which stays the localized gallery + zoom
 * modal experience the share button promises, not this shell. */
function productPreviewHtml(
  item: GalleryItem,
  {
    canonicalUrl,
    redirectUrl,
    language,
    closing,
  }: { canonicalUrl: string; redirectUrl: string; language: Language; closing?: string | undefined },
): string {
  // Same assembly as the crawlable product document, so a shared link
  // and an indexed page never describe the set differently.
  const shape = defaultCopyContext(item).shape;
  const seoTitle = productSeoTitle(item.title, {
    shapeWord: shape?.attributive ?? shape?.label,
    language,
  });
  const title = escapeHtml(item.title);
  const descriptionText = productSeoDescription(item.descTemplate, {
    context: defaultCopyContext(item),
    productUid: item.productUid,
    language,
    fallback: item.title,
    closing,
  });
  const description = escapeHtml(descriptionText);
  const image = escapeHtml(firstPhotoUrl(item) ?? DEFAULT_OG_IMAGE);
  const canonical = escapeHtml(canonicalUrl);
  const redirect = escapeHtml(redirectUrl);
  // </script>-safe: a title/desc containing a literal "</" could otherwise
  // break out of the inline JSON-LD block.
  const jsonLd = JSON.stringify(productJsonLd(item, canonicalUrl, descriptionText)).replace(/</g, '\\u003c');
  const publicIndexing = isPublicSeoTarget(config.target);
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(seoTitle)}</title>
<meta name="robots" content="${publicIndexing ? PUBLIC_SEO_ROBOTS : PRIVATE_SEO_ROBOTS}">
<meta name="description" content="${description}">
${publicIndexing ? `<link rel="canonical" href="${canonical}">` : ''}
<meta property="og:type" content="product">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeHtml(seoTitle)}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(seoTitle)}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<meta http-equiv="refresh" content="0;url=${redirect}">
${publicIndexing ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
</head>
<body><a href="${redirect}">${title}</a></body>
</html>`;
}

/** One family of shareable product: where its JSON lives, where a stray
 * human lands, and which page is canonical. */
interface PreviewFamily {
  load: (
    client: typeof pool,
    publicMediaUrl: string,
    uid: string,
    language: Language,
    option: string | undefined,
  ) => Promise<GalleryItem | undefined>;
  /** False while the family's Boutique switch is off (compose-a-set). */
  enabled: () => Promise<boolean>;
  galleryPath: string;
  pagePath: (item: GalleryItem) => string;
  closing: (language: Language) => string | undefined;
}

const SET_PREVIEW: PreviewFamily = {
  load: (client, publicMediaUrl, uid, language) => getProductByUid(client, publicMediaUrl, uid, language),
  enabled: async () => true,
  galleryPath: '/gallery',
  pagePath: (item) => itemPagePath(item),
  closing: () => undefined,
};

function previewHandler(family: PreviewFamily) {
  return async (req: Request, res: Response) => {
    const uid = String(req.params.uid ?? '');
    // Optional variation forwarded from a share link or product page.
    const option =
      typeof req.query.variation === 'string' && req.query.variation ? req.query.variation : undefined;
    const language = previewLanguage(req);
    // Old/direct callers still negotiate through Accept-Language. Locale-aware
    // shared URLs carry ?lang= and therefore have their own cache key too.
    res.vary('Accept-Language');
    const open = await family.enabled();
    const galleryPath = open ? family.galleryPath : '/gallery';
    res.setHeader('Cache-Control', open ? 'public, max-age=300' : 'no-store');
    const galleryUrl = `${config.frontendBaseUrl}${localizedFrontendPath(galleryPath, language)}`;
    if (!PRODUCT_UID_PATTERN.test(uid) || !open) {
      res.status(404).type('html').send(genericPreviewHtml(galleryUrl, language));
      return;
    }
    const item = await family.load(pool, config.publicMediaUrl, uid, language, option);
    if (!item || !isGalleryItemPubliclyAccessible(item, await outOfStockProductsEnabled())) {
      res.status(404).type('html').send(genericPreviewHtml(galleryUrl, language));
      return;
    }
    const canonicalUrl = `${config.frontendBaseUrl}${localizedFrontendPath(family.pagePath(item), language)}`;
    const itemOption = itemOptionKey(item);
    const redirectUrl = `${config.frontendBaseUrl}${localizedFrontendPath(
      `${family.galleryPath}?product=${encodeURIComponent(uid)}${
        itemOption ? `&variation=${encodeURIComponent(itemOption)}` : ''
      }`,
      language,
    )}`;
    res
      .type('html')
      .send(
        productPreviewHtml(item, { canonicalUrl, redirectUrl, language, closing: family.closing(language) }),
      );
  };
}

/** Bot-facing counterpart to /gallery/set/:uid — see productPreviewHtml's
 * own doc comment. Path deliberately mirrors the JSON route (same :uid) so
 * the front's .htaccess rewrite only needs to append `/preview` plus the
 * source URL's `lang`, not maintain a separate URL scheme. */
galleryPreviewRouter.get('/gallery/set/:uid/preview', previewHandler(SET_PREVIEW));

/** Source for the shop host's PHP sitemap relay. Kernel lists set pages;
 * plugins may append extra product rows. A direct API request gets 410 so
 * Google and users see only the shop-origin sitemap. */
galleryPreviewRouter.get('/sitemap-products.xml', async (req, res) => {
  res.vary('X-Tuucho-Sitemap-Relay');
  if (req.get('X-Tuucho-Sitemap-Relay') !== '1') {
    res.setHeader('Cache-Control', 'no-store');
    res.status(410).type('text').send('Gone');
    return;
  }
  const inStockOnly = !(await outOfStockProductsEnabled());
  const sets = (
    await Promise.all(
      (['nail', 'nail_single', 'accessory'] as const).map((productType) =>
        listPublicProductUidsForSitemap(pool, inStockOnly, productType),
      ),
    )
  ).flat();
  const extra = await applyFilters<Array<{ path: string; lastmod: string }>>(
    'seo.sitemap.productRows',
    [],
    { inStockOnly },
  );
  const rows = [
    ...sets.map((row) => ({ lastmod: row.lastmod, path: setPagePath(row.productUid) })),
    ...extra,
  ];
  const entries = rows
    .flatMap((row) => {
      const productPath = row.path;
      const localizedUrl = (language: Language) =>
        `${config.frontendBaseUrl}${localizedFrontendPath(productPath, language)}`;
      const alternates = [
        ...LANGUAGES.map(
          (language) =>
            `    <xhtml:link rel="alternate" hreflang="${language}" href="${escapeHtml(localizedUrl(language))}" />`,
        ),
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(localizedUrl('fr'))}" />`,
      ].join('\n');
      return LANGUAGES.map((language) => {
        const loc = localizedUrl(language);
        return `  <url>\n    <loc>${escapeHtml(loc)}</loc>\n    <lastmod>${row.lastmod}</lastmod>\n${alternates}\n  </url>`;
      });
    })
    .join('\n');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.type('application/xml');
  res.send(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`,
  );
});
