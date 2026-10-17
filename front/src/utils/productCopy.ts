import type { GalleryItem, GrammaticalGender } from '../data/types';

/**
 * Mirror of pamsurin-back's `src/modules/catalog/domain/productCopy.ts`.
 *
 * A set is offered in one or more shapes, so its authored description and alt
 * text write `$shape.title` (the chip label a filter button shows: « carré »,
 * "vierkant") or `$shape.attributive` (the form a sentence takes with the plural word
 * for "nails": « ongles carrés », "vierkante nagels") rather than a shape word, and mark whatever has to agree with it as
 * `$g{masculin|féminin}`. The API sends `desc`/`alt` already
 * resolved against the set's default shape, which is all the gallery cards
 * need; this page has a shape picker, so it resolves `descTemplate` /
 * `altTemplate` itself and the sentence follows the picker.
 *
 * Deliberately a mirror rather than shared code: the two repositories publish
 * separately, and the grammar is a handful of rules that both sides must
 * agree on anyway. The contract (`api/contract/gallery-data.ts`) is what keeps
 * them honest about the data.
 */

/** Masculine, feminine, neuter, then common gender falling back on the
 * unmarked (first) variant. */
const VARIANT_INDEX: Record<GrammaticalGender, number> = { m: 0, f: 1, n: 2, c: 0, '': 0 };

export interface CopyTerm {
  label: string;
  gender: GrammaticalGender;
  /** The form used with the plural word for "nails": « carrés » where `label`
   * is « carré », "vierkante" where it is "vierkant". Substituting the label
   * into a sentence gives « ongles carré », which is why this exists. */
  attributive?: string;
}

export interface CopyContext {
  shape?: CopyTerm;
  length?: CopyTerm;
}

const AGREEMENT_PATTERN = /\$(gl?)\{([^{}]*)\}/g;
const TERM_PATTERN = /\$(Shape|shape|Length|length)\.(title|attributive)\b/g;

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toLocaleUpperCase() + value.slice(1) : value;
}

function pickVariant(raw: string, gender: GrammaticalGender | undefined): string {
  const variants = raw.split('|');
  return variants[VARIANT_INDEX[gender ?? ''] ?? 0] ?? variants[0] ?? '';
}

/** Never throws: a set whose copy holds a stray `$g{` renders as written
 * rather than blanking the page. */
export function resolveProductCopy(text: string, context: CopyContext): string {
  if (!text) return text;
  return text
    .replace(AGREEMENT_PATTERN, (_match, kind: string, body: string) =>
      pickVariant(body, kind === 'gl' ? context.length?.gender : context.shape?.gender),
    )
    .replace(TERM_PATTERN, (_match, token: string, field: string) => {
      const term = token.toLowerCase() === 'shape' ? context.shape : context.length;
      const word = field === 'attributive' ? (term?.attributive ?? term?.label ?? '') : (term?.label ?? '');
      return token[0] === token[0]?.toUpperCase() ? capitalize(word) : word;
    })
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

/** The copy context for one set under a given shape and length. Falls back to
 * the set's first shape and that shape's first length, which is the default
 * the API itself resolved `desc`/`alt` against. */
export function copyContextFor(item: GalleryItem, shapeKey?: string, lengthKey?: string): CopyContext {
  const shapes = item.shape ?? {};
  const shape = shapeKey && shapes[shapeKey] ? shapeKey : Object.keys(shapes)[0];
  if (!shape) return {};
  const lengths = item.lengthsByShape?.[shape] ?? {};
  const length = lengthKey && lengths[lengthKey] ? lengthKey : Object.keys(lengths)[0];
  return {
    shape: {
      label: shapes[shape]!,
      gender: item.shapeGender?.[shape] ?? '',
      attributive: item.shapeAttributive?.[shape] ?? shapes[shape]!,
    },
    ...(length
      ? { length: { label: lengths[length]!, gender: item.lengthGenderByShape?.[shape]?.[length] ?? '' } }
      : {}),
  };
}

/** The description to print for the shape and length currently selected. */
export function productDesc(item: GalleryItem, shapeKey?: string, lengthKey?: string): string {
  if (!item.descTemplate) return item.desc;
  return resolveProductCopy(item.descTemplate, copyContextFor(item, shapeKey, lengthKey));
}

/** The image alt text for the shape and length currently selected, or null
 * when the set has none authored. */
export function productAlt(item: GalleryItem, shapeKey?: string, lengthKey?: string): string | null {
  if (!item.altTemplate) return item.alt;
  return resolveProductCopy(item.altTemplate, copyContextFor(item, shapeKey, lengthKey));
}
