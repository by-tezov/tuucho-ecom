import { pickLocalized, type Language } from '../../../utils/language.js';
import { resolveProductCopy, type CopyContext, type CopyTerm } from './productCopy.js';

/**
 * The one place a product page's `<title>` and `<meta name="description">`
 * are composed, for every renderer of `/creations/<uid>`: the SSR relay
 * document, the link-preview shell, and (mirrored, see
 * kernel/front/src/utils/productSeo.ts) the front's own <Seo>. Before this
 * existed the relay served one sentence and the front's hydration replaced it
 * with a different one, so a crawler and a visitor were told different things
 * about the same URL.
 *
 * What it adds to the authored copy, and why only here: a set's stored
 * description is catalogue copy, shown as is on the gallery cards, and it
 * deliberately does not carry commercial vocabulary. But a product page is
 * the only surface of this shop a search engine can rank on "pieces artisanales
 * handmade", and a description that never names the product cannot do that.
 * So the noun is added at render time, on the product page only, by
 * decorating the shape the copy already refers to: `$shape` resolves to
 * "pieces artisanales amande" instead of "amande", which keeps the
 * sentence, the agreement and the honesty intact.
 *
 * Only a sentence that opens on the shape title gets that noun: there the
 * shape is the subject ("$Shape.title brillante…"). Copy that names the nails
 * itself first ("Glossy $shape.title nails", "เล็บ$shape.title") would read
 * "Glossy handmade pieces coffin nails", so it is left as authored, and so is
 * legacy copy with no `$shape` at all: a sentence already opening on the
 * shape word would read "Pieces handmade amande. Amande brillante
 * violette", which is worse than a shorter snippet.
 */

/** Long enough to fill the ~155 characters a result shows without being cut
 * mid-thought, with a little room for the languages that run longer. */
const DESCRIPTION_LIMIT = 170;

/** Google renders roughly 60 characters of a title. The brand is shortened
 * from "Shop" here, and only here, to buy the room the product
 * term needs. */
const TITLE_LIMIT = 65;
const TITLE_BRAND = 'Shop';

interface ProductSeoCopy {
  /** Two forms of "what this product is", alternated across the catalogue so
   * every snippet does not open on the same four words. Lower case: they are
   * substituted into the sentence, which capitalizes its own first letter. */
  nouns: [string, string];
  /** The term used in the `<title>`, where there is no room to alternate. */
  titleTerm: string;
  /** Whether the shape comes before the product noun in this language
   * ("coffin handmade pieces", "amandelvormige handgemaakte stukken") rather than
   * after it ("pieces artisanales coffin", "เล็บปลอมแบบกด ทรงคอฟฟิน"). */
  shapeFirst: boolean;
  /** One true, differentiating fact, appended when there is room for it.
   * Word for word kernel/front's `t.product.seoDescSuffix`, as are `nouns`
   * and `titleTerm` against its `seoNoun`/`seoNounAlt`/`seoTitleTerm`: the
   * front replaces this document's tags on hydration, and the two describing
   * the same URL differently is the defect this module exists to fix. */
  closing: string;
}

const PRODUCT_SEO_COPY: Partial<Record<string, ProductSeoCopy>> = {
  fr: {
    nouns: ['piece artisanale', 'objet d atelier'],
    titleTerm: 'piece artisanale',
    shapeFirst: false,
    closing: 'Piece artisanale faite main, livree en France.',
  },
  en: {
    nouns: ['handmade piece', 'handmade atelier piece'],
    titleTerm: 'handmade piece',
    shapeFirst: true,
    closing: 'Handmade atelier piece, shipped from France.',
  },
};

/** Stable per set rather than random: the same URL must produce the same
 * snippet on every request, or two crawls disagree about the page. */
function nounFor(productUid: string, language: Language): string {
  let sum = 0;
  for (const char of productUid) sum += char.codePointAt(0) ?? 0;
  return pickLocalized(PRODUCT_SEO_COPY, language).nouns[sum % 2]!;
}

/** Cuts on a word boundary. A snippet is cut by the search engine anyway;
 * what matters is not shipping half a word into the structured data. */
function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** A product noun and a shape word in this language's order: "pieces artisanales
 * handmade coffin", but "coffin handmade pieces". */
function withShape(noun: string, shapeWord: string, language: Language): string {
  return (pickLocalized(PRODUCT_SEO_COPY, language).shapeFirst
    ? `${shapeWord} ${noun}`
    : `${noun} ${shapeWord}`
  ).trim();
}

/** Authored copy whose sentence opens on the shape title: the only copy the
 * product noun is added to (see the module comment). */
const OPENS_ON_SHAPE_TITLE = /^\$(?:Shape|shape)\.title\b/;

/** The copy context of a product page: the same shape and length the rest of
 * the page shows, with the shape label carrying the product noun. */
export function productSeoCopyContext(
  context: CopyContext,
  productUid: string,
  language: Language,
): CopyContext {
  const shape: CopyTerm | undefined = context.shape
    ? { ...context.shape, label: withShape(nounFor(productUid, language), context.shape.label, language) }
    : undefined;
  return { ...context, ...(shape ? { shape } : {}) };
}

/**
 * `<meta name="description">` and `Product.description` for one set.
 *
 * `fallback` is what to say when the set has no authored description at all.
 * `closing` replaces the set closing sentence (a single nail is not a set,
 * see nailSeoCopy.ts).
 */
export function productSeoDescription(
  descTemplate: string,
  {
    context,
    productUid,
    language,
    fallback,
    closing: closingOverride,
  }: {
    context: CopyContext;
    productUid: string;
    language: Language;
    fallback: string;
    closing?: string | undefined;
  },
): string {
  const authored = descTemplate.trim();
  const copyContext = OPENS_ON_SHAPE_TITLE.test(authored)
    ? productSeoCopyContext(context, productUid, language)
    : context;
  const resolved = authored ? resolveProductCopy(authored, copyContext) : fallback;
  const head = resolved.charAt(0).toLocaleUpperCase() + resolved.slice(1);
  const closing = closingOverride ?? pickLocalized(PRODUCT_SEO_COPY, language).closing;
  const withClosing = `${head} ${closing}`;
  if (withClosing.length <= DESCRIPTION_LIMIT) return withClosing;
  return clamp(head, DESCRIPTION_LIMIT);
}

/**
 * `<title>` for one set.
 *
 * The set name alone ranks for the set name alone, so the product term and
 * the shape are appended. Both are dropped, longest first, rather than
 * letting the title overflow into an ellipsis in the result.
 *
 * `shapeWord` is the shape's attributive form, the one that goes with the
 * plural word for nails ("carrés", "vierkante"), since that is the noun it
 * sits next to here.
 */
export function productSeoTitle(
  title: string,
  { shapeWord, language }: { shapeWord: string | undefined; language: Language },
): string {
  const term = pickLocalized(PRODUCT_SEO_COPY, language).titleTerm;
  const candidates = [
    shapeWord ? `${title}, ${withShape(term, shapeWord, language)} · ${TITLE_BRAND}` : '',
    `${title}, ${term} · ${TITLE_BRAND}`,
    `${title} · ${TITLE_BRAND}`,
  ].filter(Boolean);
  return candidates.find((candidate) => candidate.length <= TITLE_LIMIT) ?? candidates.at(-1)!;
}

/** The on-page heading under the set name: what the page is, in the words
 * people search with. The `<h1>` stays the set's own name, because that is
 * what the visitor sees. `shapeWord` as for productSeoTitle. */
export function productSeoHeading(shapeWord: string | undefined, language: Language): string {
  const term = pickLocalized(PRODUCT_SEO_COPY, language).titleTerm;
  const heading = shapeWord ? withShape(term, shapeWord, language) : term;
  return heading.charAt(0).toLocaleUpperCase() + heading.slice(1);
}
