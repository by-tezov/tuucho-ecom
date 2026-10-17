/** Parse a manager-shaped catalogue document into an importLibrarySet body. */
import { PRODUCT_UID_PATTERN } from '../../catalog/domain/productUid.js';
import {
  parseAccessorySource,
  AccessoryPackError,
} from '../../catalog/domain/accessoryPacks.js';
import {
  assertKnownKeys,
  CatalogueDocumentError,
  OPTION_ENTRY_RE,
  parseFeatured,
  ref,
  SIZES,
  stringRefs,
  trimTrilingual,
  unref,
  unrefKeysDeep,
  type AdminCatalogue,
  type CatalogueDocument,
  type CataloguePhotoSlot,
} from './catalogueDocumentTypes.js';

function parseHidden(
  raw: unknown,
  shapeLengths: Record<string, string[]>,
): { hidden: boolean; hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }> } {
  if (raw === undefined || raw === null || raw === false) return { hidden: false, hiddenShapeLengths: [] };
  if (raw === true) return { hidden: true, hiddenShapeLengths: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CatalogueDocumentError('"hidden" must be true, false or an object.');
  }
  const pairs: Array<{ shapeKey: string; lengthKey: string }> = [];
  for (const [shapeRef, value] of Object.entries(raw as Record<string, unknown>)) {
    const shapeKey = unref(shapeRef);
    const lengths = shapeLengths[shapeKey];
    if (!lengths) throw new CatalogueDocumentError(`"hidden" names unknown shape ${JSON.stringify(shapeRef)}.`);
    if (value === true) {
      pairs.push(...lengths.map((lengthKey) => ({ shapeKey, lengthKey })));
      continue;
    }
    if (value === false) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new CatalogueDocumentError(`"hidden.${shapeRef}" must be true, false or an object.`);
    }
    for (const [lengthRef, flag] of Object.entries(value as Record<string, unknown>)) {
      const lengthKey = unref(lengthRef);
      if (!lengths.includes(lengthKey)) {
        throw new CatalogueDocumentError(
          `"hidden.${shapeRef}" names unknown length ${JSON.stringify(lengthRef)}.`,
        );
      }
      if (typeof flag !== 'boolean') {
        throw new CatalogueDocumentError(`"hidden.${shapeRef}.${lengthRef}" must be a boolean.`);
      }
      if (flag) pairs.push({ shapeKey, lengthKey });
    }
  }
  return { hidden: false, hiddenShapeLengths: pairs };
}

function shapeLengthsFromTrees(
  available: unknown,
  photos: unknown,
): { shapeKeys: string[]; shapeLengths: Record<string, string[]> } {
  const shapeLengths: Record<string, string[]> = {};
  const absorb = (tree: unknown) => {
    if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return;
    for (const [shapeRef, lengths] of Object.entries(tree as Record<string, unknown>)) {
      const shapeKey = unref(shapeRef);
      if (!lengths || typeof lengths !== 'object' || Array.isArray(lengths)) continue;
      const list = shapeLengths[shapeKey] ?? [];
      for (const lengthRef of Object.keys(lengths as object)) {
        const lengthKey = unref(lengthRef);
        if (!list.includes(lengthKey)) list.push(lengthKey);
      }
      shapeLengths[shapeKey] = list;
    }
  };
  absorb(available);
  absorb(photos);
  return { shapeKeys: Object.keys(shapeLengths), shapeLengths };
}

function nailAvailability(raw: unknown, shapeLengths: Record<string, string[]>, booleanCells: boolean) {
  const result: Record<string, Record<string, Partial<Record<(typeof SIZES)[number], number>>>> = {};
  if (!raw || typeof raw !== 'object') return result;
  const bare = unrefKeysDeep(raw, 2) as Record<string, Record<string, Record<string, unknown>>>;
  for (const [shapeKey, lengths] of Object.entries(bare)) {
    if (!shapeLengths[shapeKey] || !lengths || typeof lengths !== 'object') continue;
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      if (!shapeLengths[shapeKey]!.includes(lengthKey) || !sizes || typeof sizes !== 'object') continue;
      for (const size of SIZES) {
        const cell = sizes[size];
        if (booleanCells) {
          if (cell === true || cell === 1) ((result[shapeKey] ??= {})[lengthKey] ??= {})[size] = 1;
          continue;
        }
        if (typeof cell === 'number' && Number.isInteger(cell) && cell > 0) {
          ((result[shapeKey] ??= {})[lengthKey] ??= {})[size] = cell;
        }
      }
    }
  }
  return result;
}

function parsePhotoEntries(
  list: unknown,
  shapeKey: string,
  lengthKey: string,
  variationKey: string,
  path: string,
): CataloguePhotoSlot[] {
  if (!Array.isArray(list)) throw new CatalogueDocumentError(`${path} must be an array.`);
  return list.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CatalogueDocumentError(`${path}[${index}] must be { "photo", "hash"? }.`);
    }
    const photoRaw = (entry as { photo?: unknown }).photo;
    const photo =
      typeof photoRaw === 'string' || typeof photoRaw === 'number' ? String(photoRaw).trim() : '';
    if (!photo) throw new CatalogueDocumentError(`${path}[${index}].photo is required.`);
    const hashRaw = (entry as { hash?: unknown }).hash;
    const hash = typeof hashRaw === 'string' && /^[a-f0-9]{64}$/i.test(hashRaw) ? hashRaw.toLowerCase() : null;
    return { shapeKey, lengthKey, variationKey, photo, hash };
  });
}

export function extractPhotoSlots(catalogue: AdminCatalogue, document: CatalogueDocument): CataloguePhotoSlot[] {
  const slots: CataloguePhotoSlot[] = [];
  if (catalogue === 'accessory') {
    const photos = document.photos;
    if (photos === undefined) return slots;
    if (Array.isArray(photos)) return parsePhotoEntries(photos, '', '', '', 'photos');
    if (!photos || typeof photos !== 'object') {
      throw new CatalogueDocumentError('photos must be an array or a pack map.');
    }
    for (const [packKey, list] of Object.entries(photos as Record<string, unknown>)) {
      slots.push(...parsePhotoEntries(list, packKey, '', '', `photos.${packKey}`));
    }
    return slots;
  }

  if (catalogue === 'nail' && document['is-variation'] === true) {
    for (const [key, value] of Object.entries(document)) {
      const match = OPTION_ENTRY_RE.exec(key);
      if (!match || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const optionKey = match[2]!;
      const photos = (value as { photos?: unknown }).photos;
      if (photos === undefined) continue;
      const bare = unrefKeysDeep(photos, 2) as Record<string, Record<string, unknown>>;
      for (const [shapeKey, lengths] of Object.entries(bare)) {
        if (!lengths || typeof lengths !== 'object') continue;
        for (const [lengthKey, list] of Object.entries(lengths)) {
          slots.push(
            ...parsePhotoEntries(list, shapeKey, lengthKey, optionKey, `${key}.photos.${shapeKey}.${lengthKey}`),
          );
        }
      }
    }
    return slots;
  }

  const photos = document.photos;
  if (photos === undefined) return slots;
  const bare = unrefKeysDeep(photos, 2) as Record<string, Record<string, unknown>>;
  for (const [shapeKey, lengths] of Object.entries(bare)) {
    if (!lengths || typeof lengths !== 'object') continue;
    for (const [lengthKey, list] of Object.entries(lengths)) {
      slots.push(...parsePhotoEntries(list, shapeKey, lengthKey, '', `photos.${shapeKey}.${lengthKey}`));
    }
  }
  return slots;
}

function parseNailOptions(document: CatalogueDocument): {
  variationAxis: string | null;
  variations: Array<Record<string, unknown>>;
  variationOff: Record<string, unknown>;
} {
  if (document['is-variation'] !== true) {
    return {
      variationAxis: null,
      variations: [],
      variationOff:
        document.variations && typeof document.variations === 'object'
          ? (unrefKeysDeep(document.variations, 3) as Record<string, unknown>)
          : {},
    };
  }
  const options: Array<{ axis: string; key: string; meta: Record<string, unknown> }> = [];
  for (const [key, value] of Object.entries(document)) {
    const match = OPTION_ENTRY_RE.exec(key);
    if (!match || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    options.push({ axis: match[1]!, key: match[2]!, meta: value as Record<string, unknown> });
  }
  if (options.length === 0) {
    throw new CatalogueDocumentError('is-variation needs at least one "$axis.option" entry.');
  }
  const axis = options[0]!.axis;
  if (options.some((option) => option.axis !== axis)) {
    throw new CatalogueDocumentError('All variation options must share the same axis.');
  }
  const priceRaw = document.price;
  const optionPrices: Record<string, number> = {};
  if (priceRaw && typeof priceRaw === 'object' && !Array.isArray(priceRaw)) {
    for (const [key, value] of Object.entries(unrefKeysDeep(priceRaw, 1) as Record<string, unknown>)) {
      if (key === 'default') continue;
      if (typeof value === 'number') optionPrices[key] = value;
    }
  }
  const variations = options.map(({ key, meta }) => {
    const title = trimTrilingual(meta.title, `$${axis}.${key}.title`, true)!;
    const desc = trimTrilingual(meta.desc, `$${axis}.${key}.desc`, true)!;
    const occasion = trimTrilingual(meta.occasion, `$${axis}.${key}.occasion`, true)!;
    const alt = trimTrilingual(meta.alt, `$${axis}.${key}.alt`, false);
    return {
      key,
      price: optionPrices[key] ?? null,
      title,
      desc,
      occasion,
      alt,
      colorMainKeys: stringRefs(meta['color-main'], `$${axis}.${key}.color-main`),
      colorSecondaryKeys: stringRefs(meta['color-secondary'], `$${axis}.${key}.color-secondary`),
    };
  });
  const variationOff =
    document.variations && typeof document.variations === 'object'
      ? (unrefKeysDeep(document.variations, 3) as Record<string, unknown>)
      : {};
  return { variationAxis: axis, variations, variationOff };
}

function parseProductUid(document: CatalogueDocument): string {
  const raw = document['product-uid'];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new CatalogueDocumentError('product-uid is required.');
  }
  const productUid = raw.trim().toUpperCase();
  if (!PRODUCT_UID_PATTERN.test(productUid)) {
    throw new CatalogueDocumentError('product-uid must look like LL-LL-DDD.');
  }
  return productUid;
}

function scalarPrice(document: CatalogueDocument): number | undefined {
  const raw = document.price;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const def = (unrefKeysDeep(raw, 1) as Record<string, unknown>).default;
    if (typeof def === 'number' && Number.isFinite(def) && def >= 0) return def;
  }
  return undefined;
}

/** Maps a manager-shaped document to the body `importLibrarySet` expects. */
export function documentToImportBody(
  catalogue: AdminCatalogue,
  document: CatalogueDocument,
  options: { update: boolean },
): Record<string, unknown> {
  assertKnownKeys(document, catalogue);
  const productUid = parseProductUid(document);
  const nailOptionsEarly =
    catalogue === 'nail' && document['is-variation'] === true ? parseNailOptions(document) : null;
  const firstOption = nailOptionsEarly?.variations[0] as
    | { title?: unknown; desc?: unknown; occasion?: unknown; alt?: unknown }
    | undefined;
  const title = trimTrilingual(document.title ?? firstOption?.title, 'title', true)!;
  const desc = trimTrilingual(document.desc ?? firstOption?.desc, 'desc', true)!;
  const { featuredFrom, featuredFor } = parseFeatured(document.featured);
  const loyalties = document.loyalties;
  const loyaltyMultiplier =
    loyalties === undefined || loyalties === null
      ? 1
      : typeof loyalties === 'number' && Number.isFinite(loyalties) && loyalties >= 0
        ? loyalties
        : (() => {
            throw new CatalogueDocumentError('loyalties must be a number >= 0.');
          })();

  if (catalogue === 'accessory') {
    let parsed;
    try {
      parsed = parseAccessorySource({
        type: document.type,
        available: document.available,
        price: document.price,
      });
    } catch (error) {
      throw new CatalogueDocumentError(error instanceof AccessoryPackError ? error.message : String(error));
    }
    return {
      productUid,
      productType: 'accessory',
      audience: 'public',
      title,
      desc,
      occasion: null,
      alt: null,
      shapeKeys: [],
      shapeLengths: {},
      colorMainKeys: [],
      colorSecondaryKeys: [],
      hidden: document.hidden === true,
      hiddenShapeLengths: [],
      featuredFrom,
      featuredFor,
      creationDate: typeof document['creation-date'] === 'string' ? document['creation-date'] : undefined,
      price: parsed.unitPrice,
      availability: parsed.max,
      accessoryType: parsed.accessoryType,
      accessoryPacks: parsed.packs,
      accessoryPackPrices: parsed.packPrices,
      inCartCarousel: document.inCartCarousel === true || document.inCartCarousel === 'true',
      loyaltyMultiplier,
      update: options.update,
      refreshPhotos: false,
    };
  }

  let photosTree: unknown = document.photos;
  if (catalogue === 'nail' && document['is-variation'] === true) {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(document)) {
      if (!OPTION_ENTRY_RE.test(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const optionPhotos = (value as { photos?: unknown }).photos;
      if (!optionPhotos || typeof optionPhotos !== 'object') continue;
      for (const [shapeRef, lengths] of Object.entries(optionPhotos as Record<string, unknown>)) {
        if (!lengths || typeof lengths !== 'object') continue;
        const shapeBucket = (merged[shapeRef] ??= {}) as Record<string, unknown>;
        for (const lengthRef of Object.keys(lengths as object)) shapeBucket[lengthRef] = true;
      }
    }
    photosTree = merged;
  }
  const { shapeKeys, shapeLengths } = shapeLengthsFromTrees(document.available, photosTree);
  if (shapeKeys.length === 0) {
    throw new CatalogueDocumentError('available or photos must name at least one shape/length.');
  }
  const visibility = parseHidden(document.hidden, shapeLengths);
  const occasion = trimTrilingual(
    document.occasion ?? firstOption?.occasion,
    'occasion',
    true,
  )!;
  const alt = trimTrilingual(document.alt ?? firstOption?.alt, 'alt', false);
  const isNail = catalogue === 'nail';
  const nailOptions = nailOptionsEarly
    ? nailOptionsEarly
    : isNail
      ? parseNailOptions(document)
      : { variationAxis: null, variations: [], variationOff: {} };

  return {
    productUid,
    productType: isNail ? 'nail_single' : 'nail',
    audience: catalogue === 'user-library' ? 'user-library' : 'public',
    users: catalogue === 'user-library' ? (Array.isArray(document.users) ? document.users : []) : undefined,
    title,
    desc,
    occasion,
    alt,
    shapeKeys,
    shapeLengths,
    colorMainKeys: stringRefs(document['color-main'], 'color-main'),
    colorSecondaryKeys: stringRefs(document['color-secondary'], 'color-secondary'),
    hidden: visibility.hidden,
    hiddenShapeLengths: visibility.hiddenShapeLengths,
    featuredFrom,
    featuredFor,
    creationDate: typeof document['creation-date'] === 'string' ? document['creation-date'] : undefined,
    price: scalarPrice(document),
    availability: nailAvailability(document.available, shapeLengths, isNail),
    loyaltyMultiplier,
    variationAxis: nailOptions.variationAxis,
    variations: nailOptions.variations,
    variationOff: nailOptions.variationOff,
    update: options.update,
    refreshPhotos: false,
  };
}

export { ref };
