import raw from '../assets/i18n/data/guide-capsule-length.json';
import { CAPSULE_LENGTH_KEYS, type CapsuleLengthKey } from './capsuleLengths';
import type { CapsuleFormKey } from './capsuleForms';

/** A capsule's length in mm: a base value plus or minus a variation, one
 *  per shape/length, no per-finger or per-size breakdown. */
export interface CapsuleLengthRange {
  base: number;
  variation: number;
}

type LengthTable = Partial<Record<CapsuleFormKey, Partial<Record<CapsuleLengthKey, CapsuleLengthRange>>>>;

const table = raw as LengthTable;

/** Shape order of the JSON's top-level keys. The capsules page (shape cards,
 *  hero carousel, table rows) follows it, so reordering the JSON reorders
 *  the page. */
export const shapeOrder = Object.keys(table) as CapsuleFormKey[];

/** Length tags that appear anywhere in the table — a length missing for
 *  every shape has no data left to show, so remove an entry from the JSON
 *  to drop its column from the page. */
export const availableLengths: CapsuleLengthKey[] = CAPSULE_LENGTH_KEYS.filter((length) =>
  Object.values(table).some((lengths) => lengths?.[length] !== undefined),
);

/** "22 ± 2" for one shape/length, or undefined when the JSON has no entry
 *  for that combo yet. */
export function lengthTextFor(shape: CapsuleFormKey, length: CapsuleLengthKey): string | undefined {
  const range = table[shape]?.[length];
  return range ? `${range.base} ± ${range.variation}` : undefined;
}
