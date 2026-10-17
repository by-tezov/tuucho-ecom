import type { Language } from '../../../utils/language.js';

/**
 * The only copy the server-rendered gallery index needs of its own.
 *
 * It is a small, deliberate duplicate of kernel/front's `t.seo.gallery*`
 * and `t.nav.*`: this service has no access to the front's dictionaries, and
 * shipping the whole i18n bundle here to render one heading would couple a
 * build to a sibling repository. Same arrangement as
 * gift/domain/giverPromiseMailCopy.ts.
 *
 * `h1` is deliberately not the `<title>`: the title is the front's own
 * prerendered one (the relay keeps the shell's head), and a heading that
 * repeats it word for word wastes the one on-page signal Google weighs most.
 */
export interface GallerySeoCopy {
  /** `<title>` text, without the site-name suffix. Must stay word for word
   * the front's `t.seo.galleryTitle`: the relay replaces the whole head, so
   * this is what a crawler reads for the same URL the front prerendered. */
  title: string;
  /** `<meta name="description">`, the front's `t.seo.galleryDesc`. */
  description: string;
  h1: string;
  intro: string;
  /** Accessible label on each card link, completed with the set's title. */
  view: string;
  /** Heading over the index, completed with the number of sets. */
  count: (total: number) => string;
  inStock: string;
  outOfStock: string;
  /** Heading over the related-sets links on a product page. */
  related: string;
}

export const GALLERY_SEO_COPY: Record<Language, GallerySeoCopy> = {
  fr: {
    title: 'Galerie de pieces artisanales',
    description:
      'Toute la collection de pieces faites main : formes, couleurs, formats. Filtre par occasion, forme et couleur pour trouver la tienne.',
    h1: 'Toutes les pieces artisanales faites main',
    intro:
      'Chaque piece est finie a la main dans l atelier Shop, puis expediee depuis la France. Filtre par occasion, forme et couleur pour trouver celle qui te ressemble.',
    view: 'Voir le set',
    count: (total) => `${total} sets disponibles`,
    inStock: 'En stock',
    outOfStock: 'Épuisé',
    related: 'Sets similaires',
  },
  en: {
    title: 'Gallery of handmade pieces',
    description:
      'Browse every handmade studio piece: shapes, colours, formats. Filter by occasion, shape and colour to find yours.',
    h1: 'Every handmade studio piece',
    intro:
      'Each piece is finished by hand in the Shop studio, then shipped from France. Filter by occasion, shape and colour to find the one that suits you.',
    view: 'View the set',
    count: (total) => `${total} sets available`,
    inStock: 'In stock',
    outOfStock: 'Sold out',
    related: 'Similar sets',
  },
};
