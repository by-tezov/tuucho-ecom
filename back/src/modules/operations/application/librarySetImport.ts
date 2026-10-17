import { pool } from '../../../db/pool.js';
import { getSetDetail } from './adminProducts.js';
import { deleteAllPhotosForSet } from './adminPhotos.js';
import {
  replaceAvailabilityIfChanged,
  replaceNailAvailabilityIfChanged,
} from '../../catalog/application/availability.js';
import type { SetAvailability } from '../../catalog/application/availability.js';
import {
  createLibrarySet,
  findProductIdByProductUid,
  replaceUserLibraryUsers,
  updateLibrarySet,
} from './libraryImport.js';
import { libraryStateDifferences } from './libraryStateDifferences.js';
import type { LibrarySetDesiredState, ProductType } from './libraryImport.js';
import { setPriceIfChanged } from '../../catalog/application/prices.js';
import {
  expandNailAvailability,
  InvalidNailVariation,
  parseNailVariationPayload,
  replaceNailVariationsIfChanged,
  type NailVariationPayload,
} from './nailVariationImport.js';
import {
  AccessoryPackError,
  parseAccessoryType,
  parseInCartCarousel,
  parsePackPricesObject,
  parsePacksObject,
} from '../../catalog/domain/accessoryPacks.js';
import type { PartialTrilingual, Size } from '../../../types.js';
import { findUserByEmailLower, findUserById } from '../../identity/application/users.js';

/** URL path sentinel for accessory shape_key / size empty string `''`.
 * Literal empty segments are awkward in Express routes, so clients send `-`. */
const EMPTY_VARIANT_SENTINEL = '-';

export function mapVariantParam(value: string): string {
  return value === EMPTY_VARIANT_SENTINEL ? '' : value;
}

/** The one length every shape is guaranteed to offer — see
 * pamsurin-manager's product/library/README.md. */
const DEFAULT_LENGTH_KEY = 'medium';

export function isPartialTrilingual(value: unknown): value is PartialTrilingual {
  return !!value && typeof value === 'object' && typeof (value as PartialTrilingual).fr === 'string';
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** `{ "almond": ["medium"] }` — the lengths of each shape a set is offered
 * in, mirroring pamsurin-manager's data-generated.json `shape` map with the
 * "$" prefixes already stripped by scripts/library.ts. A shape listed in
 * shapeKeys but absent (or with no valid lengths) here gets the implicit
 * `medium` length, so an older payload still imports. */
function parseShapeLengths(value: unknown, shapeKeys: string[]): Record<string, string[]> {
  const raw =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const result: Record<string, string[]> = {};
  for (const shapeKey of shapeKeys) {
    const lengths = stringArray(raw[shapeKey]).filter((key) => key.length > 0);
    result[shapeKey] = lengths.length > 0 ? lengths : [DEFAULT_LENGTH_KEY];
  }
  return result;
}

function toShapeLengthPairs(
  shapeLengths: Record<string, string[]>,
): Array<{ shapeKey: string; lengthKey: string }> {
  return Object.entries(shapeLengths).flatMap(([shapeKey, lengths]) =>
    lengths.map((lengthKey) => ({ shapeKey, lengthKey })),
  );
}

/** `[{ shapeKey, lengthKey }]` hidden pairs (docs/plans/variant-visibility.md);
 * a pair the product does not offer is refused. */
function hiddenPairsFrom(
  value: unknown,
  shapeLengths: Record<string, string[]>,
): Array<{ shapeKey: string; lengthKey: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const { shapeKey, lengthKey } = (entry ?? {}) as { shapeKey?: unknown; lengthKey?: unknown };
    if (
      typeof shapeKey !== 'string' ||
      typeof lengthKey !== 'string' ||
      !shapeLengths[shapeKey]?.includes(lengthKey)
    ) {
      throw new InvalidLibrarySet(
        `hiddenShapeLengths names ${String(shapeKey)}/${String(lengthKey)}, not offered.`,
      );
    }
    return { shapeKey, lengthKey };
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function creationDateFrom(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : todayIso();
}

const SIZES: Size[] = ['XS', 'S', 'M', 'L'];

/** Parses the incoming `availability` payload (data-static.json's
 * "available", nested by shape then length — see scripts/library.ts) into
 * SetAvailability. `cell` turns one size's value into the stored quantity, or
 * undefined to drop it: a positive integer for a set, `true`/`1` → 1 for a
 * single nail's boolean offer (the CLI sends `1`, manager JSON `true`). A
 * shape/length pair not in `shapeLengthKeys` (the set's actual
 * gallery-visible variants, just applied by this same request) is dropped
 * with a server-side warning — scripts/library.ts already warns about this
 * locally, this is a defensive backstop so the DB never gets an availability
 * row for a variant product_shape_lengths doesn't have. */
function parseAvailability(
  value: unknown,
  shapeLengthKeys: Array<{ shapeKey: string; lengthKey: string }>,
  productUid: string,
  cell: (raw: unknown) => number | undefined,
): SetAvailability {
  const result: SetAvailability = {};
  if (!value || typeof value !== 'object') return result;

  const pairSet = new Set(shapeLengthKeys.map((pair) => `${pair.shapeKey}/${pair.lengthKey}`));
  for (const [shapeKey, lengths] of Object.entries(value as Record<string, unknown>)) {
    if (!lengths || typeof lengths !== 'object') continue;

    for (const [lengthKey, sizes] of Object.entries(lengths as Record<string, unknown>)) {
      if (!pairSet.has(`${shapeKey}/${lengthKey}`)) {
        console.warn(
          `[library-import] ${productUid}: "available" has shape/length "${shapeKey}/${lengthKey}", which isn't one of this product's variants (${[...pairSet].join(', ') || '(none)'}) — ignored.`,
        );
        continue;
      }
      if (!sizes || typeof sizes !== 'object') continue;

      for (const [size, raw] of Object.entries(sizes as Record<string, unknown>)) {
        const quantity = SIZES.includes(size as Size) ? cell(raw) : undefined;
        if (quantity !== undefined) ((result[shapeKey] ??= {})[lengthKey] ??= {})[size as Size] = quantity;
      }
    }
  }
  return result;
}

const stockQuantity = (raw: unknown) =>
  typeof raw === 'number' && Number.isInteger(raw) && raw > 0 ? raw : undefined;
const nailOffer = (raw: unknown) => (raw === true || raw === 1 ? 1 : undefined);

/** Accessories store a single scalar stock at shape_key='' / length_key=''
 * / size=''. */
function parseAccessoryAvailability(value: unknown): SetAvailability {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { '': { '': { '': value } } };
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const nested = (value as Record<string, unknown>)[''];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = (nested as Record<string, unknown>)[''];
      const qty =
        typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>)[''] : inner;
      if (typeof qty === 'number' && Number.isInteger(qty) && qty > 0) {
        return { '': { '': { '': qty } } };
      }
    }
  }
  return {};
}

export interface LibraryImportResult {
  success: true;
  created: boolean;
  updated: boolean;
  photosCleared: boolean;
  priceUpdated: boolean;
  availabilityUpdated: boolean;
  changes: string[];
  id: string;
}

export class InvalidLibrarySet extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLoyaltyMultiplier(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new InvalidLibrarySet('loyaltyMultiplier must be a number >= 0.');
  }
  return value;
}

/** Manager source accepts durable account ids or human-friendly emails. The
 * DB stores only ids, so email changes never change access rights. */
async function resolveUserLibraryUsers(value: unknown): Promise<string[]> {
  if (!Array.isArray(value)) return [];
  const rawIdentifiers = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim());
  if (rawIdentifiers.length !== value.length || rawIdentifiers.some((entry) => !entry)) {
    throw new InvalidLibrarySet('users must be an array of non-empty user ids or emails.');
  }
  const identifiers = [...new Set(rawIdentifiers)];
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const identifier of identifiers) {
    const user = UUID_RE.test(identifier)
      ? await findUserById(pool, identifier)
      : await findUserByEmailLower(pool, identifier.toLowerCase());
    if (!user) unknown.push(identifier);
    else ids.push(user.id);
  }
  if (unknown.length) throw new InvalidLibrarySet(`Unknown user(s): ${unknown.join(', ')}`);
  return ids;
}

/** Shared by the single-set and batch endpoints so batching changes only
 * the HTTP request count, not validation or idempotency semantics. */
export async function importLibrarySet(body: Record<string, unknown>): Promise<LibraryImportResult> {
  const productUid = typeof body.productUid === 'string' ? body.productUid : '';
  const productType: ProductType =
    body.productType === 'accessory'
      ? 'accessory'
      : body.productType === 'nail_single'
        ? 'nail_single'
        : 'nail';
  const title = body.title;
  const desc = body.desc;
  const occasion = body.occasion;
  const alt = body.alt;
  const shapeKeys = stringArray(body.shapeKeys);
  const shapeLengths = parseShapeLengths(body.shapeLengths, shapeKeys);
  const isAccessory = productType === 'accessory';
  const isNailSingle = productType === 'nail_single';
  const audience = body.audience === 'user-library' ? 'user-library' : 'public';
  if (audience === 'user-library' && (isAccessory || isNailSingle)) {
    throw new InvalidLibrarySet('user-library products must be nail sets.');
  }
  const userIds = audience === 'user-library' ? await resolveUserLibraryUsers(body.users) : [];

  if (!productUid || !isPartialTrilingual(title) || !isPartialTrilingual(desc)) {
    throw new InvalidLibrarySet('productUid, title.fr and desc.fr are required.');
  }
  if (!isAccessory && (!isPartialTrilingual(occasion) || shapeKeys.length === 0)) {
    throw new InvalidLibrarySet(
      'productUid, title.fr, desc.fr, occasion.fr and at least one shape are required.',
    );
  }

  const desired: LibrarySetDesiredState = {
    title,
    desc,
    occasion: isPartialTrilingual(occasion) ? occasion : null,
    alt: isPartialTrilingual(alt) ? alt : null,
    shapeKeys: isAccessory ? [] : shapeKeys,
    shapeLengths: isAccessory ? {} : shapeLengths,
    colorMainKeys: isAccessory ? [] : stringArray(body.colorMainKeys),
    colorSecondaryKeys: isAccessory ? [] : stringArray(body.colorSecondaryKeys),
    hidden: !!body.hidden,
    hiddenShapeLengths: isAccessory ? [] : hiddenPairsFrom(body.hiddenShapeLengths, shapeLengths),
    featuredFrom: typeof body.featuredFrom === 'string' ? body.featuredFrom : null,
    featuredFor: typeof body.featuredFor === 'number' ? body.featuredFor : null,
    creationDate: creationDateFrom(body.creationDate),
    audience,
    accessoryType: 'default',
    accessoryPacks: {},
    accessoryPackPrices: {},
    inCartCarousel: false,
    loyaltyMultiplier: parseLoyaltyMultiplier(body.loyaltyMultiplier),
  };

  const price =
    typeof body.price === 'number' && Number.isFinite(body.price) && body.price >= 0 ? body.price : undefined;
  const availability = isAccessory
    ? parseAccessoryAvailability(body.availability)
    : parseAvailability(
        body.availability,
        toShapeLengthPairs(desired.shapeLengths),
        productUid,
        isNailSingle ? nailOffer : stockQuantity,
      );

  if (isAccessory) {
    try {
      const accessoryType = parseAccessoryType(body.accessoryType);
      desired.accessoryType = accessoryType;
      desired.inCartCarousel = parseInCartCarousel(body.inCartCarousel);
      if (accessoryType === 'byQuantity') {
        desired.accessoryPacks = parsePacksObject(body.accessoryPacks ?? {});
        if (Object.keys(desired.accessoryPacks).length === 0) {
          throw new AccessoryPackError('byQuantity accessories require at least one pack.');
        }
        const rawPackPrices = body.accessoryPackPrices;
        desired.accessoryPackPrices =
          rawPackPrices &&
          typeof rawPackPrices === 'object' &&
          !Array.isArray(rawPackPrices) &&
          Object.keys(rawPackPrices).length > 0
            ? parsePackPricesObject(rawPackPrices, Object.keys(desired.accessoryPacks))
            : {};
      }
    } catch (error) {
      if (error instanceof AccessoryPackError) throw new InvalidLibrarySet(error.message);
      throw error;
    }
  }

  let variationPayload: NailVariationPayload = { axisKey: null, options: [], off: {} };
  if (isNailSingle) {
    try {
      variationPayload = parseNailVariationPayload(body);
    } catch (error) {
      if (error instanceof InvalidNailVariation) throw new InvalidLibrarySet(error.message);
      throw error;
    }
  }
  const existingId = await findProductIdByProductUid(pool, productUid);
  // A single nail's options go in before its offer rows, so both describe the
  // same option list; `availabilityUpdated` also reports an option change.
  const writeAvailability = async (productId: string) => {
    if (!isNailSingle) return replaceAvailabilityIfChanged(pool, productId, availability);
    let variationsChanged: boolean;
    try {
      variationsChanged = await replaceNailVariationsIfChanged(pool, productId, variationPayload);
    } catch (error) {
      if (error instanceof InvalidNailVariation) throw new InvalidLibrarySet(error.message);
      throw error;
    }
    const offerChanged = await replaceNailAvailabilityIfChanged(
      pool,
      productId,
      expandNailAvailability(availability, variationPayload),
    );
    return variationsChanged || offerChanged;
  };
  const result = (id: string, flags: Partial<LibraryImportResult>): LibraryImportResult => ({
    success: true,
    created: false,
    updated: false,
    photosCleared: false,
    priceUpdated: false,
    availabilityUpdated: false,
    changes: [],
    ...flags,
    id,
  });
  if (!existingId) {
    const id = await createLibrarySet(pool, { productUid, productType, ...desired });
    const priceUpdated = price !== undefined && (await setPriceIfChanged(pool, id, price));
    const availabilityUpdated = await writeAvailability(id);
    if (audience === 'user-library') await replaceUserLibraryUsers(pool, id, userIds);
    const changes = [
      'created',
      ...(priceUpdated ? ['price'] : []),
      ...(availabilityUpdated ? ['availability'] : []),
    ];
    return result(id, { created: true, priceUpdated, availabilityUpdated, changes });
  }

  if (body.update !== true) return result(existingId, {});

  const current = await getSetDetail(pool, existingId);
  const metadataChanges = current ? libraryStateDifferences(desired, current) : [];
  const priceUpdated = price !== undefined && (await setPriceIfChanged(pool, existingId, price));
  const availabilityUpdated = await writeAvailability(existingId);
  const changes = [
    ...metadataChanges,
    ...(priceUpdated ? ['price'] : []),
    ...(availabilityUpdated ? ['availability'] : []),
  ];

  await replaceUserLibraryUsers(pool, existingId, audience === 'user-library' ? userIds : []);

  const updated = metadataChanges.length > 0;
  if (updated) await updateLibrarySet(pool, existingId, desired);
  const photosCleared = body.refreshPhotos === true;
  if (photosCleared) await deleteAllPhotosForSet(pool, existingId);
  return result(existingId, {
    updated,
    photosCleared,
    priceUpdated,
    availabilityUpdated,
    changes: photosCleared ? [...changes, 'photos-refreshed'] : changes,
  });
}

/** Whole-set-level idempotency: a product_uid already present with no
 * `update: true` is treated as "nothing to do", not an error — price and
 * availability included, so a plain `seed` (no `--update`) never touches
 * an existing set's price or stock. With `update: true`, an existing set is
 * compared field-by-field (libraryStateDifferences, plus price/availability
 * separately via setPriceIfChanged/replaceAvailabilityIfChanged's own return
 * values) against the incoming payload — genuinely unchanged (metadata
 * *and* price *and* availability) is still a no-op. A metadata difference
 * updates the row **in place** (same id); photos are independently cleared
 * only when `refreshPhotos` says their count/hash state changed —
 * `updated` (metadata), `priceUpdated` and `availabilityUpdated` are
 * reported separately so the caller (scripts/library.ts) knows whether to
 * re-upload photos. In-place rather than delete+recreate: GalleryItem.id is
 * products.id, referenced by URLs — minting a new id on every metadata
 * edit would silently break shared links. */
