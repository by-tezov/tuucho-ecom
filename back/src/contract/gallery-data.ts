/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/gallery-data.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

export type FilterCategory = 'occasion' | 'shape' | 'length' | 'size';

/** Used only by static front-end dictionaries (for example filter controls).
 * API payloads deliberately use a single localized string instead. */
export interface Trilingual {
  fr: string;
  en: string;
  th: string;
  es: string;
  it: string;
  nl: string;
  pt: string;
}

export interface GalleryPhoto {
  /** small, thumbnail-sized image shown in the grid/carousel */
  small: string;
  /** full-size image shown in the lightbox — only ever requested when the lightbox opens */
  modal: string;
}

/** A date-only, time-zone-independent period during which a set is featured
 * on the home page. `from` uses YYYY-MM-DD and `for` is a positive number of
 * days. */
export interface FeaturedPeriod {
  from: string;
  for: number;
}

/** Grammatical gender of a vocabulary word in the response's language.
 * `'c'` is Dutch common gender (`de`); an empty string means the language
 * does not mark gender on that word, and resolves like the masculine. Used to
 * pick between the variants of a `$g{}` token in a set's authored copy. */
export type GrammaticalGender = 'm' | 'f' | 'n' | 'c' | '';

export interface GalleryItem {
  id: string;
  occasion: string;
  /** One entry per shape this design is offered in, keyed by the shape's
   * English word (e.g. "almond", "square" — a closed vocabulary living in
   * pamsurin-back's `shapes` DB table, originally seeded from
   * pamsurin-manager's data-common.json); each entry's own `.fr` carries the
   * French display text. Key insertion order is the display order for the
   * shape chips; the first key is the default/active shape. Every key here
   * has a matching entry in `lengthsByShape` and `photosByShapeLength` (see
   * src/api/gallery.ts, which just relays what pamsurin-back's API already
   * resolved). */
  shape: Record<string, string>;
  /** Gender of each shape label, same keys as `shape`. Needed to resolve the
   * `$g{}` agreement token in `descTemplate`/`altTemplate`. */
  shapeGender: Record<string, GrammaticalGender>;
  /** The form a sentence uses with the plural word for "nails" — « ongles
   * carrés », "vierkante nagels", "unhas quadradas" — where `shape` holds the
   * chip label ("carré", "vierkant"). Authored copy writes `$shape.attributive` for it;
   * falls back to the label when the vocabulary declares none. Same keys as
   * `shape`. */
  shapeAttributive: Record<string, string>;
  /** The lengths each shape is offered in, keyed shape → length key →
   * localized label. Same insertion-order rule as `shape`: the first length
   * of a shape is its default, and every shape has at least one. Shown as
   * `LengthTag`'s chip/dropdown on the gallery card, zoom modal, and cart —
   * `defaultLengthKey` (src/data/galleryShape.ts) only supplies the initial
   * value where no picker exists (e.g. a read-only preview). */
  lengthsByShape: Record<string, Record<string, string>>;
  /** Gender of each length label, same keys as `lengthsByShape`. */
  lengthGenderByShape: Record<string, Record<string, GrammaticalGender>>;
  /** the genuinely dominant color(s) — usually one, sometimes more. Used for
   * the color filter and search; can be empty until filled in. */
  colorMain: string[];
  /** every other color visible but not dominant (accents, small details).
   * Used for the secondary color filter — always OR-matched, no AND toggle. */
  colorSecondary: string[];
  title: string;
  /** The authored description with its `$shape.title`/`$g{}` placeholders already
   * resolved against the set's default shape and length (its first, the same
   * default the first photo follows), so a caller with no shape picker can
   * print it as is. */
  desc: string;
  /** `desc` as authored. A caller that lets the visitor change shape resolves
   * this itself against the selected one (see `src/utils/productCopy.ts` on
   * the front, `catalog/domain/productCopy.ts` on the back), otherwise the
   * sentence keeps describing the shape the visitor moved away from. */
  descTemplate: string;
  /** Authored image alt text, resolved to the current language — null
   * until pamsurin-manager's generation pass has produced one for this set
   * (older sets never regenerated). Callers fall back to a generated
   * string (e.g. `${t.gallery.altPrefix}${title}`) when this is null. */
  alt: string | null;
  /** `alt` as authored, placeholders intact. Same contract as
   * `descTemplate`; null exactly when `alt` is. */
  altTemplate: string | null;
  /** ordered photos per shape *then* length (same keys as `shape` and
   * `lengthsByShape`) — each entry always has at least one photo. The
   * physical capsules differ in shape and length even when the
   * design/color/pattern is identical, so each variant gets its own photos
   * rather than sharing one flat list. */
  photosByShapeLength: Record<string, Record<string, GalleryPhoto[]>>;
  /** user-friendly unique identifier (e.g. "7K4M-QZ2R"), generated by
   * pamsurin-back on product create/import. */
  productUid: string;
  /** Assigned to the current signed-in customer; never present in the public feed. */
  isUserLibrary?: boolean;
  /** Present only while the set's `featured` period is active. */
  featured?: FeaturedPeriod;
  isFeatured: boolean;
  /** Current price (TTC, euros) — undefined if none set yet. */
  price?: number;
  /** Quantity in stock per shape/length/size, from pamsurin-manager's
   * data-static.json "available" key (relayed as-is from pamsurin-back's
   * product_availability). A shape, length or size missing here means 0 in
   * stock, no exceptions — a variant that's never been annotated at all is
   * 0 in stock too, not unlimited. Always read this through
   * src/utils/availability.ts's availableQuantityFor/availableSizesFor
   * rather than indexing it directly, so every size selector applies the
   * same rule. Only ever keyed by shape/length pairs also present in
   * `shape`/`lengthsByShape` — a variant with stock but not offered in the
   * gallery is never surfaced to a customer. */
  available: Record<string, Record<string, Partial<Record<'XS' | 'S' | 'M' | 'L', number>>>>;
  /** Single nails with a variation axis (docs/plans/nail-variations.md):
   * the axis and its options in display order. Absent otherwise. The item
   * opens on `initialVariation`, else the first option: `photosByShapeLength`
   * and the top-level copy and colours are that option's. */
  variation?: GalleryVariation;
  /** The option the item opens on when it is not the first one: asked for by
   * `?variation=` or matched by the occasion filter. */
  initialVariation?: string;
  /** Photos per shape → length → option, only with `variation`. */
  photosByVariation?: Record<string, Record<string, Record<string, GalleryPhoto[]>>>;
  /** Offer per option → shape → length → size (1 = offered), only with
   * `variation`. `available` stays the union over options. */
  availableByOption?: Record<
    string,
    Record<string, Record<string, Partial<Record<'XS' | 'S' | 'M' | 'L', number>>>>
  >;
}

/** A single nail's variation axis ("Couleur") and its options. Each option
 * is its own product for everything a visitor reads
 * (docs/plans/nail-variation-copy.md): same fields and meaning as the item's
 * top-level ones. */
export interface GalleryVariation {
  key: string;
  label: string;
  options: GalleryVariationOption[];
}

export interface GalleryVariationOption {
  key: string;
  label: string;
  /** Overrides the item's `price` for this option. */
  price?: number;
  title: string;
  desc: string;
  descTemplate: string;
  alt: string | null;
  altTemplate: string | null;
  occasion: string;
  colorMain: string[];
  colorSecondary: string[];
}
