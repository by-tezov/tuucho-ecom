import type pg from 'pg';
import { pairVisibleSql, getAvailabilityForSets } from './availability.js';
import { applyFilters } from '../../plugins/application/hooks.js';
import { toPhotoUrl } from './photoUrl.js';
import { getLatestPricesForSets } from './prices.js';
import { matchedOccasionOptions } from './productVariations.js';
import type { FeaturedPeriod, GalleryItem, PartialTrilingual } from '../../../types.js';
import { localize, type Language } from '../../../utils/language.js';
import { resolveProductCopy } from '../domain/productCopy.js';
import { buildProductVariants, defaultCopyContext } from './productVariants.js';
import type { ShapeLengthRow, ShapeRow } from './productVariants.js';

/** Turning already-fetched product rows into the GalleryItem[] every feed
 * returns. One place, so the feed, the single-product lookup, the featured
 * strip and the compose-a-set nail gallery cannot drift apart. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Same semantics as kernel/front's src/assets/library/index.ts
 * activeFeaturedPeriod() — the range starts on `from` and ends just before
 * midnight UTC after `for` days, evaluated against the server's own clock
 * so every visitor (and every environment) sees the same answer. */
function activeFeaturedPeriod(
  featuredFrom: string | null,
  featuredFor: number | null,
): FeaturedPeriod | undefined {
  if (!featuredFrom || !featuredFor) return undefined;
  const fromTimestamp = Date.parse(`${featuredFrom}T00:00:00.000Z`);
  const today = new Date();
  const todayTimestamp = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return todayTimestamp >= fromTimestamp && todayTimestamp < fromTimestamp + featuredFor * DAY_MS
    ? { from: featuredFrom, for: featuredFor }
    : undefined;
}

export interface SetRow {
  id: string;
  product_uid: string;
  title: PartialTrilingual;
  desc: PartialTrilingual;
  /** Nullable in the table; one without used to crash `localize` below. */
  occasion: PartialTrilingual | null;
  alt: PartialTrilingual | null;
  featured_from: string | null;
  featured_for: number | null;
  created_at: string;
  audience: 'public' | 'user-library';
}

interface ColorRow {
  product_id: string;
  /** `''` for the product itself, else the single-nail option it belongs to. */
  option_key: string;
  color_key: string;
  role: 'main' | 'secondary';
  label: PartialTrilingual;
}

interface PhotoRow {
  product_id: string;
  shape_key: string;
  length_key: string;
  variation_key: string;
  small_path: string;
  modal_path: string;
}

interface VariationRow {
  product_id: string;
  axis_key: string;
  axis_title: PartialTrilingual;
  option_key: string;
  option_title: PartialTrilingual;
  price: string | null;
  /** The option's own copy; null on rows imported before per-option copy,
   * which then read the product's (tuucho/docs/plans/nail-variation-copy.md). */
  title: PartialTrilingual | null;
  desc: PartialTrilingual | null;
  alt: PartialTrilingual | null;
  occasion: PartialTrilingual | null;
}

/** Assembles GalleryItem[] from already-fetched rows — shared by every
 * query below so they all produce the exact same shape (see
 * src/types.ts's doc comment on why this must match kernel/front's
 * GalleryItem).
 *
 * `opening.initialVariation` picks, per product id, the single-nail option
 * the item opens on (a `?variation=` link); `opening.occasion` (the feed's
 * occasion filter) picks the first option matching it. The item's top-level
 * copy, colours and `photosByShapeLength` then describe that option, so a
 * caller that knows nothing about options still never shows one option's
 * text next to another's photo. */
export async function assembleItems(
  client: pg.Pool,
  setRows: SetRow[],
  publicMediaUrl: string,
  language: Language,
  availabilityMode: 'quantity' | 'boolean' = 'quantity',
  opening: { initialVariation?: ReadonlyMap<string, string>; occasion?: string[] } = {},
): Promise<GalleryItem[]> {
  if (setRows.length === 0) return [];
  const { initialVariation, occasion } = opening;
  const setIds = setRows.map((row) => row.id);

  const unitAvailability =
    availabilityMode === 'boolean'
      ? await applyFilters<{
          availability: Map<string, unknown>;
          optionAvailability: Map<string, unknown>;
        }>('catalog.itemAvailability', { availability: new Map(), optionAvailability: new Map() }, {
          client,
          productIds: setIds,
          productType: 'nail_single',
        })
      : null;

  // Six independent reads, none of which depends on another's result. Issued
  // together so the page costs one round trip instead of six — this function
  // backs the gallery feed, the product page, featured items, cart hydration
  // and /gallery/products, so the serial version was six round trips on every
  // one of them.
  const [
    { rows: shapeRows },
    { rows: shapeLengthRows },
    { rows: colorRows },
    { rows: photoRows },
    pricesBySet,
    availabilityBySet,
    { rows: variationRows },
    availabilityByOptionBySet,
    occasionOptions,
  ] = await Promise.all([
    client.query<ShapeRow>(
      `select gss.product_id, gss.shape_key, s.label, s.gender, s.attributive
       from product_shapes gss
       join shapes s on s.key = gss.shape_key
       where gss.product_id = any($1::uuid[])
         and exists (
           select 1 from product_shape_lengths visible_length
           where visible_length.product_id = gss.product_id
             and visible_length.shape_key = gss.shape_key
             and not visible_length.hidden
         )
       order by gss.product_id, gss.sort_order`,
      [setIds],
    ),
    client.query<ShapeLengthRow>(
      `select gsl.product_id, gsl.shape_key, gsl.length_key, sl.label, sl.gender
       from product_shape_lengths gsl
       join shape_lengths sl on sl.shape_key = gsl.shape_key and sl.length_key = gsl.length_key
       where gsl.product_id = any($1::uuid[]) and not gsl.hidden
       order by gsl.product_id, gsl.shape_key, gsl.sort_order`,
      [setIds],
    ),
    client.query<ColorRow>(
      `select gsc.product_id, gsc.option_key, gsc.color_key, gsc.role, c.label
       from product_colors gsc
       join colors c on c.key = gsc.color_key
       where gsc.product_id = any($1::uuid[])
       order by gsc.product_id, gsc.option_key, gsc.role, gsc.sort_order`,
      [setIds],
    ),
    client.query<PhotoRow>(
      `select pp.product_id, pp.shape_key, pp.length_key, pp.variation_key, pp.small_path, pp.modal_path
       from product_photos pp
       where pp.product_id = any($1::uuid[]) and ${pairVisibleSql('pp')}
       order by pp.product_id, pp.shape_key, pp.length_key, pp.variation_key, pp."position"`,
      [setIds],
    ),
    getLatestPricesForSets(client, setIds),
    unitAvailability
      ? Promise.resolve(unitAvailability.availability)
      : getAvailabilityForSets(client, setIds),
    client.query<VariationRow>(
      `select pv.product_id, pv.axis_key, va.title as axis_title, pv.option_key, vo.title as option_title, pv.price,
              pv.title, pv."desc", pv.alt, pv.occasion
       from product_variations pv
       join variation_axes va on va.key = pv.axis_key
       join variation_options vo on vo.axis_key = pv.axis_key and vo.option_key = pv.option_key
       where pv.product_id = any($1::uuid[])
       order by pv.product_id, pv.sort_order`,
      [setIds],
    ),
    unitAvailability
      ? Promise.resolve(unitAvailability.optionAvailability)
      : Promise.resolve(new Map<string, never>()),
    matchedOccasionOptions(client, setRows, occasion),
  ]);

  const variationsBySet = new Map<string, VariationRow[]>();
  for (const row of variationRows) {
    const list = variationsBySet.get(row.product_id) ?? [];
    list.push(row);
    variationsBySet.set(row.product_id, list);
  }

  const shapesBySet = new Map<string, ShapeRow[]>();
  for (const row of shapeRows) {
    const list = shapesBySet.get(row.product_id) ?? [];
    list.push(row);
    shapesBySet.set(row.product_id, list);
  }

  const shapeLengthsBySet = new Map<string, ShapeLengthRow[]>();
  for (const row of shapeLengthRows) {
    const list = shapeLengthsBySet.get(row.product_id) ?? [];
    list.push(row);
    shapeLengthsBySet.set(row.product_id, list);
  }

  // `<product_id>` for the product's own colours, `<product_id>/<option>` for
  // a single-nail option's.
  const colorsBySet = new Map<string, ColorRow[]>();
  for (const row of colorRows) {
    const mapKey = row.option_key ? `${row.product_id}/${row.option_key}` : row.product_id;
    const list = colorsBySet.get(mapKey) ?? [];
    list.push(row);
    colorsBySet.set(mapKey, list);
  }
  const colorLabels = (mapKey: string) => {
    const entries = colorsBySet.get(mapKey) ?? [];
    return {
      colorMain: entries.filter((row) => row.role === 'main').map((row) => localize(row.label, language)),
      colorSecondary: entries
        .filter((row) => row.role === 'secondary')
        .map((row) => localize(row.label, language)),
    };
  };

  const photosBySet = new Map<string, PhotoRow[]>();
  for (const row of photoRows) {
    const list = photosBySet.get(row.product_id) ?? [];
    list.push(row);
    photosBySet.set(row.product_id, list);
  }

  return setRows.map((set): GalleryItem => {
    const shapeEntries = shapesBySet.get(set.id) ?? [];
    const shapeLengthEntries = shapeLengthsBySet.get(set.id) ?? [];
    const allPhotos = photosBySet.get(set.id) ?? [];
    const variationEntries = variationsBySet.get(set.id) ?? [];
    // The initial option (the first one unless the caller picked another)
    // stands in for the nail everywhere that knows nothing about variations:
    // its photos, copy and colours are the item's top-level ones.
    const requestedOption = initialVariation?.get(set.id) ?? occasionOptions.get(set.id);
    const initialEntry =
      variationEntries.find((row) => row.option_key === requestedOption) ?? variationEntries[0];
    const defaultOption = initialEntry?.option_key ?? '';
    const setPhotos = allPhotos.filter((photo) => photo.variation_key === defaultOption);
    let photosByVariation: GalleryItem['photosByVariation'];
    if (variationEntries.length > 0) {
      photosByVariation = {};
      for (const photo of allPhotos) {
        if (!photo.variation_key) continue;
        (((photosByVariation[photo.shape_key] ??= {})[photo.length_key] ??= {})[photo.variation_key] ??=
          []).push({
          small: toPhotoUrl(publicMediaUrl, photo.small_path),
          modal: toPhotoUrl(publicMediaUrl, photo.modal_path),
        });
      }
    }

    const variants = buildProductVariants(
      shapeEntries,
      shapeLengthEntries,
      setPhotos,
      publicMediaUrl,
      language,
    );

    const featured = activeFeaturedPeriod(set.featured_from, set.featured_for);

    // `desc`/`alt` stay resolved against the set's default shape and length
    // (its first, the same convention the first photo follows), so a caller
    // that knows nothing about placeholders still gets a correct sentence.
    // `descTemplate`/`altTemplate` carry the authored text so a caller with a
    // shape picker can re-resolve as the visitor changes shape.
    const defaultContext = defaultCopyContext(variants);
    // One option's copy; the product's own for a nail without options and for
    // an option imported before per-option copy existed.
    const copyOf = (entry: VariationRow | undefined) => {
      const ownCopy = !!entry?.title && !!entry.desc && !!entry.occasion;
      const titleSource = ownCopy ? entry!.title! : set.title;
      const descSource = ownCopy ? entry!.desc! : set.desc;
      const altSource = ownCopy ? entry!.alt : set.alt;
      const occasionSource = ownCopy ? entry!.occasion : set.occasion;
      const descTemplate = localize(descSource, language);
      const altTemplate = altSource ? localize(altSource, language) : null;
      const colors =
        entry && colorsBySet.has(`${set.id}/${entry.option_key}`)
          ? colorLabels(`${set.id}/${entry.option_key}`)
          : colorLabels(set.id);
      return {
        title: localize(titleSource, language),
        desc: resolveProductCopy(descTemplate, defaultContext),
        descTemplate,
        alt: altTemplate === null ? null : resolveProductCopy(altTemplate, defaultContext),
        altTemplate,
        occasion: occasionSource ? localize(occasionSource, language) : '',
        ...colors,
      };
    };
    const itemCopy = copyOf(initialEntry);

    return {
      id: set.id,
      ...variants,
      ...itemCopy,
      productUid: set.product_uid,
      ...(set.audience === 'user-library' ? { isUserLibrary: true } : {}),
      featured,
      isFeatured: !!featured,
      price: pricesBySet.get(set.id),
      available: (availabilityBySet.get(set.id) ?? {}) as GalleryItem['available'],
      ...(variationEntries.length > 0
        ? {
            variation: {
              key: variationEntries[0]!.axis_key,
              label: localize(variationEntries[0]!.axis_title, language),
              options: variationEntries.map((row) => ({
                key: row.option_key,
                label: localize(row.option_title, language),
                ...(row.price === null ? {} : { price: Number(row.price) }),
                ...copyOf(row),
              })),
            },
            ...(initialEntry && initialEntry !== variationEntries[0]
              ? { initialVariation: initialEntry.option_key }
              : {}),
            photosByVariation,
            availableByOption: (availabilityByOptionBySet.get(set.id) ?? {}) as GalleryItem['availableByOption'],
          }
        : {}),
    };
  });
}
