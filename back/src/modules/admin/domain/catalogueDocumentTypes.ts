/** Shared types and key helpers for the admin catalogue JSON document. */
import { LANGUAGES } from '../../../utils/language.js';
import type { PartialTrilingual } from '../../../types.js';

export type AdminCatalogue = 'library' | 'user-library' | 'nail' | 'accessory';

export type CatalogueDocument = Record<string, unknown>;

export class CatalogueDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueDocumentError';
  }
}

export const SIZES = ['XS', 'S', 'M', 'L'] as const;
export const OPTION_ENTRY_RE = /^\$([^.$]+)\.([^.$]+)$/;

export const ROOT_KEY_ORDER = [
  'product-uid',
  'creation-date',
  'hidden',
  'featured',
  'loyalties',
  'users',
  'type',
  'inCartCarousel',
  'price',
  'title',
  'desc',
  'alt',
  'occasion',
  'color-main',
  'color-secondary',
  'available',
  'photos',
  'is-variation',
  'variations',
] as const;

const BASE_KEYS = [
  'product-uid',
  'creation-date',
  'hidden',
  'featured',
  'loyalties',
  'price',
  'title',
  'desc',
  'alt',
  'occasion',
  'color-main',
  'color-secondary',
  'available',
  'photos',
] as const;

export const LIBRARY_KEYS = new Set<string>(BASE_KEYS);
export const USER_LIBRARY_KEYS = new Set<string>([...BASE_KEYS, 'users']);
export const NAIL_KEYS = new Set<string>([...BASE_KEYS, 'is-variation', 'variations']);
export const ACCESSORY_KEYS = new Set<string>([
  'product-uid',
  'creation-date',
  'hidden',
  'featured',
  'loyalties',
  'type',
  'inCartCarousel',
  'price',
  'title',
  'desc',
  'available',
  'photos',
]);

export function allowedKeys(catalogue: AdminCatalogue): Set<string> {
  if (catalogue === 'library') return LIBRARY_KEYS;
  if (catalogue === 'user-library') return USER_LIBRARY_KEYS;
  if (catalogue === 'nail') return NAIL_KEYS;
  return ACCESSORY_KEYS;
}

export function unref(key: string): string {
  return key.replace(/^\$/, '');
}

export function ref(key: string): string {
  return key.startsWith('$') ? key : `$${key}`;
}

export function unrefKeysDeep(value: unknown, depth: number): unknown {
  if (depth <= 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      unref(key),
      unrefKeysDeep(child, depth - 1),
    ]),
  );
}

export function refKeysDeep(value: unknown, depth: number): unknown {
  if (depth <= 0 || !value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      ref(key),
      refKeysDeep(child, depth - 1),
    ]),
  );
}

export function assertKnownKeys(document: CatalogueDocument, catalogue: AdminCatalogue): void {
  const allowed = allowedKeys(catalogue);
  for (const key of Object.keys(document)) {
    if (allowed.has(key)) continue;
    if (catalogue === 'nail' && OPTION_ENTRY_RE.test(key)) continue;
    throw new CatalogueDocumentError(`Unknown key ${JSON.stringify(key)}.`);
  }
}

export function trimTrilingual(
  value: unknown,
  field: string,
  required: boolean,
): PartialTrilingual | null {
  if (value === undefined || value === null) {
    if (required) throw new CatalogueDocumentError(`${field}.fr is required.`);
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogueDocumentError(`${field} must be an object of locale strings.`);
  }
  const out: Partial<PartialTrilingual> = {};
  for (const lang of LANGUAGES) {
    const raw = (value as Record<string, unknown>)[lang];
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed) out[lang] = trimmed;
  }
  if (!out.fr) {
    if (required) throw new CatalogueDocumentError(`${field}.fr is required.`);
    return null;
  }
  for (const key of Object.keys(value as object)) {
    if (!(LANGUAGES as readonly string[]).includes(key)) {
      throw new CatalogueDocumentError(`${field} has unknown locale ${JSON.stringify(key)}.`);
    }
  }
  return out as PartialTrilingual;
}

export function emptyTrilingual(): PartialTrilingual {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, ''])) as unknown as PartialTrilingual;
}

export function stringRefs(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new CatalogueDocumentError(`${field} must be an array of $keys.`);
  return value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry.trim()) {
      throw new CatalogueDocumentError(`${field}[${index}] must be a non-empty string.`);
    }
    return unref(entry.trim());
  });
}

export function parseFeatured(value: unknown): {
  featuredFrom: string | null;
  featuredFor: number | null;
} {
  if (value === undefined || value === null) return { featuredFrom: null, featuredFor: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogueDocumentError('featured must be { "from": "YYYY-MM-DD", "for": number }.');
  }
  const from = (value as { from?: unknown }).from;
  const forDays = (value as { for?: unknown }).for;
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new CatalogueDocumentError('featured.from must be YYYY-MM-DD.');
  }
  if (typeof forDays !== 'number' || !Number.isInteger(forDays) || forDays <= 0) {
    throw new CatalogueDocumentError('featured.for must be a positive integer.');
  }
  return { featuredFrom: from, featuredFor: forDays };
}

export function orderDocumentKeys(document: CatalogueDocument): CatalogueDocument {
  const ordered: CatalogueDocument = {};
  for (const key of ROOT_KEY_ORDER) {
    if (key in document) ordered[key] = orderValue(document[key]);
  }
  for (const key of Object.keys(document).sort()) {
    if (key in ordered) continue;
    ordered[key] = orderValue(document[key]);
  }
  return ordered;
}

function orderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderValue);
  if (!value || typeof value !== 'object') return value;
  if ('fr' in (value as object) || 'en' in (value as object)) {
    const out: Record<string, unknown> = {};
    for (const lang of LANGUAGES) {
      if (lang in (value as object)) out[lang] = (value as Record<string, unknown>)[lang];
    }
    for (const key of Object.keys(value as object)) {
      if (!(LANGUAGES as readonly string[]).includes(key) && !(key in out)) {
        out[key] = (value as Record<string, unknown>)[key];
      }
    }
    return out;
  }
  return Object.fromEntries(
    Object.keys(value as object)
      .sort()
      .map((key) => [key, orderValue((value as Record<string, unknown>)[key])]),
  );
}

/** Pretty-print with stable key order. */
export function formatCatalogueJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new CatalogueDocumentError(message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogueDocumentError('Document must be a JSON object.');
  }
  return `${JSON.stringify(orderDocumentKeys(parsed as CatalogueDocument), null, 2)}\n`;
}

export function emptyCatalogueTemplate(catalogue: AdminCatalogue): CatalogueDocument {
  const title = emptyTrilingual();
  const desc = emptyTrilingual();
  if (catalogue === 'accessory') {
    return orderDocumentKeys({
      'product-uid': '',
      'creation-date': new Date().toISOString().slice(0, 10),
      hidden: false,
      available: 0,
      price: 0,
      title,
      desc,
      photos: [],
    });
  }
  if (catalogue === 'nail') {
    return orderDocumentKeys({
      'product-uid': '',
      'creation-date': new Date().toISOString().slice(0, 10),
      price: 0,
      title,
      desc,
      alt: emptyTrilingual(),
      occasion: emptyTrilingual(),
      'color-main': [],
      'color-secondary': [],
      available: {},
      photos: {},
    });
  }
  const document: CatalogueDocument = {
    'product-uid': '',
    'creation-date': new Date().toISOString().slice(0, 10),
    price: 0,
    title,
    desc,
    alt: emptyTrilingual(),
    occasion: emptyTrilingual(),
    'color-main': [],
    'color-secondary': [],
    available: {},
    photos: {},
  };
  if (catalogue === 'user-library') document.users = [];
  return orderDocumentKeys(document);
}

export function catalogueProductType(catalogue: AdminCatalogue): 'nail' | 'nail_single' | 'accessory' {
  if (catalogue === 'accessory') return 'accessory';
  if (catalogue === 'nail') return 'nail_single';
  return 'nail';
}

export function catalogueAudience(catalogue: AdminCatalogue): 'public' | 'user-library' {
  return catalogue === 'user-library' ? 'user-library' : 'public';
}

export function cataloguePermission(
  catalogue: AdminCatalogue,
): 'library_stock' | 'user_library_stock' | 'nail_availability' | 'accessory_stock' {
  if (catalogue === 'library') return 'library_stock';
  if (catalogue === 'user-library') return 'user_library_stock';
  if (catalogue === 'nail') return 'nail_availability';
  return 'accessory_stock';
}

export function parseAdminCatalogue(value: string): AdminCatalogue | null {
  if (value === 'library' || value === 'user-library' || value === 'nail' || value === 'accessory') {
    return value;
  }
  return null;
}

/** One picture slot the editor can attach a file to. */
export interface CataloguePhotoSlot {
  shapeKey: string;
  lengthKey: string;
  variationKey: string;
  photo: string;
  hash: string | null;
}
