/** Mirrors kernel/front's src/data/types.ts exactly — the public API
 * returns GalleryItem[] in this shape so the front-side integration is a
 * near-drop-in swap (see the plan doc's "Public API" / "Front integration"
 * sections). Keep these two definitions in sync by hand; there's no shared
 * package between the two repos. */

/** Set by requireAuth.ts once a request's access token has been verified. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  /** The signed-in administrator when this is an impersonation token. */
  impersonatorId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/** Both shapes go out verbatim inside a GalleryItem, so the API contract owns
 * them and the front is typed against the same declaration. */
import type {
  FeaturedPeriod,
  GalleryPhoto,
  GalleryVariation,
  GrammaticalGender,
} from './contract/gallery-data.js';

export type { FeaturedPeriod, GalleryPhoto, GalleryVariation };
export type { GrammaticalGender };

export type Size = 'XS' | 'S' | 'M' | 'L';

export interface GalleryItem {
  id: string;
  occasion: string;
  shape: Record<string, string>;
  /** Grammatical gender of each shape label in the response's language, for
   * the `$g{}` agreement token in `descTemplate`/`altTemplate` (see
   * catalog/domain/productCopy.ts). Empty string when the language does not
   * mark gender on that word. Same keys as `shape`. */
  shapeGender: Record<string, GrammaticalGender>;
  /** The form used with the plural word for "nails" (« ongles carrés »), where
   * `shape` holds the chip label (« carré »). Resolves `$shape.attributive`. */
  shapeAttributive: Record<string, string>;
  /** The lengths each shape is offered in, keyed shape → length key →
   * localized label. Same key insertion order rule as `shape`: the first
   * length of a shape is its default. Every shape in `shape` has an entry
   * here with at least one length. Nothing in the UI lets a visitor pick a
   * length yet — the front always uses the first one — but cart, order and
   * stock are already keyed by it. */
  lengthsByShape: Record<string, Record<string, string>>;
  /** Gender of each length label, same keys as `lengthsByShape`. */
  lengthGenderByShape: Record<string, Record<string, GrammaticalGender>>;
  colorMain: string[];
  colorSecondary: string[];
  title: string;
  /** Resolved against the set's default shape and length, so a caller with no
   * shape picker can print it as is. */
  desc: string;
  /** `desc` as authored, placeholders intact. A caller that lets the visitor
   * pick a shape resolves this itself against the selected one, otherwise the
   * sentence keeps naming the default shape after the picker moves. */
  descTemplate: string;
  /** Authored image alt text, resolved to the request's language — null
   * until catalog source's generation pass has produced one for this set
   * (older/not-yet-regenerated sets). The front falls back to a generated
   * string (title-based) when this is null. */
  alt: string | null;
  /** `alt` as authored, placeholders intact. Same contract as
   * `descTemplate`. */
  altTemplate: string | null;
  /** Ordered photos per shape *and* length — same keys as `shape` and
   * `lengthsByShape`. */
  photosByShapeLength: Record<string, Record<string, GalleryPhoto[]>>;
  productUid: string;
  /** True only for a product assigned to the authenticated visitor. Never
   * present in public/prerendered catalogue responses. */
  isUserLibrary?: boolean;
  featured?: FeaturedPeriod;
  isFeatured: boolean;
  /** Current price (TTC) — undefined for a set with no price history yet
   * (e.g. imported before catalog source's "price" data-static.json key
   * existed). */
  price?: number;
  /** Quantity in stock per shape/length/size, from catalog source's
   * data-static.json "available" key. A shape, length or size missing here
   * means 0 in stock, no exceptions — a variant that's never been annotated
   * at all is 0 in stock, not unlimited (see availability.service.ts's
   * getAvailableQuantity and kernel/front's src/utils/availability.ts,
   * which both apply this same rule and must stay in sync with each
   * other). Only ever keyed by shape/length pairs also present in `shape` /
   * `lengthsByShape` (see product_availability's FK onto
   * product_shape_lengths) — a variant with stock recorded but not offered
   * in the gallery is never shown to a customer, by construction, not by
   * filtering here. */
  available: Record<string, Record<string, Partial<Record<Size, number>>>>;
  /** Single nails with variations; see contract/gallery-data.ts. */
  variation?: GalleryVariation;
  initialVariation?: string;
  photosByVariation?: Record<string, Record<string, Record<string, GalleryPhoto[]>>>;
  availableByOption?: Record<string, Record<string, Record<string, Partial<Record<Size, number>>>>>;
}

/** Catalog copy stored on products and related rows. Product languages are
 * English and French only. */
export interface PartialTrilingual {
  en?: string;
  fr?: string;
}
