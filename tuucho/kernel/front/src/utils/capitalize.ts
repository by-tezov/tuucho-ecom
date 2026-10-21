/** Capitalizes the first letter of the string and of each hyphenated part
 * ("saint-valentin" -> "Saint-Valentin") — used where CSS text-transform
 * can't be trusted, e.g. native <option> elements, whose rendering of
 * text-transform is inconsistent across browsers. Safe to apply to any
 * language: a no-op on already-capitalized text (English labels) and on
 * Thai (no case). */
export function capitalize(value: string): string {
  return value.replace(/(^|-)(\p{L})/gu, (_match, sep: string, letter: string) => sep + letter.toUpperCase());
}
