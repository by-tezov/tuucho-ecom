/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/catalog.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

export interface AdminLibraryStockRow {
  productUid: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  price: number | null;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  sizes: { XS: number; S: number; M: number; L: number };
  total: number;
  stockValue: number | null;
  /** The whole product is hidden. */
  hidden: boolean;
  /** This shape/length alone is hidden (docs/plans/variant-visibility.md). */
  variantHidden: boolean;
  /** Last day of the "Nouveautés" window, `YYYY-MM-DD`, or null when the set
   * is not currently featured. Derived from `featured_from` + `featured_for`;
   * a window that has already elapsed reads as null. */
  featuredUntil: string | null;
}

export interface AdminAccessoryStockRow {
  productUid: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  type: 'default' | 'byQuantity';
  packs: Record<string, number>;
  unitPrice: number | null;
  packPrices: Record<string, number> | null;
  available: number;
  stockValue: number | null;
  hidden: boolean;
}

export interface AdminUserLibraryStockRow {
  productUid: string;
  title: string;
  thumbnail: string | null;
  createdAt: string;
  price: number | null;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  lengthLabel: string;
  sizes: { XS: number; S: number; M: number; L: number };
  total: number;
  stockValue: number | null;
  /** The whole product is hidden. */
  hidden: boolean;
  /** This shape/length alone is hidden. */
  variantHidden: boolean;
  owners: string[];
}

/** Which catalogue the admin JSON editor targets. */
export type AdminCatalogueKind = 'library' | 'user-library' | 'nail' | 'accessory';

/** Manager-shaped product document (keys like `product-uid`, `$almond`, …). */
export type AdminCatalogueDocument = Record<string, unknown>;

/** Thumbnail strip entry for the product editor (not part of the JSON). */
export interface AdminCataloguePhotoPreview {
  photo: string;
  shapeKey: string;
  lengthKey: string;
  variationKey: string;
  hash: string;
  small: string;
  modal: string;
}
