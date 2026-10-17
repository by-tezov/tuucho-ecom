/** One piece of the admin vocabulary page: a library shape, length or colour,
 * or a nail variation title or option. */
import { LANGUAGES } from '../../../utils/language.js';

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANG = /^[a-z]{2}$/;
const GENDERS = new Set(['m', 'f', 'n', 'c', '']);

export class VocabularyEditError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(status: 400 | 404 | 409, message: string) {
    super(message);
    this.name = 'VocabularyEditError';
    this.status = status;
  }
}

export type LibraryPart = 'shape' | 'length' | 'color';

export interface VocabularyTranslation {
  fr: string;
  en?: string;
  th?: string;
  es?: string;
  it?: string;
  nl?: string;
  pt?: string;
}

export interface ShapePart {
  title: VocabularyTranslation;
  gender: Record<string, string>;
  attributive: VocabularyTranslation;
  /** Length keys, `$` already removed, in the order the document listed them. */
  lengths: string[];
}

export interface LengthPart {
  value: string;
  title: VocabularyTranslation;
  gender: Record<string, string>;
}

export function parseVocabularyKey(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (!KEY.test(key) || key.length > 64) {
    throw new VocabularyEditError(400, 'Key must be lowercase letters, digits and hyphens.');
  }
  return key;
}

export function parseLibraryPart(raw: string): LibraryPart {
  if (raw === 'shape' || raw === 'length' || raw === 'color') return raw;
  throw new VocabularyEditError(404, 'Unknown vocabulary part.');
}

export function parseShapePart(raw: unknown): ShapePart {
  const record = objectRecord(raw);
  return {
    title: parseTranslation(record.title, 'title.fr'),
    gender: parseGender(record.gender),
    attributive: parseTranslation(record.attributive, 'attributive.fr'),
    lengths: parseLengthRefs(record.length),
  };
}

export function parseLengthPart(raw: unknown): LengthPart {
  const record = objectRecord(raw);
  if (record.value != null && typeof record.value !== 'string') {
    throw new VocabularyEditError(400, 'value must be a string.');
  }
  return {
    value: typeof record.value === 'string' ? record.value : '',
    title: parseTranslation(record.title, 'title.fr'),
    gender: parseGender(record.gender),
  };
}

export function parseTranslationPart(raw: unknown): VocabularyTranslation {
  return parseTranslation(raw, 'fr');
}

export function parseAxisPart(raw: unknown): VocabularyTranslation {
  const record = objectRecord(raw);
  return parseTranslation(record.title, 'title.fr');
}

function objectRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new VocabularyEditError(400, 'Document must be a JSON object.');
  }
  return raw as Record<string, unknown>;
}

function parseTranslation(raw: unknown, field: string): VocabularyTranslation {
  const record = objectRecord(raw);
  const fr = record.fr;
  if (typeof fr !== 'string' || fr.trim() === '') {
    throw new VocabularyEditError(400, `${field} is required.`);
  }
  const out: VocabularyTranslation = { fr };
  for (const lang of LANGUAGES) {
    if (lang === 'fr') continue;
    const value = record[lang];
    if (value == null) continue;
    if (typeof value !== 'string') {
      throw new VocabularyEditError(400, `${lang} must be a string.`);
    }
    out[lang] = value;
  }
  return out;
}

function parseGender(raw: unknown): Record<string, string> {
  if (raw == null) return {};
  const record = objectRecord(raw);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!LANG.test(key) || typeof value !== 'string' || !GENDERS.has(value)) {
      throw new VocabularyEditError(400, 'gender must be m, f, n, c, or empty, per language.');
    }
    out[key] = value;
  }
  return out;
}

function parseLengthRefs(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new VocabularyEditError(400, 'length must be a list of $keys.');
  }
  if (raw.length === 0) {
    throw new VocabularyEditError(400, 'A shape needs at least one length.');
  }
  const keys: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      throw new VocabularyEditError(400, 'length must be a list of $keys.');
    }
    const bare = item.startsWith('$') ? item.slice(1) : item;
    const key = parseVocabularyKey(bare);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}
