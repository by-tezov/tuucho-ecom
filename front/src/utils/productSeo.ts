import { shopConfig } from '../config/env';
import type { Lang, Strings } from '../assets/i18n';
import type { GalleryItem } from '../data/types';
import { productPath, nailPath } from './productUrl';
import { localizedPath } from '../config/i18nRoutes';
import { copyContextFor, resolveProductCopy, type CopyContext } from './productCopy';

/**
 * Search-engine metadata for one set: the `<meta name="description">` text
 * and the JSON-LD graph (Product + Offer + BreadcrumbList).
 *
 * Shared by the runtime <Seo> component and the build-time prerenderer
 * (entry-server.tsx) so a crawler and a client-side visitor are never
 * described differently — the prerendered HTML is the version that actually
 * gets indexed, and it must agree with what hydration then renders.
 */

/** Every photo of a set, all shapes and lengths, largest variant first —
 * `Product.image` accepts several and Google prefers the higher-resolution
 * ones for rich results. */
export function productImages(item: GalleryItem): string[] {
  const urls: string[] = [];
  for (const byLength of Object.values(item.photosByShapeLength)) {
    for (const photos of Object.values(byLength)) {
      for (const photo of photos) {
        if (photo.modal) urls.push(photo.modal);
      }
    }
  }
  return urls;
}

/** Long enough to fill the ~155 characters a result shows without being cut
 * mid-thought, with room for the languages that run longer. Same value as
 * pamsurin-back's productSeoCopy.ts. */
const DESCRIPTION_LIMIT = 170;

/** Google renders roughly 60 characters of a title. The brand is shortened
 * here, and only here, to buy the room the product term needs. */
const TITLE_LIMIT = 65;
const TITLE_BRAND = 'Lumen';

/** Stable per set rather than random: the same URL must produce the same
 * snippet on every render, or the prerendered page and the hydrated one
 * disagree. Same hash as pamsurin-back's productSeoCopy.ts. */
function nounFor(item: GalleryItem, t: Strings): string {
  let sum = 0;
  for (const char of item.productUid) sum += char.codePointAt(0) ?? 0;
  return sum % 2 === 0 ? t.product.seoNoun : t.product.seoNounAlt;
}

/** Languages that put the shape before the product noun ("coffin press-on
 * nails", "vierkante press-on nagels") rather than after it ("faux ongles
 * press-on coffin"). Same table as pamsurin-back's productSeoCopy.ts
 * `shapeFirst`. */
const SHAPE_FIRST: Partial<Record<Lang, true>> = { en: true, nl: true };

/** A product noun and a shape word in this language's order. */
function withShape(noun: string, shapeWord: string, lang: Lang): string {
  return (SHAPE_FIRST[lang] ? `${shapeWord} ${noun}` : `${noun} ${shapeWord}`).trim();
}

/** Authored copy whose sentence opens on the shape title: the only copy the
 * product noun is added to. Copy that names the nails first ("Glossy
 * $shape.title nails", "เล็บ$shape.title") would read "Glossy press-on nails
 * coffin nails". Same rule as pamsurin-back's productSeoCopy.ts. */
const OPENS_ON_SHAPE_TITLE = /^\$(?:Shape|shape)\.title\b/;

function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** The copy context of a product page: the shape and length the page is
 * showing, with the shape label carrying the product noun.
 *
 * Why the noun goes in here rather than into the stored description: a set's
 * description is catalogue copy, printed as is on the gallery cards, and it
 * deliberately carries no commercial vocabulary. But a product page is the
 * only surface a search engine can rank on "faux ongles press-on", and a
 * description that never names the product cannot do that. Decorating the
 * shape the sentence already refers to adds the term without breaking the
 * sentence or its agreement. */
function seoCopyContext(
  item: GalleryItem,
  t: Strings,
  lang: Lang,
  shapeKey?: string,
  lengthKey?: string,
): CopyContext {
  const context = copyContextFor(item, shapeKey, lengthKey);
  if (!context.shape) return context;
  return {
    ...context,
    shape: { ...context.shape, label: withShape(nounFor(item, t), context.shape.label, lang) },
  };
}

/**
 * The page's `<meta name="description">` and its `Product.description`.
 *
 * Mirrors pamsurin-back's `catalog/domain/productSeoCopy.ts` exactly: that is
 * what a crawler is served for this URL, and this is what replaces it on
 * hydration. The two producing different text for the same page is the defect
 * the shared composition exists to remove, so any change here is a change
 * there too.
 *
 * Only copy that opens on the shape title gets the product noun (see
 * OPENS_ON_SHAPE_TITLE). Copy with no `$shape.title` in it is left alone
 * rather than prefixed: a sentence already opening on the shape word would
 * read "Faux ongles press-on amande. Amande brillante violette", which is
 * worse than a shorter snippet.
 */
export function productSeoDescription(
  item: GalleryItem,
  t: Strings,
  lang: Lang,
  shapeKey?: string,
  lengthKey?: string,
  /** Closing sentence; a single nail passes t.product.nailSeoDescSuffix. */
  suffix: string = t.product.seoDescSuffix,
): string {
  const authored = (item.descTemplate || item.desc).trim();
  const context = OPENS_ON_SHAPE_TITLE.test(authored)
    ? seoCopyContext(item, t, lang, shapeKey, lengthKey)
    : copyContextFor(item, shapeKey, lengthKey);
  const resolved = authored ? resolveProductCopy(authored, context) : item.title;
  const head = resolved.charAt(0).toLocaleUpperCase() + resolved.slice(1);
  const withClosing = `${head} ${suffix}`;
  return withClosing.length <= DESCRIPTION_LIMIT ? withClosing : clamp(head, DESCRIPTION_LIMIT);
}

/** The shape in the form that goes with the plural word for nails
 * (« carrés », "vierkante"), which is the noun it sits next to in the title
 * and the heading. */
function shapeWordFor(item: GalleryItem, shapeKey?: string): string | undefined {
  const shape = copyContextFor(item, shapeKey).shape;
  return shape?.attributive ?? shape?.label;
}

/**
 * The page's `<title>`, without the site-name suffix <Seo> would otherwise
 * append: the set name alone can only rank for itself, so the product term
 * and the shape are added, and dropped longest-first rather than letting the
 * title overflow into an ellipsis in the result.
 */
export function productSeoTitle(item: GalleryItem, t: Strings, lang: Lang, shapeKey?: string): string {
  const shapeWord = shapeWordFor(item, shapeKey);
  const term = t.product.seoTitleTerm;
  const candidates = [
    shapeWord ? `${item.title}, ${withShape(term, shapeWord, lang)} · ${TITLE_BRAND}` : '',
    `${item.title}, ${term} · ${TITLE_BRAND}`,
    `${item.title} · ${TITLE_BRAND}`,
  ].filter(Boolean);
  return candidates.find((candidate) => candidate.length <= TITLE_LIMIT) ?? candidates.at(-1)!;
}

/** The heading under the set name: what the page is, in the words people
 * search with. The `<h1>` stays the set's own name, because that is what the
 * visitor sees. */
export function productSeoHeading(item: GalleryItem, t: Strings, lang: Lang, shapeKey?: string): string {
  const shapeWord = shapeWordFor(item, shapeKey);
  const term = t.product.seoTitleTerm;
  const heading = shapeWord ? withShape(term, shapeWord, lang) : term;
  return heading.charAt(0).toLocaleUpperCase() + heading.slice(1);
}

/** Total stock across every shape/length/size of a set. */
function totalStock(item: GalleryItem): number {
  let total = 0;
  for (const byLength of Object.values(item.available)) {
    for (const bySize of Object.values(byLength)) {
      for (const quantity of Object.values(bySize)) total += quantity ?? 0;
    }
  }
  return total;
}

/**
 * Product + Offer + BreadcrumbList for one set.
 *
 * `offers` is omitted entirely when the set has no price: an Offer without a
 * `price` is invalid structured data and costs more (a Search Console error,
 * and ineligibility for the whole item) than simply not claiming one. Same
 * reasoning for `sku`/`availability`, which are always known.
 */
export function productJsonLd(
  item: GalleryItem,
  t: Strings,
  lang: Lang,
  shapeKey?: string,
  lengthKey?: string,
  /** A single nail's page and closing sentence; a set's by default. */
  nail = false,
  /** A single nail's variation option: its own page, `item` being that
   * option's view (itemForVariation). */
  variationKey = '',
): Record<string, unknown> {
  const url = `${shopConfig.siteUrl}${localizedPath(nail ? nailPath(item, variationKey) : productPath(item), lang)}`;
  const images = productImages(item);
  const inStock = totalStock(item) > 0;

  const product: Record<string, unknown> = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: item.title,
    description: productSeoDescription(
      item,
      t,
      lang,
      shapeKey,
      lengthKey,
      nail ? t.product.nailSeoDescSuffix : t.product.seoDescSuffix,
    ),
    sku: item.productUid,
    mpn: item.productUid,
    url,
    category: t.product.schemaCategory,
    brand: { '@type': 'Brand', name: shopConfig.shopName },
    ...(images.length > 0 && { image: images }),
    ...(item.colorMain.length > 0 && { color: item.colorMain.join(', ') }),
    additionalProperty: [
      ...(item.occasion
        ? [{ '@type': 'PropertyValue', name: t.product.occasionLabel, value: item.occasion }]
        : []),
      ...(Object.keys(item.shape).length > 0
        ? [
            {
              '@type': 'PropertyValue',
              name: t.product.shapeLabel,
              value: Object.values(item.shape).join(', '),
            },
          ]
        : []),
    ],
  };

  if (item.price !== undefined) {
    product.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'EUR',
      price: item.price.toFixed(2),
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: shopConfig.shopName },
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      product,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: t.nav.home,
            item: `${shopConfig.siteUrl}${localizedPath('/home', lang)}`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: t.nav.gallery,
            item: `${shopConfig.siteUrl}${localizedPath('/gallery', lang)}`,
          },
          { '@type': 'ListItem', position: 3, name: item.title, item: url },
        ],
      },
    ],
  };
}
