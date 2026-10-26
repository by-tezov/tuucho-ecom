/** Pretty-print a catalogue document with a stable top-level key order. */

const ROOT_KEY_ORDER = [
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

const LOCALES = ['en', 'fr'] as const;

export class CatalogueJsonFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueJsonFormatError';
  }
}

function orderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if ('fr' in record || 'en' in record) {
    const out: Record<string, unknown> = {};
    for (const lang of LOCALES) {
      if (lang in record) out[lang] = record[lang];
    }
    for (const key of Object.keys(record).sort()) {
      if (!(key in out)) out[key] = orderValue(record[key]);
    }
    return out;
  }
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, orderValue(record[key])]),
  );
}

export function orderCatalogueDocument(document: Record<string, unknown>): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of ROOT_KEY_ORDER) {
    if (key in document) ordered[key] = orderValue(document[key]);
  }
  for (const key of Object.keys(document).sort()) {
    if (key in ordered) continue;
    ordered[key] = orderValue(document[key]);
  }
  return ordered;
}

export interface CataloguePhotoTarget {
  photo: string;
  shapeKey: string;
  lengthKey: string;
  variationKey: string;
}

function bare(key: string): string {
  return key.startsWith('$') ? key.slice(1) : key;
}

function withoutPhoto(list: unknown, photo: string): unknown {
  if (!Array.isArray(list)) return list;
  return list.filter((entry) => {
    const name = entry && typeof entry === 'object' ? (entry as { photo?: unknown }).photo : undefined;
    return !(typeof name === 'string' || typeof name === 'number') || String(name) !== photo;
  });
}

function photoLabel(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const name = (entry as { photo?: unknown }).photo;
  return typeof name === 'string' || typeof name === 'number' ? String(name) : null;
}

/** `names` is the new order of photo stems in one list. Unknown stems are
 * ignored. Entries not named stay at the end, in their previous order. */
function reorderList(list: unknown, names: string[]): unknown {
  if (!Array.isArray(list)) return list;
  const used = new Set<number>();
  const next: unknown[] = [];
  for (const name of names) {
    const index = list.findIndex((entry, i) => !used.has(i) && photoLabel(entry) === name);
    if (index < 0) continue;
    used.add(index);
    next.push(list[index]);
  }
  list.forEach((entry, index) => {
    if (!used.has(index)) next.push(entry);
  });
  return next;
}

function mapPhotoList(
  node: unknown,
  shapeKey: string,
  lengthKey: string,
  mapList: (list: unknown) => unknown,
): unknown {
  if (Array.isArray(node)) return !shapeKey && !lengthKey ? mapList(node) : node;
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = { ...(node as Record<string, unknown>) };
  for (const [key, value] of Object.entries(out)) {
    if (bare(key) !== shapeKey) continue;
    if (Array.isArray(value) && !lengthKey) out[key] = mapList(value);
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      const lengths: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const [lengthRef, list] of Object.entries(lengths)) {
        if (bare(lengthRef) === lengthKey) lengths[lengthRef] = mapList(list);
      }
      out[key] = lengths;
    }
  }
  return out;
}

function parseCatalogueDocument(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new CatalogueJsonFormatError(error instanceof Error ? error.message : 'Invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogueJsonFormatError('Document must be a JSON object.');
  }
  return { ...(parsed as Record<string, unknown>) };
}

function editPhotoTree(
  doc: Record<string, unknown>,
  target: Pick<CataloguePhotoTarget, 'shapeKey' | 'lengthKey' | 'variationKey'>,
  mapList: (list: unknown) => unknown,
): Record<string, unknown> {
  const { shapeKey, lengthKey, variationKey } = target;
  if (variationKey) {
    for (const [key, value] of Object.entries(doc)) {
      const dot = key.indexOf('.');
      if (!key.startsWith('$') || dot < 2 || key.slice(dot + 1) !== variationKey) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value) || !('photos' in value)) continue;
      doc[key] = {
        ...value,
        photos: mapPhotoList(value.photos, shapeKey, lengthKey, mapList),
      };
    }
    return doc;
  }
  if ('photos' in doc) doc.photos = mapPhotoList(doc.photos, shapeKey, lengthKey, mapList);
  return doc;
}

/** Remove one photo and pretty-print. Variation photos live on `$axis.option` only. */
export function removeCataloguePhoto(text: string, target: CataloguePhotoTarget): string {
  const doc = editPhotoTree(parseCatalogueDocument(text), target, (list) => withoutPhoto(list, target.photo));
  return formatCatalogueJson(JSON.stringify(doc));
}

/** Reorder one shape/length/variation list (or the flat accessory list) and pretty-print. */
export function reorderCataloguePhotos(
  text: string,
  target: Pick<CataloguePhotoTarget, 'shapeKey' | 'lengthKey' | 'variationKey'>,
  photoNames: string[],
): string {
  const doc = editPhotoTree(parseCatalogueDocument(text), target, (list) => reorderList(list, photoNames));
  return formatCatalogueJson(JSON.stringify(doc));
}

const OPTION_ENTRY_RE = /^\$([^.$]+)\.([^.$]+)$/;

function appendStem(list: unknown, stem: string): unknown[] {
  const entries = Array.isArray(list) ? [...list] : [];
  if (entries.some((entry) => photoLabel(entry) === stem)) return entries;
  entries.push({ photo: stem });
  return entries;
}

/** Drop one `{ photo }` entry that has no hash. Stored photos keep their hash
 * and stay. A second unhashed copy of the same stem is left in place. */
function dropUnhashedStem(list: unknown, stem: string): unknown {
  if (!Array.isArray(list)) return list;
  let dropped = false;
  return list.filter((entry) => {
    if (dropped || photoLabel(entry) !== stem) return true;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return true;
    const hash = (entry as { hash?: unknown }).hash;
    if (typeof hash === 'string' && hash.length > 0) return true;
    dropped = true;
    return false;
  });
}

function firstPhotoList(tree: unknown): { shapeKey: string; lengthKey: string } | null {
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return null;
  for (const [shapeRef, lengths] of Object.entries(tree as Record<string, unknown>)) {
    if (Array.isArray(lengths)) return { shapeKey: bare(shapeRef), lengthKey: '' };
    if (!lengths || typeof lengths !== 'object') continue;
    const lengthRef = Object.keys(lengths as object)[0];
    if (!lengthRef) continue;
    return { shapeKey: bare(shapeRef), lengthKey: bare(lengthRef) };
  }
  return null;
}

/** Where a newly picked file is named. One list: the first variation option,
 * otherwise the first pack or shape/length, otherwise the flat accessory
 * array. An empty nail document uses the first `available` pair. */
function photoAddTarget(doc: Record<string, unknown>): Pick<CataloguePhotoTarget, 'shapeKey' | 'lengthKey' | 'variationKey'> {
  if (doc['is-variation'] === true) {
    for (const [key, value] of Object.entries(doc)) {
      if (!OPTION_ENTRY_RE.test(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const host = value as { photos?: unknown };
      const found = firstPhotoList(host.photos) ?? firstPhotoList(doc.available);
      return {
        shapeKey: found?.shapeKey ?? '',
        lengthKey: found?.lengthKey ?? '',
        variationKey: key.slice(key.indexOf('.') + 1),
      };
    }
  }
  if (Array.isArray(doc.photos)) return { shapeKey: '', lengthKey: '', variationKey: '' };
  const found = firstPhotoList(doc.photos) ?? (typeof doc.available === 'number' ? null : firstPhotoList(doc.available));
  if (found) return { shapeKey: found.shapeKey, lengthKey: found.lengthKey, variationKey: '' };
  return { shapeKey: '', lengthKey: '', variationKey: '' };
}

function ensurePhotoList(photos: unknown, shapeKey: string, lengthKey: string): unknown {
  if (!shapeKey && !lengthKey) return Array.isArray(photos) ? photos : [];
  const root: Record<string, unknown> =
    photos && typeof photos === 'object' && !Array.isArray(photos) ? { ...(photos as Record<string, unknown>) } : {};
  const shapeRef = Object.keys(root).find((key) => bare(key) === shapeKey) ?? `$${shapeKey}`;
  if (!lengthKey) {
    if (!Array.isArray(root[shapeRef])) root[shapeRef] = [];
    return root;
  }
  const lengthsRaw = root[shapeRef];
  const lengths: Record<string, unknown> =
    lengthsRaw && typeof lengthsRaw === 'object' && !Array.isArray(lengthsRaw)
      ? { ...(lengthsRaw as Record<string, unknown>) }
      : {};
  const lengthRef = Object.keys(lengths).find((key) => bare(key) === lengthKey) ?? `$${lengthKey}`;
  if (!Array.isArray(lengths[lengthRef])) lengths[lengthRef] = [];
  root[shapeRef] = lengths;
  return root;
}

function preparePhotoAdd(doc: Record<string, unknown>): Record<string, unknown> {
  const target = photoAddTarget(doc);
  if (target.variationKey) {
    for (const [key, value] of Object.entries(doc)) {
      const dot = key.indexOf('.');
      if (!key.startsWith('$') || dot < 2 || key.slice(dot + 1) !== target.variationKey) continue;
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      doc[key] = {
        ...(value as Record<string, unknown>),
        photos: ensurePhotoList((value as { photos?: unknown }).photos, target.shapeKey, target.lengthKey),
      };
    }
    return doc;
  }
  doc.photos = ensurePhotoList(doc.photos, target.shapeKey, target.lengthKey);
  return doc;
}

/** Name an uploaded file in the document so save can reconcile it. */
export function addCataloguePhoto(text: string, stem: string): string {
  const doc = preparePhotoAdd(parseCatalogueDocument(text));
  const next = editPhotoTree(doc, photoAddTarget(doc), (list) => appendStem(list, stem));
  return formatCatalogueJson(JSON.stringify(next));
}

/** Undo {@link addCataloguePhoto} for a file the editor has not saved yet. */
export function removeUnhashedCataloguePhoto(text: string, stem: string): string {
  const doc = parseCatalogueDocument(text);
  const next = editPhotoTree(doc, photoAddTarget(doc), (list) => dropUnhashedStem(list, stem));
  return formatCatalogueJson(JSON.stringify(next));
}

/** Parse and rewrite with a 2-space indent. Throws CatalogueJsonFormatError. */
export function formatCatalogueJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON.';
    throw new CatalogueJsonFormatError(message);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CatalogueJsonFormatError('Document must be a JSON object.');
  }
  return `${JSON.stringify(orderCatalogueDocument(parsed as Record<string, unknown>), null, 2)}\n`;
}
