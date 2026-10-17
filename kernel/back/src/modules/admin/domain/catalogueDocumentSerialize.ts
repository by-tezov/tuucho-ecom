/** Build a manager-shaped catalogue document from a loaded product row. */
import type { PartialTrilingual } from '../../../types.js';
import { LANGUAGES } from '../../../utils/language.js';
import {
  orderDocumentKeys,
  ref,
  refKeysDeep,
  SIZES,
  type AdminCatalogue,
  type CatalogueDocument,
} from './catalogueDocumentTypes.js';

/** Minimal product snapshot the serializer needs (mirrors LibrarySetListRow). */
export interface CatalogueSourceRow {
  productUid: string;
  title: PartialTrilingual;
  desc: PartialTrilingual;
  occasion: PartialTrilingual | null;
  alt: PartialTrilingual | null;
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>;
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  photoHashes: Record<string, Record<string, string[]>>;
  price: number | undefined;
  availability: Record<string, Record<string, Partial<Record<(typeof SIZES)[number] | '', number>>>>;
  accessoryType: 'default' | 'byQuantity';
  accessoryPacks: Record<string, number>;
  accessoryPackPrices: Record<string, number>;
  inCartCarousel: boolean;
  loyaltyMultiplier: number;
  variationAxis: string | null;
  variations: Array<{
    key: string;
    price: number | null;
    title: PartialTrilingual | null;
    desc: PartialTrilingual | null;
    alt: PartialTrilingual | null;
    occasion: PartialTrilingual | null;
    colorMainKeys: string[];
    colorSecondaryKeys: string[];
  }>;
  users: string[];
}

function trilingualOut(value: PartialTrilingual | null | undefined): PartialTrilingual | undefined {
  if (!value || !value.fr) return undefined;
  const out: Partial<PartialTrilingual> = { fr: value.fr };
  for (const lang of LANGUAGES) {
    if (lang === 'fr') continue;
    const text = value[lang];
    if (typeof text === 'string' && text) out[lang] = text;
  }
  return out as PartialTrilingual;
}

function photoListFromHashes(hashes: string[] | undefined): Array<{ photo: string; hash: string }> {
  return (hashes ?? []).map((hash, index) => ({ photo: String(index + 1), hash }));
}

function hiddenOut(
  hidden: boolean,
  hiddenShapeLengths: Array<{ shapeKey: string; lengthKey: string }>,
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
    out[ref(shapeKey)] =
      all.length > 0 && all.every((lengthKey) => lengths.includes(lengthKey))
        ? true
        : Object.fromEntries(lengths.map((lengthKey) => [ref(lengthKey), true as const]));
  }
  return out;
}

function availabilityOut(
  availability: CatalogueSourceRow['availability'],
  booleanCells: boolean,
): unknown {
  const nested: Record<string, Record<string, Record<string, number | true>>> = {};
  for (const [shapeKey, lengths] of Object.entries(availability)) {
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      for (const size of SIZES) {
        const qty = sizes[size];
        if (!qty) continue;
        ((nested[shapeKey] ??= {})[lengthKey] ??= {})[size] = booleanCells ? true : qty;
      }
    }
  }
  return refKeysDeep(nested, 2);
}

function photosOut(row: CatalogueSourceRow): unknown {
  const nested: Record<string, Record<string, Array<{ photo: string; hash: string }>>> = {};
  for (const [shapeKey, lengths] of Object.entries(row.photoHashes)) {
    for (const [lengthKey, hashes] of Object.entries(lengths)) {
      if (lengthKey.includes('/')) continue;
      (nested[shapeKey] ??= {})[lengthKey] = photoListFromHashes(hashes);
    }
  }
  return refKeysDeep(nested, 2);
}

/** Builds the editable document from a catalogue source row. */
export function listRowToDocument(catalogue: AdminCatalogue, row: CatalogueSourceRow): CatalogueDocument {
  const document: CatalogueDocument = {
    'product-uid': row.productUid,
    'creation-date': row.creationDate,
  };
  const hidden = hiddenOut(row.hidden, row.hiddenShapeLengths, row.shapeLengths);
  if (hidden !== undefined) document.hidden = hidden;
  if (row.featuredFrom && row.featuredFor) {
    document.featured = { from: row.featuredFrom, for: row.featuredFor };
  }
  if (row.loyaltyMultiplier !== 1) document.loyalties = row.loyaltyMultiplier;

  if (catalogue === 'accessory') {
    document.title = trilingualOut(row.title);
    document.desc = trilingualOut(row.desc);
    if (row.accessoryType === 'byQuantity') {
      document.type = 'byQuantity';
      document.available = { max: row.availability['']?.['']?.[''] ?? 0, ...row.accessoryPacks };
      document.price =
        Object.keys(row.accessoryPackPrices).length > 0 ? row.accessoryPackPrices : row.price;
      const photos: Record<string, Array<{ photo: string; hash: string }>> = {};
      for (const [packKey, lengths] of Object.entries(row.photoHashes)) {
        photos[packKey] = photoListFromHashes(lengths['']);
      }
      document.photos = photos;
    } else {
      document.available = row.availability['']?.['']?.[''] ?? 0;
      if (row.price !== undefined) document.price = row.price;
      document.photos = photoListFromHashes(row.photoHashes['']?.['']);
    }
    if (row.inCartCarousel) document.inCartCarousel = true;
    return orderDocumentKeys(document);
  }

  if (catalogue === 'user-library') document.users = row.users;
  document.title = trilingualOut(row.title);
  document.desc = trilingualOut(row.desc);
  const occasion = trilingualOut(row.occasion);
  if (occasion) document.occasion = occasion;
  const alt = trilingualOut(row.alt);
  if (alt) document.alt = alt;
  if (row.colorMainKeys.length) document['color-main'] = row.colorMainKeys.map(ref);
  if (row.colorSecondaryKeys.length) document['color-secondary'] = row.colorSecondaryKeys.map(ref);
  document.available = availabilityOut(row.availability, catalogue === 'nail');

  if (catalogue === 'nail' && row.variationAxis && row.variations.length > 0) {
    document['is-variation'] = true;
    const overrides = row.variations.filter((option) => option.price !== null);
    document.price =
      overrides.length > 0 && row.price !== undefined
        ? {
            default: row.price,
            ...Object.fromEntries(overrides.map((option) => [ref(option.key), option.price!])),
          }
        : row.price;
    for (const option of row.variations) {
      const key = `$${row.variationAxis}.${option.key}`;
      const entry: CatalogueDocument = {
        title: trilingualOut(option.title ?? row.title),
        desc: trilingualOut(option.desc ?? row.desc),
        occasion: trilingualOut(option.occasion ?? row.occasion),
      };
      const optionAlt = trilingualOut(option.alt ?? row.alt);
      if (optionAlt) entry.alt = optionAlt;
      if (option.colorMainKeys.length) entry['color-main'] = option.colorMainKeys.map(ref);
      if (option.colorSecondaryKeys.length) entry['color-secondary'] = option.colorSecondaryKeys.map(ref);
      const photos: Record<string, Record<string, Array<{ photo: string; hash: string }>>> = {};
      for (const [shapeKey, lengths] of Object.entries(row.photoHashes)) {
        for (const [compound, hashes] of Object.entries(lengths)) {
          const slash = compound.indexOf('/');
          if (slash < 0) continue;
          const lengthKey = compound.slice(0, slash);
          const variationKey = compound.slice(slash + 1);
          if (variationKey !== option.key) continue;
          ((photos[shapeKey] ??= {})[lengthKey] ??= []).push(...photoListFromHashes(hashes));
        }
      }
      entry.photos = refKeysDeep(photos, 2);
      document[key] = entry;
    }
    return orderDocumentKeys(document);
  }

  if (row.price !== undefined) document.price = row.price;
  document.photos = photosOut(row);
  return orderDocumentKeys(document);
}
