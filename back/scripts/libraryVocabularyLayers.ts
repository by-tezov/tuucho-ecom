import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Layered vocabulary for the library CLIs (docs/plans/nail-variations.md).
 *
 * pamsurin-manager keeps a root `product/data-common.json` (shape, length,
 * color) and each catalogue folder may add its own `data-common.json`
 * (`product/library-nail/data-common.json` holds the variation axes). The
 * effective vocabulary of a catalogue is the root merged with that
 * catalogue's file, per table then per key. A key defined at both levels is
 * an error: the backend tables are global, two definitions would fight over
 * one row.
 *
 * Values may also be references, `"$color.pink"`: the entry at that path of
 * the effective vocabulary (never inside `variation` itself, never another
 * reference). They are resolved here, so the API only ever receives plain
 * translations.
 */

type Json = Record<string, unknown>;

export interface LayeredDataCommon {
  /** Merged tables, references still unresolved. */
  tables: Record<string, Json>;
  /** Which file each `table.key` came from, for error messages. */
  origin: Record<string, string>;
}

function readJson(path: string): Json | undefined {
  if (!existsSync(path)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path}: expected a JSON object.`);
  }
  return parsed as Json;
}

/** Root `<product>/data-common.json` merged with `<sourceDir>/data-common.json`. */
export function readLayeredDataCommon(sourceDir: string): LayeredDataCommon {
  const rootPath = join(dirname(sourceDir), 'data-common.json');
  const catalogPath = join(sourceDir, 'data-common.json');
  const tables: Record<string, Json> = {};
  const origin: Record<string, string> = {};
  for (const path of [rootPath, catalogPath]) {
    const layer = readJson(path);
    if (!layer) continue;
    for (const [table, entries] of Object.entries(layer)) {
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
      const merged = (tables[table] ??= {});
      for (const [key, value] of Object.entries(entries as Json)) {
        const id = `${table}.${key}`;
        if (origin[id]) {
          throw new Error(
            `data-common: "${id}" is defined in both ${origin[id]} and ${path}; keep it in one file only.`,
          );
        }
        merged[key] = value;
        origin[id] = path;
      }
    }
  }
  return { tables, origin };
}

type Translation = Record<string, string>;

function isTranslation(value: unknown): value is Translation {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Json).every((entry) => typeof entry === 'string')
  );
}

/** Resolves a `"$table.key(.sub…)"` reference against the merged tables. */
export function resolveVocabularyRef(layers: LayeredDataCommon, ref: string, where: string): Translation {
  const path = ref.replace(/^\$/, '').split('.');
  if (path.length < 2 || path.some((part) => !part)) {
    throw new Error(`data-common: ${where} reference "${ref}" must look like "$table.key".`);
  }
  if (path[0] === 'variation') {
    throw new Error(`data-common: ${where} reference "${ref}" cannot point into the variation table.`);
  }
  let node: unknown = layers.tables;
  for (const part of path) {
    node = node && typeof node === 'object' ? (node as Json)[part] : undefined;
  }
  if (typeof node === 'string') {
    throw new Error(`data-common: ${where} reference "${ref}" points at another reference.`);
  }
  if (!isTranslation(node)) {
    throw new Error(`data-common: ${where} reference "${ref}" does not resolve to translations.`);
  }
  return node;
}

function resolveValue(layers: LayeredDataCommon, value: unknown, where: string): Translation {
  if (typeof value === 'string') return resolveVocabularyRef(layers, value, where);
  if (!isTranslation(value)) throw new Error(`data-common: ${where} must be translations or a "$table.key" reference.`);
  return value;
}

/** The wire form of the `variation` table (see the API's
 * libraryVariationVocabulary.ts), references resolved, option order kept. */
export type VariationVocabulary = Record<
  string,
  { title: Translation; options: Array<{ key: string; title: Translation }> }
>;

export function resolveVariationVocabulary(layers: LayeredDataCommon): VariationVocabulary | undefined {
  const table = layers.tables.variation;
  if (!table) return undefined;
  const result: VariationVocabulary = {};
  for (const [axisKey, rawAxis] of Object.entries(table)) {
    if (!rawAxis || typeof rawAxis !== 'object' || Array.isArray(rawAxis)) {
      throw new Error(`data-common: variation.${axisKey} must be an object with "title" and "option".`);
    }
    const axis = rawAxis as { title?: unknown; option?: unknown };
    const options = axis.option && typeof axis.option === 'object' ? (axis.option as Json) : {};
    result[axisKey] = {
      title: resolveValue(layers, axis.title, `variation.${axisKey}.title`),
      options: Object.entries(options).map(([key, value]) => ({
        key,
        title: resolveValue(layers, value, `variation.${axisKey}.option.${key}`),
      })),
    };
  }
  return result;
}
