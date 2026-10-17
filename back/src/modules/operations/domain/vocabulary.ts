/**
 * The shared shape/colour vocabulary as pamsurin-manager authors it in
 * data-common.json, which is also the body POST /operation/library-import
 * /vocabulary accepts and GET returns.
 *
 * Its own module rather than part of libraryImport.ts: these are the import
 * contract's value types, with no SQL or Express in them, and the router
 * parses request bodies against them without pulling in the whole importer.
 */
import type { PartialTrilingual } from '../../../types.js';

/** Grammatical gender of a vocabulary word, per language — `{"fr": "f",
 * "en": ""}`. Resolved against the `$g{}` agreement token in authored product
 * copy (see catalog/domain/productCopy.ts); an absent language falls back to
 * the unmarked variant. Empty when pamsurin-manager has not declared any. */
export type VocabularyGender = Record<string, string>;

/** One length of one shape in the shared vocabulary — `value` is the
 * physical length as free-form text (e.g. "16"), `title` its translated
 * display name. Mirrors pamsurin-manager's data-common.json. */
export interface ShapeLengthVocabularyEntry {
  value: string;
  title: PartialTrilingual;
  gender?: VocabularyGender;
}

export interface ShapeVocabularyEntry {
  title: PartialTrilingual;
  length: Record<string, ShapeLengthVocabularyEntry>;
  gender?: VocabularyGender;
  /** The form a sentence uses with the plural word for "nails" — « ongles
   * carrés », "vierkante nagels", "unhas quadradas" — as opposed to `title`,
   * which is the chip label ("carré", "vierkant"). Optional; absent falls
   * back to the label. */
  attributive?: PartialTrilingual;
}
