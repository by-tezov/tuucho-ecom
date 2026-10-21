import { config } from '../../../config/env.js';
import { peekStoreIdentity } from '../../plugins/application/storeSettings.js';
import { isPublicSeoTarget, PRIVATE_SEO_ROBOTS, PUBLIC_SEO_ROBOTS } from '../../../config/publicSeo.js';
import { LANGUAGES, type Language } from '../../../utils/language.js';
import type { GalleryItem } from '../../../types.js';
import { GALLERY_SEO_COPY, type GallerySeoCopy } from '../domain/gallerySeoCopy.js';
import { productSeoDescription, productSeoHeading, productSeoTitle } from '../domain/productSeoCopy.js';
import { defaultCopyContext } from './productVariants.js';
import type { GallerySeoRow } from './gallerySeoQuery.js';

/**
 * The `<head>` and `#root` markup the shop host's SSR relay splices into a
 * prerendered shell (`kernel/front` SSR relay).
 *
 * Why this exists at all: the front is a static build with no catalogue
 * access, so `/creations/<uid>` and `/gallery` shipped as the SPA shell.
 * Measured on production, that shell is the prerendered `/` splash, which
 * carries `<meta name="robots" content="noindex">` by design. Google honours
 * a noindex found in the served HTML and skips rendering entirely, so the JS
 * that would have replaced it never ran and the whole catalogue was
 * unindexable. Everything here is built from the database per request, which
 * is the only way a catalogue that changes daily can also be crawlable.
 *
 * Every string that reaches HTML goes through `escapeHtml`, and every JSON-LD
 * block has its `<` escaped, so a set title containing markup cannot break
 * out of an attribute or a script body.
 */

function SITE_NAME(): string {
  return peekStoreIdentity().name;
}
const DEFAULT_OG_IMAGE = `${config.frontendBaseUrl}/og-image.jpg`;

/** Kernel SEO family: ready-made sets (`/gallery`, pages under `/creations/`).
 * Extra catalogue families are contributed by plugins. */
export interface ExtraSeoFamily {
  galleryPath: string;
  copy: (language: Language) => GallerySeoCopy;
  /** Replaces the set closing sentence of a product description. */
  closing: (language: Language) => string | undefined;
  pagePath: (item: GalleryItem) => string;
  rowPath: (row: GallerySeoRow) => string;
}

const SET_FAMILY: ExtraSeoFamily = {
  galleryPath: '/gallery',
  copy: (language) => GALLERY_SEO_COPY[language],
  closing: () => undefined,
  pagePath: (item) => setPagePath(item.productUid),
  rowPath: (row) => setPagePath(row.productUid),
};

/** Canonical path of one product page: the bare-uid short link. */
export function setPagePath(productUid: string): string {
  return `/creations/${productUid.toLowerCase()}`;
}

/** The option an item describes: `initialVariation`, else its first option.
 * Undefined for a set or a unit without options. */
export function itemOptionKey(item: GalleryItem): string | undefined {
  return item.variation ? (item.initialVariation ?? item.variation.options[0]?.key) : undefined;
}

/** Canonical path of the set page an item describes. */
export function itemPagePath(item: GalleryItem): string {
  return setPagePath(item.productUid);
}

function rowPagePath(row: GallerySeoRow, family: ExtraSeoFamily): string {
  return family.rowPath(row);
}

/** What the relay needs to build one page. `head` and `body` are raw HTML. */
export interface SeoDocument {
  title: string;
  head: string;
  body: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `</script>`-safe: a title or description holding a literal `</` could
 * otherwise close the inline JSON-LD block early. */
function jsonLdScript(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}

export function localizedFrontendPath(path: string, language: Language): string {
  return `/${language}${path}`;
}

function frontendUrl(path: string, language: Language): string {
  return `${config.frontendBaseUrl}${localizedFrontendPath(path, language)}`;
}

/** The set's first photo, same "first shape, first length" convention the
 * front's defaultShapeKey/defaultLengthKey use. */
export function firstPhotoUrl(item: GalleryItem): string | undefined {
  const shapeKey = Object.keys(item.shape)[0];
  const lengthKey = shapeKey ? Object.keys(item.lengthsByShape[shapeKey] ?? {})[0] : undefined;
  return lengthKey ? item.photosByShapeLength[shapeKey]?.[lengthKey]?.[0]?.modal : undefined;
}

export function productImages(item: GalleryItem): string[] {
  const urls: string[] = [];
  for (const byLength of Object.values(item.photosByShapeLength)) {
    for (const photos of Object.values(byLength)) {
      for (const photo of photos) if (photo.modal) urls.push(photo.modal);
    }
  }
  return urls;
}

export function totalStock(item: GalleryItem): number {
  let total = 0;
  for (const byLength of Object.values(item.available)) {
    for (const bySize of Object.values(byLength)) {
      for (const quantity of Object.values(bySize)) total += quantity ?? 0;
    }
  }
  return total;
}

/** Same shape as kernel/front's own productJsonLd (src/utils/productSeo.ts),
 * kept independent rather than shared: that one also needs translated labels
 * (t.product.*) this route has no reason to fetch. */
export function productJsonLd(
  item: GalleryItem,
  canonicalUrl: string,
  description: string,
): Record<string, unknown> {
  const images = productImages(item);
  const inStock = totalStock(item) > 0;
  // A single-nail option is one variant of a ProductGroup keyed by the nail's
  // uid (Google's product-variant model): its own sku, colour and URL, and
  // every sibling listed under `hasVariant`.
  const optionKey = itemOptionKey(item);
  const option = optionKey ? item.variation?.options.find((entry) => entry.key === optionKey) : undefined;
  const sku = optionKey ? `${item.productUid}-${optionKey}` : item.productUid;
  const product: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${canonicalUrl}#product`,
    name: item.title,
    description,
    sku,
    mpn: sku,
    url: canonicalUrl,
    brand: { '@type': 'Brand', name: SITE_NAME() },
    ...(images.length > 0 && { image: images }),
    ...(option && item.variation?.key === 'color' ? { color: option.label } : {}),
  };
  if (item.variation && option) {
    const groupUrl = canonicalUrl.replace(/\/[^/]+$/, '');
    product.isVariantOf = {
      '@type': 'ProductGroup',
      '@id': `${groupUrl}#group`,
      productGroupID: item.productUid,
      name: item.title,
      brand: { '@type': 'Brand', name: SITE_NAME() },
      ...(item.variation.key === 'color' ? { variesBy: 'https://schema.org/color' } : {}),
      hasVariant: item.variation.options.map((entry) => ({
        '@type': 'Product',
        '@id': `${groupUrl}/${encodeURIComponent(entry.key)}#product`,
        name: entry.title,
        url: `${groupUrl}/${encodeURIComponent(entry.key)}`,
        sku: `${item.productUid}-${entry.key}`,
      })),
    };
  }
  if (item.price !== undefined) {
    product.offers = {
      '@type': 'Offer',
      url: canonicalUrl,
      priceCurrency: 'EUR',
      price: item.price.toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: SITE_NAME() },
    };
  }
  return { '@context': 'https://schema.org', ...product };
}

/** robots/description/canonical/hreflang/OG/Twitter, shared by both pages.
 * Indexable tags only when APP_TARGET is prod. */
function commonHead(
  { path, title, description, image }: { path: string; title: string; description: string; image: string },
  language: Language,
  ogType: 'website' | 'product',
): string[] {
  const canonical = frontendUrl(path, language);
  const escapedTitle = escapeHtml(`${title} \u00b7 ${SITE_NAME()}`);
  const escapedDescription = escapeHtml(description);
  const escapedImage = escapeHtml(image);
  const publicIndexing = isPublicSeoTarget(config.target);
  return [
    `<meta name="robots" content="${publicIndexing ? PUBLIC_SEO_ROBOTS : PRIVATE_SEO_ROBOTS}" />`,
    `<meta name="description" content="${escapedDescription}" />`,
    ...(publicIndexing
      ? [
          `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
          ...LANGUAGES.map(
            (alternate) =>
              `<link rel="alternate" hreflang="${alternate}" href="${escapeHtml(frontendUrl(path, alternate))}" />`,
          ),
          `<link rel="alternate" hreflang="x-default" href="${escapeHtml(frontendUrl(path, 'fr'))}" />`,
        ]
      : []),
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="${SITE_NAME()}" />`,
    `<meta property="og:title" content="${escapedTitle}" />`,
    `<meta property="og:description" content="${escapedDescription}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapedImage}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapedTitle}" />`,
    `<meta name="twitter:description" content="${escapedDescription}" />`,
    `<meta name="twitter:image" content="${escapedImage}" />`,
  ];
}

function breadcrumbJsonLd(
  trail: { name: string; path: string }[],
  language: Language,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: frontendUrl(entry.path, language),
    })),
  };
}

function priceLabel(price: number | undefined, language: Language): string {
  if (price === undefined) return '';
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : language, {
    style: 'currency',
    currency: 'EUR',
  }).format(price);
}

/**
 * One product page.
 *
 * `canonicalPath` is the bare-uid short link, matching what
 * /gallery/set/:uid/preview already declares and what the product sitemap
 * publishes. One canonical identity per product and locale, whichever of the
 * two URL families the request arrived on.
 */
export function productSeoDocument(
  item: GalleryItem,
  language: Language,
  related: GallerySeoRow[] = [],
): SeoDocument {
  return productPageDocument(item, language, related, SET_FAMILY);
}

/** Plugin catalogue families (custom-set unit pages, etc.). */
export function extraProductSeoDocument(
  item: GalleryItem,
  language: Language,
  related: GallerySeoRow[],
  family: ExtraSeoFamily,
): SeoDocument {
  return productPageDocument(item, language, related, family);
}

export function extraGallerySeoDocument(
  rows: GallerySeoRow[],
  language: Language,
  family: ExtraSeoFamily,
): SeoDocument {
  return indexDocument(rows, language, family);
}

function productPageDocument(
  item: GalleryItem,
  language: Language,
  related: GallerySeoRow[],
  family: ExtraSeoFamily,
): SeoDocument {
  const copy = family.copy(language);
  const path = family.pagePath(item);
  const canonical = frontendUrl(path, language);
  // A nail option's siblings come first in the related row: same model,
  // other colours, each its own page.
  const currentOption = itemOptionKey(item);
  const siblings: GallerySeoRow[] = (item.variation?.options ?? [])
    .filter((option) => option.key !== currentOption)
    .map((option) => ({
      productUid: item.productUid,
      optionKey: option.key,
      title: option.title,
      desc: option.desc,
      occasion: option.occasion,
      photo: undefined,
      photoAlt: option.alt ?? option.title,
      price: option.price ?? item.price,
    }));
  const relatedRows = [...siblings, ...related];
  const image = firstPhotoUrl(item) ?? DEFAULT_OG_IMAGE;
  // Same shape and length the rest of the page shows, so the sentence names
  // the variant the visitor is actually looking at.
  const context = defaultCopyContext(item);
  const description = productSeoDescription(item.descTemplate, {
    context,
    productUid: item.productUid,
    language,
    fallback: `${item.title}. ${copy.intro}`,
    closing: family.closing(language),
  });
  // The form that goes with the plural word for nails, which is what the
  // shape sits next to in the title and the heading.
  const shapeWord = context.shape?.attributive ?? context.shape?.label;
  const title = productSeoTitle(item.title, { shapeWord, language });
  const price = priceLabel(item.price, language);
  const inStock = totalStock(item) > 0;

  const head = [
    ...commonHead({ path, title: item.title, description, image }, language, 'product'),
    ...(item.price !== undefined
      ? [
          `<meta property="product:price:amount" content="${escapeHtml(item.price.toFixed(2))}" />`,
          '<meta property="product:price:currency" content="EUR" />',
        ]
      : []),
    `<meta property="product:availability" content="${inStock ? 'in stock' : 'out of stock'}" />`,
    ...(isPublicSeoTarget(config.target)
      ? [
          jsonLdScript(productJsonLd(item, canonical, description)),
          jsonLdScript(
            breadcrumbJsonLd(
              [
                { name: SITE_NAME(), path: '/home' },
                { name: copy.h1, path: family.galleryPath },
                { name: item.title, path },
              ],
              language,
            ),
          ),
        ]
      : []),
  ].join('');

  const gallery = escapeHtml(frontendUrl(family.galleryPath, language));
  // The related row is the whole point of rendering this server side: without
  // it a crawler reaches every product from one flat index and learns nothing
  // about which sets belong together (see listRelatedSeoSets).
  const relatedList = relatedRows
    .map((row) => {
      const href = escapeHtml(frontendUrl(rowPagePath(row, family), language));
      return `<li><a href="${href}">${escapeHtml(row.title)}</a></li>`;
    })
    .join('');
  const body = [
    '<article>',
    `<h1>${escapeHtml(item.title)}</h1>`,
    `<h2>${escapeHtml(productSeoHeading(shapeWord, language))}</h2>`,
    image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.alt || item.title)}" width="640" />` : '',
    `<p>${escapeHtml(description)}</p>`,
    price
      ? `<p><strong>${escapeHtml(price)}</strong> <span>${escapeHtml(inStock ? copy.inStock : copy.outOfStock)}</span></p>`
      : '',
    item.occasion ? `<p>${escapeHtml(item.occasion)}</p>` : '',
    relatedList ? `<nav><h2>${escapeHtml(copy.related)}</h2><ul>${relatedList}</ul></nav>` : '',
    `<p><a href="${gallery}">${escapeHtml(copy.h1)}</a></p>`,
    '</article>',
  ]
    .filter(Boolean)
    .join('');

  return { title, head, body };
}

/**
 * The gallery index.
 *
 * Every visible set as a real anchor. This is the part that actually matters:
 * the product sitemap hands Google 497 URLs with no anchor text and no
 * internal link at all, so nothing on the site links to a product page that a
 * crawler can follow without executing the SPA. This page does.
 */
export function gallerySeoDocument(rows: GallerySeoRow[], language: Language): SeoDocument {
  return indexDocument(rows, language, SET_FAMILY);
}

function indexDocument(rows: GallerySeoRow[], language: Language, family: ExtraSeoFamily): SeoDocument {
  const copy = family.copy(language);
  const galleryPath = family.galleryPath;
  const head = [
    ...commonHead(
      { path: galleryPath, title: copy.title, description: copy.description, image: DEFAULT_OG_IMAGE },
      language,
      'website',
    ),
    ...(isPublicSeoTarget(config.target)
      ? [
          jsonLdScript({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            '@id': `${frontendUrl(galleryPath, language)}#collection`,
            name: copy.title,
            description: copy.description,
            url: frontendUrl(galleryPath, language),
            isPartOf: { '@id': `${config.frontendBaseUrl}/#website` },
            mainEntity: {
              '@type': 'ItemList',
              numberOfItems: rows.length,
              itemListElement: rows.map((row, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                url: frontendUrl(rowPagePath(row, family), language),
                name: row.title,
              })),
            },
          }),
          jsonLdScript(
            breadcrumbJsonLd(
              [
                { name: SITE_NAME(), path: '/home' },
                { name: copy.h1, path: galleryPath },
              ],
              language,
            ),
          ),
        ]
      : []),
  ].join('');

  const cards = rows
    .map((row) => {
      const href = escapeHtml(frontendUrl(rowPagePath(row, family), language));
      const title = escapeHtml(row.title);
      const price = priceLabel(row.price, language);
      return [
        '<li>',
        `<a href="${href}" aria-label="${escapeHtml(`${copy.view}: ${row.title}`)}">`,
        row.photo
          ? `<img src="${escapeHtml(row.photo)}" alt="${escapeHtml(row.photoAlt)}" width="320" loading="lazy" />`
          : '',
        `<h2>${title}</h2>`,
        row.occasion ? `<p>${escapeHtml(row.occasion)}</p>` : '',
        price ? `<p>${escapeHtml(price)}</p>` : '',
        '</a>',
        '</li>',
      ]
        .filter(Boolean)
        .join('');
    })
    .join('');

  const body = [
    '<section>',
    `<h1>${escapeHtml(copy.h1)}</h1>`,
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<h2>${escapeHtml(copy.count(rows.length))}</h2>`,
    `<ul>${cards}</ul>`,
    '</section>',
  ].join('');

  return { title: `${copy.title} \u00b7 ${SITE_NAME()}`, head, body };
}
