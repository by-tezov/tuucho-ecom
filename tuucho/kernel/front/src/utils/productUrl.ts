import type { GalleryItem } from '../data/types';

/**
 * URLs for the per-set product pages (`/creations/<uid>`), which are the
 * site's only indexable product surface — the gallery grid itself is one URL
 * for the whole catalogue, so without these there is nothing for a search
 * for a specific design to land on.
 *
 * A page's URL is its reference alone (kernel/back's `LL-LL-DDD` short
 * code, lowercased): unique, stable across library re-imports and title
 * edits, and the same URL every server-side surface declares as canonical
 * (SSR relay, product sitemap, link preview). Links from before this rule
 * carried the slugified title in front of the reference
 * (`/creations/<title>-<uid>`); `uidFromSlug` still resolves them, and the
 * page declares the reference URL as canonical.
 */

/** `LL-LL-DDD`, lowercased — the tail of an older title-prefixed slug. */
const UID_IN_SLUG = /-([a-z]{2}-[a-z]{2}-\d{3})$/;

/** The full route path for a set, e.g. "/creations/aq-yz-367". */
export function productPath(item: Pick<GalleryItem, 'productUid'>): string {
  return `/creations/${item.productUid.toLowerCase()}`;
}

/** The page of one single catalogue unit, e.g. "/nail/ab-cd-123". A unit
 * with variation options has one page per option: "/nail/ab-cd-123/black-cherry".
 * Plugin custom-set galleries own their own share-link helpers. */
export function nailPath(item: Pick<GalleryItem, 'productUid'>, variationKey = ''): string {
  const base = `/nail/${item.productUid.toLowerCase()}`;
  return variationKey ? `${base}/${encodeURIComponent(variationKey)}` : base;
}

/**
 * Unlocalized deep link that reopens this set's zoom modal directly on
 * `/gallery`. PhotoLightbox.tsx applies the active URL locale before handing
 * it to navigator.share (French shares are `/fr/gallery?product=`). A real
 * visitor's browser opens this directly; a link-preview bot never runs any
 * JS at all, so it never even resolves this URL client-side — see
 * kernel/back's own `/gallery/set/:uid/preview` route and this repo's
 * `public/.htaccess` bot-UA rewrite, which is what actually answers those
 * bots with fresh, database-backed og:image/title for this exact URL,
 * without any build-time prerendering. See useGalleryProductDeepLink.ts for
 * the client-side reader.
 */
export function productDeepLinkPath(input: { kind?: string; uid: string; extra?: string }): string {
  return `/gallery?product=${encodeURIComponent(input.uid)}${input.extra ? `&${input.extra}` : ''}`;
}

export function productGalleryDeepLinkPath(item: Pick<GalleryItem, 'productUid'>): string {
  return productDeepLinkPath({ kind: 'gallery', uid: item.productUid });
}

/** Extracts the `product_uid` a slug addresses, or undefined when the slug
 * carries no valid code (a hand-typed or truncated URL — the page 404s).
 * Accepts the reference alone ("aq-yz-367", what productPath builds) and an
 * older title-prefixed slug ("cerises-elegantes-aq-yz-367"). */
export function uidFromSlug(slug: string): string | undefined {
  const value = slug.trim().toLowerCase();
  const matched = UID_IN_SLUG.exec(value);
  if (matched?.[1]) return matched[1].toUpperCase();
  return /^[a-z]{2}-[a-z]{2}-\d{3}$/.test(value) ? value.toUpperCase() : undefined;
}
