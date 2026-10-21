import type { GalleryPhoto, GrammaticalGender, PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import { toPhotoUrl } from './photoUrl.js';
import type { CopyContext } from '../domain/productCopy.js';

/**
 * The shape/length half of a GalleryItem: the localized vocabulary a set is
 * offered in, the gender of each of those words, and the photos filed under
 * each shape/length pair.
 *
 * Split out of products.ts's assembleItems, which owns the queries and the
 * rest of the row mapping. Everything here is pure: the rows come in already
 * fetched, so a second caller (or a test) can build the same maps without a
 * database.
 */

/** As products.ts selects them. `product_id` is that file's own grouping key
 * and is ignored here. */
export interface ShapeRow extends ShapeVocabularyRow {
  product_id: string;
}

export interface ShapeLengthRow extends ShapeLengthVocabularyRow {
  product_id: string;
}

export interface ShapeVocabularyRow {
  shape_key: string;
  label: PartialTrilingual;
  gender: Record<string, string>;
  attributive: PartialTrilingual;
}

export interface ShapeLengthVocabularyRow {
  shape_key: string;
  length_key: string;
  label: PartialTrilingual;
  gender: Record<string, string>;
}

export interface VariantPhotoRow {
  shape_key: string;
  length_key: string;
  small_path: string;
  modal_path: string;
}

export interface ProductVariants {
  shape: Record<string, string>;
  shapeGender: Record<string, GrammaticalGender>;
  shapeAttributive: Record<string, string>;
  lengthsByShape: Record<string, Record<string, string>>;
  lengthGenderByShape: Record<string, Record<string, GrammaticalGender>>;
  photosByShapeLength: Record<string, Record<string, GalleryPhoto[]>>;
}

/** One vocabulary word's gender in the request's language, narrowed to the
 * codes productCopy knows. An unknown or absent code becomes "unmarked",
 * which resolves every `$g{}` token to its first variant. */
export function readGender(raw: Record<string, string> | null, language: Language): GrammaticalGender {
  const value = raw?.[language];
  return value === 'm' || value === 'f' || value === 'n' || value === 'c' ? value : '';
}

export function buildProductVariants(
  shapeRows: ShapeVocabularyRow[],
  shapeLengthRows: ShapeLengthVocabularyRow[],
  photoRows: VariantPhotoRow[],
  publicMediaUrl: string,
  language: Language,
): ProductVariants {
  const variants: ProductVariants = {
    shape: {},
    shapeGender: {},
    shapeAttributive: {},
    lengthsByShape: {},
    lengthGenderByShape: {},
    photosByShapeLength: {},
  };
  for (const shapeRow of shapeRows) {
    const shapeKey = shapeRow.shape_key;
    variants.shape[shapeKey] = localize(shapeRow.label, language);
    variants.shapeGender[shapeKey] = readGender(shapeRow.gender, language);
    // A shape whose vocabulary predates the attributive form falls back to the
    // label, which is what the copy used before the distinction existed.
    variants.shapeAttributive[shapeKey] =
      localize(shapeRow.attributive, language) || variants.shape[shapeKey]!;
    variants.lengthsByShape[shapeKey] = {};
    variants.lengthGenderByShape[shapeKey] = {};
    variants.photosByShapeLength[shapeKey] = {};
    for (const lengthRow of shapeLengthRows.filter((row) => row.shape_key === shapeKey)) {
      const lengthKey = lengthRow.length_key;
      variants.lengthsByShape[shapeKey][lengthKey] = localize(lengthRow.label, language);
      variants.lengthGenderByShape[shapeKey][lengthKey] = readGender(lengthRow.gender, language);
      variants.photosByShapeLength[shapeKey][lengthKey] = photoRows
        .filter((photo) => photo.shape_key === shapeKey && photo.length_key === lengthKey)
        .map((photo) => ({
          small: toPhotoUrl(publicMediaUrl, photo.small_path),
          modal: toPhotoUrl(publicMediaUrl, photo.modal_path),
        }));
    }
  }
  return variants;
}

/** The shape and length a set is described by when nothing selects one: its
 * first shape and that shape's first length, the same default `firstPhotoUrl`
 * and the front's defaultShapeKey/defaultLengthKey apply. */
export function defaultCopyContext(variants: ProductVariants): CopyContext {
  const shapeKey = Object.keys(variants.shape)[0];
  if (!shapeKey) return {};
  const lengthKey = Object.keys(variants.lengthsByShape[shapeKey] ?? {})[0];
  return {
    shape: {
      label: variants.shape[shapeKey]!,
      gender: variants.shapeGender[shapeKey] ?? '',
      attributive: variants.shapeAttributive[shapeKey],
    },
    ...(lengthKey
      ? {
          length: {
            label: variants.lengthsByShape[shapeKey]![lengthKey]!,
            gender: variants.lengthGenderByShape[shapeKey]?.[lengthKey] ?? '',
          },
        }
      : {}),
  };
}
