/**
 * The placeholder language used inside a set's authored copy
 * (`products.title`, `"desc"`, `alt`), and its resolution against the shape
 * and length a page is actually showing.
 *
 * Why it exists: a set is offered in one or more shapes (`product_shapes`)
 * and, inside each, one or more lengths. The generated copy opens on the
 * shape ("Amande brillante violette, ..."), so the moment a set ships in two
 * shapes that sentence is false on one of them, and so is the `<meta>` tag
 * built from it. Authored copy therefore writes `$shape.title` and lets the
 * renderer put the right word in.
 *
 * Substituting the label alone is not enough: what follows has to agree with
 * it. The gender is a property of the word and differs by language, so it is
 * declared beside the label in the vocabulary (`shapes.gender`,
 * `shape_lengths.gender`) and the copy marks the agreeing words with `$g{}`.
 *
 * There are exactly two shape forms, not a numbered series: `$shape.title` is the
 * chip label a filter button shows (« carré », "vierkant"), `$shape.attributive` the
 * form a sentence takes with the plural word for "pieces" (« pieces carrées »,
 * "vierkante nagels", "unhas quadradas"). Which one a sentence needs depends
 * on where the word sits in it.
 *
 * The `$` prefix is the convention `data-common.json` already uses for its
 * own references (`$short`, `$medium`, `$long`).
 *
 * Tokens:
 *
 * | Token                 | Resolves to                                 |
 * | --------------------- | ------------------------------------------- |
 * | `$shape.title`        | the shape label, the one a filter chip shows |
 * | `$shape.attributive`  | the form a sentence takes, « pieces carrées » |
 * | `$length.title`       | the length label                             |
 * | `$g{a\|b}`            | `a` or `b`, by the shape's gender            |
 * | `$gl{a\|b}`           | same, by the length's gender                 |
 *
 * Capitalize the word part to capitalize what is rendered: `$Shape.title`,
 * `$Shape.attributive`. The token names the vocabulary field it reads, so
 * there is no mapping to remember.
 *
 * A variant list is read as masculine, feminine, neuter, in that order. A
 * language that does not mark gender on the word (English, Thai), an unknown
 * gender, or a list too short for the resolved gender all fall back to the
 * first variant, which is why the generator is told to write the most neutral
 * form first.
 *
 * Nothing here throws on malformed input: this runs on the rendering path of
 * every catalogue page, and a set whose copy has a stray `$g{` must render as
 * written rather than take the page down.
 */

import type { GrammaticalGender } from '../../../contract/gallery-data.js';

export type { GrammaticalGender };

/** Index into a `$g{}` variant list, per gender. Common gender indexes the
 * same slot as masculine: Dutch marks the `de`/`het` distinction, and `de`
 * words are the unmarked case the first variant is written for. */
const VARIANT_INDEX: Record<GrammaticalGender, number> = { m: 0, f: 1, n: 2, c: 0, '': 0 };

export interface CopyTerm {
  label: string;
  gender: GrammaticalGender;
  /** The form used with the plural word for "nails": « carrés » where `label`
   * is « carré », "vierkante" where it is "vierkant". Substituting the label
   * into a sentence gives « pieces carré », which is why this exists.
   * Defaults to `label` when the vocabulary declares none. */
  attributive?: string;
}

export interface CopyContext {
  /** The shape the page is showing. Absent only for a surface that has no
   * shape at all (an accessory), where `$shape.title` resolves to nothing. */
  shape?: CopyTerm;
  length?: CopyTerm;
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0]!.toLocaleUpperCase() + value.slice(1) : value;
}

function pickVariant(raw: string, gender: GrammaticalGender | undefined): string {
  const variants = raw.split('|');
  const index = VARIANT_INDEX[gender ?? ''] ?? 0;
  return variants[index] ?? variants[0] ?? '';
}

/** `$g{...}` / `$gl{...}`. The body is deliberately `[^{}]*`: variants are
 * plain words, and refusing to match a nested brace keeps a malformed token
 * from swallowing the rest of the sentence. */
const AGREEMENT_PATTERN = /\$(gl?)\{([^{}]*)\}/g;
const TERM_PATTERN = /\$(Shape|shape|Length|length)\.(title|attributive)\b/g;

/**
 * Resolves every placeholder in one authored string.
 *
 * Whitespace is tidied afterwards because a term resolving to nothing (a
 * surface with no shape) would otherwise leave a double space or a space
 * before a comma.
 */
export function resolveProductCopy(text: string, context: CopyContext): string {
  if (!text) return text;
  const withAgreement = text.replace(AGREEMENT_PATTERN, (_match, kind: string, body: string) =>
    pickVariant(body, kind === 'gl' ? context.length?.gender : context.shape?.gender),
  );
  const withTerms = withAgreement.replace(TERM_PATTERN, (_match, token: string, field: string) => {
    const term = token.toLowerCase() === 'shape' ? context.shape : context.length;
    // The token names the vocabulary field it reads, so there is nothing to
    // remember: `.title` is the chip label, `.attributive` the form a
    // sentence takes. A length declares no attributive form and falls back.
    const word = field === 'attributive' ? (term?.attributive ?? term?.label ?? '') : (term?.label ?? '');
    return token[0] === token[0]?.toUpperCase() ? capitalize(word) : word;
  });
  return withTerms
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}
