import type pg from 'pg';
import type { SetAvailability } from '../../catalog/application/availability.js';
import type { NailVariationAvailability } from '../../catalog/application/availability.js';
import { invalidateFilterOptionsCache } from '../../catalog/application/filterOptionsCache.js';
import type { PartialTrilingual } from '../../../types.js';

const SIZES = ['XS', 'S', 'M', 'L'] as const;

/** One option's own product copy (docs/plans/nail-variation-copy.md), already
 * resolved against the nail-level fallback by `library-nail`. Null on a
 * payload from an older importer: the option then reads the product's copy. */
export interface NailVariationCopy {
  title: PartialTrilingual;
  desc: PartialTrilingual;
  alt: PartialTrilingual | null;
  occasion: PartialTrilingual;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
}

export interface NailVariationOption {
  key: string;
  price: number | null;
  copy: NailVariationCopy | null;
}

/** The variation part of a `nail_single` import payload (see
 * docs/plans/nail-variations.md): the product's axis, its options in display
 * order with an optional price override and its own copy each, and the sparse
 * "switched off" tree from data-static.json's `variations`. */
export interface NailVariationPayload {
  axisKey: string | null;
  options: NailVariationOption[];
  /** option → false | { shape → false | { length → false | { size → false } } } */
  off: Record<string, unknown>;
}

export class InvalidNailVariation extends Error {}

function trilingual(value: unknown): PartialTrilingual | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fr = (value as Record<string, unknown>).fr;
  return typeof fr === 'string' && fr ? (value as PartialTrilingual) : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && !!entry)
    : [];
}

function parseOptionCopy(key: string, raw: Record<string, unknown>): NailVariationCopy | null {
  if (raw.title === undefined && raw.desc === undefined && raw.occasion === undefined) return null;
  const title = trilingual(raw.title);
  const desc = trilingual(raw.desc);
  const occasion = trilingual(raw.occasion);
  if (!title || !desc || !occasion) {
    throw new InvalidNailVariation(`variation "${key}" needs title, desc and occasion with a French text.`);
  }
  return {
    title,
    desc,
    alt: trilingual(raw.alt),
    occasion,
    colorMainKeys: stringList(raw.colorMainKeys),
    colorSecondaryKeys: stringList(raw.colorSecondaryKeys),
  };
}

export function parseNailVariationPayload(body: Record<string, unknown>): NailVariationPayload {
  const axisKey = typeof body.variationAxis === 'string' && body.variationAxis ? body.variationAxis : null;
  if (!axisKey) return { axisKey: null, options: [], off: {} };
  const rawOptions = Array.isArray(body.variations) ? body.variations : [];
  const options: NailVariationPayload['options'] = [];
  const seen = new Set<string>();
  for (const raw of rawOptions) {
    if (!raw || typeof raw !== 'object')
      throw new InvalidNailVariation('variations entries must be objects.');
    const { key, price } = raw as { key?: unknown; price?: unknown };
    if (typeof key !== 'string' || !key || seen.has(key)) {
      throw new InvalidNailVariation('variations need unique non-empty keys.');
    }
    if (
      price !== undefined &&
      price !== null &&
      (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
    ) {
      throw new InvalidNailVariation(`variation "${key}" price must be a number >= 0.`);
    }
    seen.add(key);
    options.push({
      key,
      price: typeof price === 'number' ? price : null,
      copy: parseOptionCopy(key, raw as Record<string, unknown>),
    });
  }
  if (options.length === 0) throw new InvalidNailVariation('variationAxis needs at least one variation.');
  const off =
    body.variationOff && typeof body.variationOff === 'object' && !Array.isArray(body.variationOff)
      ? (body.variationOff as Record<string, unknown>)
      : {};
  for (const key of Object.keys(off)) {
    if (!seen.has(key)) throw new InvalidNailVariation(`variationOff names unknown variation "${key}".`);
  }
  return { axisKey, options, off };
}

/** True when the sparse tree switches this exact combination off. */
function switchedOff(node: unknown, path: string[]): boolean {
  if (node === false) return true;
  if (!node || typeof node !== 'object' || path.length === 0) return false;
  const [head, ...rest] = path;
  return switchedOff((node as Record<string, unknown>)[head!], rest);
}

/** Expands the nail's shape → length → size offer into one offer per option,
 * minus what the `off` tree switches off. A nail without variations keeps a
 * single `''` entry: exactly today's rows. */
export function expandNailAvailability(
  base: SetAvailability,
  payload: NailVariationPayload,
): NailVariationAvailability {
  if (!payload.axisKey) return { '': base };
  const result: NailVariationAvailability = {};
  for (const option of payload.options) {
    const perOption: SetAvailability = {};
    for (const [shapeKey, lengths] of Object.entries(base)) {
      for (const [lengthKey, sizes] of Object.entries(lengths)) {
        for (const size of SIZES) {
          if (!sizes[size]) continue;
          if (switchedOff(payload.off[option.key], [shapeKey, lengthKey, size])) continue;
          ((perOption[shapeKey] ??= {})[lengthKey] ??= {})[size] = 1;
        }
      }
    }
    result[option.key] = perOption;
  }
  return result;
}

/** Sets `products.variation_axis_key`, the product's option list (with
 * price overrides and each option's own copy) and the option colour rows
 * when any of it differs. Every option must exist in the vocabulary (pushed
 * first by `library-nail`), so an unknown key is refused rather than
 * silently dropped. Product-level colour rows (`option_key = ''`) are left
 * to `replaceSetColors`. */
export async function replaceNailVariationsIfChanged(
  client: pg.Pool,
  productId: string,
  payload: NailVariationPayload,
): Promise<boolean> {
  if (payload.axisKey) {
    const { rows: known } = await client.query<{ option_key: string }>(
      `select option_key from variation_options where axis_key = $1 and option_key = any($2::text[])`,
      [payload.axisKey, payload.options.map((option) => option.key)],
    );
    const knownKeys = new Set(known.map((row) => row.option_key));
    const unknown = payload.options
      .filter((option) => !knownKeys.has(option.key))
      .map((option) => option.key);
    if (unknown.length > 0) {
      throw new InvalidNailVariation(
        `variation(s) ${unknown.join(', ')} not in the "${payload.axisKey}" vocabulary; push the vocabulary first.`,
      );
    }
  }
  // Stored and desired state compared as jsonb, so translation key order
  // never reads as a change: axis, then per option in display order its key,
  // price, copy and colour keys.
  const desired = {
    axis: payload.axisKey,
    options: payload.options.map(({ key, price, copy }) => [
      key,
      price,
      copy?.title ?? null,
      copy?.desc ?? null,
      copy?.alt ?? null,
      copy?.occasion ?? null,
      copy?.colorMainKeys ?? [],
      copy?.colorSecondaryKeys ?? [],
    ]),
  };
  const optionColorsSql = (role: string) =>
    `coalesce((select jsonb_agg(pc.color_key order by pc.sort_order) from product_colors pc
      where pc.product_id = p.id and pc.option_key = pv.option_key and pc.role = '${role}'), '[]'::jsonb)`;
  const { rows: sameRows } = await client.query<{ same: boolean }>(
    `select jsonb_build_object(
       'axis', p.variation_axis_key,
       'options', coalesce((
         select jsonb_agg(jsonb_build_array(pv.option_key, pv.price, pv.title, pv."desc", pv.alt, pv.occasion,
                                            ${optionColorsSql('main')}, ${optionColorsSql('secondary')})
                          order by pv.sort_order)
         from product_variations pv where pv.product_id = p.id), '[]'::jsonb)
     ) = $2::jsonb as same
     from products p where p.id = $1`,
    [productId, JSON.stringify(desired)],
  );
  if (sameRows[0]?.same) return false;

  await client.query(`delete from product_variations where product_id = $1`, [productId]);
  await client.query(`delete from product_colors where product_id = $1 and option_key <> ''`, [productId]);
  await client.query(`update products set variation_axis_key = $2 where id = $1`, [
    productId,
    payload.axisKey,
  ]);
  for (const [index, option] of payload.options.entries()) {
    const copy = option.copy;
    await client.query(
      `insert into product_variations (product_id, axis_key, option_key, sort_order, price, title, "desc", alt, occasion)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        productId,
        payload.axisKey,
        option.key,
        index,
        option.price,
        copy ? JSON.stringify(copy.title) : null,
        copy ? JSON.stringify(copy.desc) : null,
        copy?.alt ? JSON.stringify(copy.alt) : null,
        copy ? JSON.stringify(copy.occasion) : null,
      ],
    );
    const colorRowsToInsert = copy
      ? [
          ...copy.colorMainKeys.map((key, order) => ({ key, role: 'main', order })),
          ...copy.colorSecondaryKeys.map((key, order) => ({ key, role: 'secondary', order })),
        ]
      : [];
    for (const row of colorRowsToInsert) {
      await client.query(
        `insert into product_colors (product_id, option_key, color_key, role, sort_order)
         values ($1, $2, $3, $4, $5)`,
        [productId, option.key, row.key, row.role, row.order],
      );
    }
  }
  // Occasions are listed from every option (filter-options).
  invalidateFilterOptionsCache();
  return true;
}
