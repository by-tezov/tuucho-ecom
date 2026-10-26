/** Which shape/length pairs a catalogue folder offers, and which of them are
 * hidden (tuucho/docs/plans/variant-visibility.md).
 *
 * - The folders are the only source of shapes and lengths: a pair is offered
 *   when `modal/<shape>/<length>/` holds a photo (or, for a single nail with
 *   variations, one of its `<option>/` subfolders does). Display order is the
 *   vocabulary's: shapes in data-common.json order, lengths in each shape's
 *   own `length` list order.
 * - Every key that names a vocabulary entry is written `$key` in the manager
 *   files; `unref`/`unrefKeys` strip it, and a bare key is still accepted
 *   while older files are migrated.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const IMAGE_RE = /\.(?:jpe?g|png|webp)$/i;

export function unref(key: string): string {
  return key.replace(/^\$/, '');
}

/** Strips the `$` of the object keys down to `depth` levels (1 = only the
 * top-level keys). Values below that depth are returned as they are. */
export function unrefKeys<T>(value: T, depth: number): T {
  if (depth <= 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      unref(key),
      unrefKeys(child, depth - 1),
    ]),
  ) as T;
}

/** Adds the `$` back to the keys down to `depth` levels, for files written
 * from the database (`--direction local`). */
export function refKeys<T>(value: T, depth: number): T {
  if (depth <= 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      `$${unref(key)}`,
      refKeys(child, depth - 1),
    ]),
  ) as T;
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function hasImages(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((name) => IMAGE_RE.test(name));
}

/** The pairs a folder offers, in vocabulary order. A folder name the
 * vocabulary does not know (shape, or length of that shape) is reported in
 * `ignored` and left out. */
export function folderShapeLengths(
  setDir: string,
  vocabShapes: Record<string, { length?: Record<string, unknown> }>,
): { shapeKeys: string[]; shapeLengths: Record<string, string[]>; ignored: string[] } {
  const modalDir = join(setDir, 'modal');
  const shapeFolders = new Set(subdirs(modalDir));
  const ignored = [...shapeFolders].filter((name) => !vocabShapes[name]).map((name) => `${name}/`);
  const shapeKeys: string[] = [];
  const shapeLengths: Record<string, string[]> = {};
  for (const [shapeKey, vocabShape] of Object.entries(vocabShapes)) {
    if (!shapeFolders.has(shapeKey)) continue;
    const vocabLengths = Object.keys(vocabShape.length ?? {});
    const lengthFolders = new Set(subdirs(join(modalDir, shapeKey)));
    for (const name of lengthFolders) {
      if (!vocabLengths.includes(name)) ignored.push(`${shapeKey}/${name}/`);
    }
    const lengths = vocabLengths.filter((lengthKey) => {
      if (!lengthFolders.has(lengthKey)) return false;
      const dir = join(modalDir, shapeKey, lengthKey);
      return hasImages(dir) || subdirs(dir).some((option) => hasImages(join(dir, option)));
    });
    if (lengths.length === 0) continue;
    shapeKeys.push(shapeKey);
    shapeLengths[shapeKey] = lengths;
  }
  return { shapeKeys, shapeLengths, ignored };
}

export interface HiddenPair {
  shapeKey: string;
  lengthKey: string;
}

/** data-static.json `hidden`: `true`/`false` for the whole product, or
 * `{ "$shape": true }` / `{ "$shape": { "$length": true } }` for part of it.
 * Anything not written is visible. Returns an error for a key that is not
 * one of the product's pairs, or a value that is neither boolean nor object. */
export function parseHidden(
  raw: unknown,
  shapeLengths: Record<string, string[]>,
): { hidden: boolean; hiddenShapeLengths: HiddenPair[] } | { error: string } {
  if (raw === undefined || raw === null || raw === false) return { hidden: false, hiddenShapeLengths: [] };
  if (raw === true) return { hidden: true, hiddenShapeLengths: [] };
  if (typeof raw !== 'object' || Array.isArray(raw))
    return { error: '"hidden" must be true, false or an object' };
  const pairs: HiddenPair[] = [];
  for (const [shapeRef, value] of Object.entries(raw as Record<string, unknown>)) {
    const shapeKey = unref(shapeRef);
    const lengths = shapeLengths[shapeKey];
    if (!lengths)
      return { error: `"hidden" names shape "${shapeRef}", which is not one of this product's folders` };
    if (value === true) {
      pairs.push(...lengths.map((lengthKey) => ({ shapeKey, lengthKey })));
      continue;
    }
    if (value === false) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { error: `"hidden.${shapeRef}" must be true, false or an object of lengths` };
    }
    for (const [lengthRef, flag] of Object.entries(value as Record<string, unknown>)) {
      const lengthKey = unref(lengthRef);
      if (!lengths.includes(lengthKey)) {
        return {
          error: `"hidden.${shapeRef}" names length "${lengthRef}", which is not one of that shape's folders`,
        };
      }
      if (typeof flag !== 'boolean')
        return { error: `"hidden.${shapeRef}.${lengthRef}" must be true or false` };
      if (flag) pairs.push({ shapeKey, lengthKey });
    }
  }
  return { hidden: false, hiddenShapeLengths: pairs };
}

/** The `hidden` value written back from the database: `true` for the whole
 * product, else the shortest object form (a whole shape as `true`), else
 * absent. */
export function hiddenToStatic(
  hidden: boolean,
  hiddenShapeLengths: HiddenPair[],
  shapeLengths: Record<string, string[]>,
): true | Record<string, true | Record<string, true>> | undefined {
  if (hidden) return true;
  if (hiddenShapeLengths.length === 0) return undefined;
  const byShape = new Map<string, string[]>();
  for (const { shapeKey, lengthKey } of hiddenShapeLengths) {
    byShape.set(shapeKey, [...(byShape.get(shapeKey) ?? []), lengthKey]);
  }
  const out: Record<string, true | Record<string, true>> = {};
  for (const [shapeKey, lengths] of byShape) {
    const all = shapeLengths[shapeKey] ?? [];
    out[`$${shapeKey}`] =
      all.length > 0 && all.every((lengthKey) => lengths.includes(lengthKey))
        ? true
        : Object.fromEntries(lengths.map((lengthKey) => [`$${lengthKey}`, true as const]));
  }
  return out;
}

/** Stable comparison form of a hidden pair list. */
export function hiddenPairsKey(pairs: HiddenPair[]): string {
  return pairs
    .map(({ shapeKey, lengthKey }) => `${shapeKey}/${lengthKey}`)
    .sort()
    .join(',');
}
