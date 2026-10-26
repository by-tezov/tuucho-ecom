/** OPS_TOKEN-gated CLI driving this backend's /operation/library-import/*
 * API to keep the DB in sync with catalog source's static gallery library
 * (product/library/<id>/...) — entirely through that API (see
 * src/api/libraryImport.routes.ts), never a direct DB/filesystem
 * connection. That's deliberate, not just tidiness: preprod/prod have no
 * SSH on this LWS plan, so a script running on your own machine has no way
 * to reach their Postgres or MEDIA_DIR directly — the API is the only door
 * in, same as every other write this backend accepts remotely.
 *
 * Usage:
 *   npm run library -- seed [<target>] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run library -- delete <target> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run library -- delete-shape <key> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run library -- delete-color <key> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run library -- delete-all [--confirm] [--json] --dev|--preprod|--prod
 *   npm run library -- check [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run library -- stock-report [--from <val>] [--to <val>] [--limit <n>]
 *     [--with-orders] [--not-sent] [--json] --dev|--preprod|--prod
 *
 *   --confirm       required on seed (unless --direction local, which only
 *                    reads the target DB)/delete/delete-shape/delete-color/
 *                    delete-all, only when targeting --prod — never for
 *                    --dev/--preprod. check/stock-report are read-only and
 *                    never need it.
 *   --json          (all commands) prints one JSON object to stdout instead
 *                    of the human-readable lines, moving every other line to
 *                    stderr — safe to pipe into `jq`, a file, or another
 *                    script.
 *
 *   <target>        a folder id (0158) or a product-uid (AQ-YZ-367,
 *                    case-insensitive) — same identifier convention as
 *                    catalog source's scripts/feature-nails.mjs.
 *   --update        an existing product-uid is normally a no-op; with this
 *                    flag, a difference between the two sides updates the
 *                    *destination* side in place. In the default
 *                    `--direction remote` this means the DB (same id — see
 *                    libraryImport.routes.ts's comment on why not
 *                    delete+recreate — and re-uploads its photos); in
 *                    `--direction local` it means this folder's own
 *                    data-static.json.
 *   --direction     `remote` (default) pushes catalog source's local
 *                    library up into the DB, same as always. `local` is the
 *                    reverse: pulls each target folder's *current DB row*
 *                    back down into its own data-static.json, as a *minimal*
 *                    hand override. The override-only fields (creation-date/
 *                    price/available/featured/hidden/loyalties/users) are
 *                    always written; the generated-side ones (title/desc/
 *                    occasion/alt/shape/color-main/color-secondary) only when
 *                    the DB value actually differs from data-generated.json,
 *                    per library/README.md's "only include the keys you're
 *                    actually overriding". Photos are never pulled, and a
 *                    folder whose product-uid has no matching DB row is
 *                    skipped with a warning (nothing to pull), not an error.
 *                    seed-only — delete/delete-all/check are already
 *                    single-direction by nature.
 *   --delete        (seed only, requires --update and no <target>) makes
 *                    the destination match the full source. `remote`
 *                    deletes DB-only sets/shapes/colors; `local` removes
 *                    manager-only set folders and vocabulary keys.
 *   --dev|--preprod|--prod  required, no default — picks which deployment to talk
 *                    to and which kernel private JSON OPS_TOKEN to
 *                    send.
 *   --source        defaults to catalog import tree/product/library relative
 *                    to this repo, i.e. assumes the repos are checked out as
 *                    siblings.
 *
 * `seed` with no <target>: every folder in the library, each entry's
 * product-uid checked against what's already there (safe to re-run) —
 * regardless of `--direction`.
 * `delete-all`: wipes every gallery set **and** the shapes/colors
 * vocabulary tables — requires `--confirm`, same safety bar as `order --
 * delete-all`.
 * `check`: read-only — never writes anything, just reports.
 *
 * `stock-report`: read-only. Reports stock in units (not product headcount)
 * by size (XS/S/M/L) plus a grand total, and a per-product table sorted by
 * creation-date (newest first) — same --from/--to/--limit paging convention
 * as `npm run user -- list`, except the one date this command knows about is
 * a product's own creation-date (there's no per-product last-connected/IP/
 * lock concept, so those user.ts flags don't apply here).
 *
 * By default the numbers come from each product's `available` stock table
 * (library/README.md's "available" section) — what's currently sellable —
 * and the table has one row per product (columns: productUid/title/created/
 * XS/S/M/L/total). --with-orders switches the source to live orders
 * instead: units summed from order items whose order is anywhere in the
 * confirmed -> sent pipeline (confirmed, in_preparation, to_send, sent) —
 * i.e. stock already committed to an order, not yet available for a new
 * sale. --not-sent narrows that further to orders not yet physically
 * shipped (confirmed, in_preparation, to_send — excludes sent). Only one of
 * the two may be given.
 *
 * In either order mode the table switches to one row per *order item*
 * instead of per product (columns: orderNumber/userEmail/orderCreated/
 * productUid/title/size/quantity) — a product's committed stock can come from
 * several different orders/customers at once, and a single row can't carry
 * more than one order number. Only order items that actually match the
 * selected statuses are listed (no zero-rows for the rest of the catalog);
 * the totals/table shown always reflect every match within the --from/--to
 * creation-date window (still a product's own creation-date, not the
 * order's), before --limit trims the displayed page — same "total vs
 * shown" split as `user -- list`.
 */
import { Command as Program, Option } from 'commander';
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { readdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProductUid } from '../src/modules/catalog/domain/productUid.js';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';
import {
  folderShapeLengths,
  hiddenPairsKey,
  hiddenToStatic,
  parseHidden,
  refKeys,
  unrefKeys,
  type HiddenPair,
} from './libraryVariants.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..');

const program = new Program();
program
  .name('library')
  .description(
    'OPS_TOKEN-gated CLI driving /operation/library-import/* to keep the DB in sync with the static gallery library.',
  );
const fail: (message: string) => never = makeFail(program, 'library');

type Command = 'seed' | 'delete' | 'delete-shape' | 'delete-color' | 'delete-all' | 'check' | 'stock-report';
type Direction = 'local' | 'remote';

interface Args {
  command: Command;
  target: string | undefined;
  update: boolean;
  deleteMissing: boolean;
  direction: Direction;
  mode: string;
  source: string | undefined;
  confirm: boolean;
  json: boolean;
}

interface StockReportArgs {
  command: 'stock-report';
  offset: number;
  limit: number | undefined;
  withOrders: boolean;
  notSent: boolean;
  creationAfter: string | undefined;
  creationBefore: string | undefined;
  mode: string;
  json: boolean;
  audience: 'public' | 'user-library';
}

type ParsedFromTo = { kind: 'index'; value: number } | { kind: 'date'; iso: string };

/** Same three forms as scripts/user.ts's own --from/--to (index / relative
 * day count "Nd" / absolute date) — kept as its own copy here rather than a
 * shared import since every script in this repo is a standalone CLI (see
 * this file's header comment on why library.ts never reaches into another
 * script's module). The date form resolves to a plain YYYY-MM-DD, matching
 * a product's own creation-date field (date-only, no time-of-day). */
function parseFromTo(raw: string, flagName: string): ParsedFromTo {
  const daysMatch = /^(\d+)d$/.exec(raw);
  if (daysMatch) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - Number(daysMatch[1]));
    return { kind: 'date', iso: date.toISOString().slice(0, 10) };
  }
  if (/^\d+$/.test(raw)) return { kind: 'index', value: Number(raw) };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    fail(
      `${flagName} "${raw}" isn't a valid index, a relative day count (e.g. "5d"), or a date (YYYY-MM-DD).`,
    );
  }
  return { kind: 'date', iso: parsed.toISOString().slice(0, 10) };
}

interface StockReportOpts {
  mode: Mode;
  json?: boolean;
  from?: string;
  to?: string;
  limit?: string;
  withOrders?: boolean;
  notSent?: boolean;
  audience?: 'public' | 'user-library';
}

function buildStockReportArgs(opts: StockReportOpts): StockReportArgs {
  if (opts.withOrders && opts.notSent) fail('--with-orders and --not-sent are mutually exclusive.');

  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;
  let offset = 0;
  let resolvedLimit = limit;
  let creationAfter: string | undefined;
  let creationBefore: string | undefined;

  if (opts.from !== undefined || opts.to !== undefined) {
    const from = opts.from !== undefined ? parseFromTo(opts.from, '--from') : undefined;
    const to = opts.to !== undefined ? parseFromTo(opts.to, '--to') : undefined;
    if (from && to && from.kind !== to.kind) {
      fail('--from and --to must be the same kind: both indexes, or both dates/relative day counts.');
    }
    if ((from?.kind ?? to?.kind) === 'index') {
      if (limit !== undefined) fail('--limit cannot be combined with an index --from/--to range.');
      offset = from?.kind === 'index' ? from.value : 0;
      if (to?.kind === 'index') resolvedLimit = to.value - offset + 1;
      if (resolvedLimit !== undefined && (!Number.isSafeInteger(resolvedLimit) || resolvedLimit <= 0)) {
        fail('--from/--to index range must resolve to a positive count.');
      }
    } else {
      // date mode — --from is the more-recent boundary (upper bound on
      // creation-date), --to is the further-back boundary (lower bound),
      // same convention as scripts/user.ts's --from/--to.
      if (from?.kind === 'date') creationBefore = from.iso;
      if (to?.kind === 'date') creationAfter = to.iso;
    }
  }
  if (!Number.isSafeInteger(offset) || offset < 0)
    fail('--from must be a non-negative integer when used as an index.');
  if (resolvedLimit !== undefined && (!Number.isSafeInteger(resolvedLimit) || resolvedLimit <= 0)) {
    fail('--limit must be a positive integer.');
  }

  return {
    command: 'stock-report',
    offset,
    limit: resolvedLimit,
    withOrders: Boolean(opts.withOrders),
    notSent: Boolean(opts.notSent),
    creationAfter,
    creationBefore,
    mode: opts.mode,
    json: Boolean(opts.json),
    audience: opts.audience ?? 'public',
  };
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...opsRequestHeaders(opsToken), ...init?.headers },
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const rawError =
      body && typeof body === 'object' && 'error' in body ? (body as { error: unknown }).error : undefined;
    const message =
      typeof rawError === 'string'
        ? rawError
        : rawError !== undefined
          ? JSON.stringify(rawError)
          : res.statusText;
    throw new Error(`${path} -> ${res.status} ${message}`);
  }
  return body;
}

function apiJson(apiBaseUrl: string, opsToken: string, path: string, payload: unknown): Promise<unknown> {
  return apiFetch(apiBaseUrl, opsToken, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

import {
  readLayeredDataCommon,
  resolveVariationVocabulary,
  type VariationVocabulary,
} from './libraryVocabularyLayers.js';

interface RawPartial {
  fr?: string;
  en?: string;
  th?: string;
  es?: string;
  it?: string;
  nl?: string;
  pt?: string;
}

/** One entry of the shared root `length` table in data-common.json. */
interface RawShapeLength {
  value?: string;
  title?: RawPartial;
  /** Grammatical gender per language, `{"fr": "m", "en": ""}` — what lets a
   * set's authored copy write `$length.title` and still agree. Optional: a shape
   * vocabulary authored before this existed simply has none. */
  gender?: Record<string, string>;
}

/** A shape entry, resolved: its own title plus the lengths it's cut in
 * (always at least "medium"), each already looked up from the shared root
 * `length` table. This is the flattened form every other function in this
 * file works with (the vocabulary wire payload, the DB's own per-shape
 * storage, and `shapeMapsDiffer`/`writeVocabulary` all operate one length
 * per shape, same as before this file's `length` table was deduplicated on
 * the catalog source side) — only `loadVocabulary`/`writeVocabulary`
 * translate to/from data-common.json's own on-disk shape below. */
interface RawShape {
  title?: RawPartial;
  gender?: Record<string, string>;
  /** The form a sentence uses with the plural word for "nails" — « ongles
   * carrés » where `title` is « carré » — resolving `$shape.attributive` in a set's
   * copy. */
  attributive?: RawPartial;
  length?: Record<string, RawShapeLength>;
}

/** A shape entry as it's actually stored in data-common.json — its own
 * title plus an array of `"$key"` references into the shared root `length`
 * table below, mirroring how a set's own `data-generated.json` `shape`
 * field references shapes/colors. */
interface DataCommonShape {
  title?: RawPartial;
  gender?: Record<string, string>;
  attributive?: RawPartial;
  length?: string[];
}

interface DataCommon {
  shape: Record<string, DataCommonShape>;
  length?: Record<string, RawShapeLength>;
  color: Record<string, RawPartial>;
}

interface GeneratedMeta {
  title?: RawPartial;
  desc?: RawPartial;
  occasion?: RawPartial;
  /** Optional authored image alt text — same shape as title/desc, absent
   * until catalog source's generation pass produces one for this set. */
  alt?: RawPartial;
  /** `{ "$almond": ["$default"] }` — shape refs to their length refs. */
  shape?: Record<string, string[]>;
  'color-main'?: string[];
  'color-secondary'?: string[];
  /** Single nails: one axis and its options in display order
   * (tuucho/docs/plans/nail-variations.md). Either the list form
   * `{ "$color": ["$pink", "$emerald"] }`, or the object form
   * `{ "$color": { "$pink": { title, desc, alt, occasion, color-main,
   * color-secondary }, … } }` where each option carries its own copy and any
   * field it leaves out falls back to the nail-level one
   * (tuucho/docs/plans/nail-variation-copy.md). */
  variation?: Record<string, string[] | Record<string, OptionMeta>>;
  /** Per-shape/length modal SHA-256 hashes from prepare-library. `photo` is
   * the filename stem; numeric `photo` and temporary `file` stay readable.
   * A nail with variations has one more level: shape → length → option. */
  photos?: Record<string, Record<string, PhotoEntries | Record<string, PhotoEntries>>>;
}

type PhotoEntries = Array<{ photo?: string | number; file?: string; hash?: string }>;

/** One variation option's own copy in data-generated.json. */
interface OptionMeta {
  title?: RawPartial;
  desc?: RawPartial;
  alt?: RawPartial;
  occasion?: RawPartial;
  'color-main'?: string[];
  'color-secondary'?: string[];
}

/** One option as imported: price override plus its resolved copy. */
interface DesiredVariation {
  key: string;
  price: number | null;
  title: RawPartial;
  desc: RawPartial;
  alt: RawPartial | null;
  occasion: RawPartial;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
}

type Size = 'XS' | 'S' | 'M' | 'L';
const SIZES: Size[] = ['XS', 'S', 'M', 'L'];

interface StaticMeta extends GeneratedMeta {
  'product-uid'?: string;
  'creation-date'?: string;
  /** `true`/`false` for the whole product, or `{ "$shape": true }` /
   * `{ "$shape": { "$length": true } }` for part of it
   * (tuucho/docs/plans/variant-visibility.md). */
  hidden?: boolean | Record<string, boolean | Record<string, boolean>>;
  featured?: { from: string; for: number };
  /** A number, or (single nails with variations) `{ default, $<option>: … }`. */
  price?: number | Record<string, number>;
  /** Single nails: options switched off, sparse $option → $shape → $length →
   * size tree of `false`. */
  variations?: Record<string, unknown>;
  /** Quantity in stock, nested by `$shape` then `$length` (vocabulary refs;
   * bare keys still read) then size — see library/README.md's "available"
   * section. A missing size means 0 in stock, not an explicit zero. */
  available?: Record<string, Record<string, Partial<Record<Size, number>>>>;
  /** Only for product/library-user: account UUIDs and/or customer emails. */
  users?: string[];
  /** Per-product loyalty earn multiplier (maps to products.loyalty_multiplier). */
  loyalties?: number;
}

type SetAvailability = Record<string, Record<string, Partial<Record<Size, number>>>>;

function mergeTrilingual(
  generated: RawPartial | undefined,
  staticOverride: RawPartial | undefined,
): RawPartial | undefined {
  const merged = { ...generated, ...staticOverride };
  if (!merged.fr) return undefined;
  return merged;
}

/** Array fields: data-static.json replaces the whole array when present,
 * same "no entry-by-entry merge" rule as catalog source's own
 * overwriteArrays (see library/README.md). */
function mergeArray(generated: string[] | undefined, staticOverride: string[] | undefined): string[] {
  return staticOverride ?? generated ?? [];
}

/** `photos` is keyed `$shape` → `$length` (→ `$option`); the importer works
 * on bare keys. */
/** A variation nail's data-generated.json is `"is-variation": true` plus one
 * root entry per option keyed `$<axis>.<option>`, in display order, each with
 * its own copy and its own `photos` ($shape → $length). Read here into the
 * importer's single view: `variation` (axis → option → copy) and `photos`
 * ($shape → $length → option). */
const OPTION_ENTRY_RE = /^\$([^.$]+)\.([^.$]+)$/;

function normalizeGeneratedKeys(generated: GeneratedMeta): GeneratedMeta {
  const raw = generated as GeneratedMeta & Record<string, unknown>;
  if (raw['is-variation'] !== true) {
    return generated.photos ? { ...generated, photos: unrefKeys(generated.photos, 3) } : generated;
  }
  // Options of a second axis land under their own axis key, which
  // buildFolderView refuses ("more than one variation axis").
  const variation: Record<string, Record<string, OptionMeta>> = {};
  const photos: Record<string, Record<string, Record<string, PhotoEntries>>> = {};
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    const match = OPTION_ENTRY_RE.exec(key);
    if (!match || !value || typeof value !== 'object' || Array.isArray(value)) {
      if (key !== 'is-variation' && key !== 'photos' && key !== 'variation') shared[key] = value;
      continue;
    }
    const [, axis, option] = match as unknown as [string, string, string];
    const { photos: optionPhotos, ...copy } = value as OptionMeta & {
      photos?: Record<string, Record<string, PhotoEntries>>;
    };
    (variation[`$${axis}`] ??= {})[`$${option}`] = copy;
    for (const [shapeKey, byLength] of Object.entries(unrefKeys(optionPhotos ?? {}, 2))) {
      for (const [lengthKey, list] of Object.entries(byLength ?? {})) {
        ((photos[shapeKey] ??= {})[lengthKey] ??= {})[option] = list;
      }
    }
  }
  return { ...(shared as GeneratedMeta), variation, photos };
}

/** `available` ($shape → $length), the nail `variations` off tree ($option →
 * $shape → $length) and the nail `price` object ($option) are read on bare
 * keys. `hidden` is resolved by parseHidden, which strips its own. */
function normalizeStaticKeys(meta: StaticMeta): StaticMeta {
  return {
    ...meta,
    ...(meta.available ? { available: unrefKeys(meta.available, 2) } : {}),
    ...(meta.variations ? { variations: unrefKeys(meta.variations, 3) } : {}),
    ...(meta.price && typeof meta.price === 'object' ? { price: unrefKeys(meta.price, 1) } : {}),
  };
}

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  const text = await readFile(path, 'utf8');
  if (!text.trim()) return undefined;
  return JSON.parse(text) as T;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const NAIL_UID_RE = {
  test(value: string) {
    return isProductUid(value);
  },
};
const FOLDER_ID_RE = /^\d{4}$/;

async function listFolderIds(sourceDir: string): Promise<string[]> {
  return (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== '_new')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function resolveFolderIdsForCreate(sourceDir: string, target: string | undefined): Promise<string[]> {
  const allFolderIds = await listFolderIds(sourceDir);
  if (target === undefined) return allFolderIds;
  if (allFolderIds.includes(target)) return [target];

  if (NAIL_UID_RE.test(target)) {
    const upper = target.toUpperCase();
    for (const folderId of allFolderIds) {
      const staticMeta = await readJsonIfExists<StaticMeta>(join(sourceDir, folderId, 'data-static.json'));
      if (staticMeta?.['product-uid']?.toUpperCase() === upper) return [folderId];
    }
    fail(`No folder in ${sourceDir} has product-uid "${upper}".`);
  }

  fail(
    `"${target}" is not a folder in ${sourceDir}, and isn't a product-uid (A-Z, 0-9, single dashes, 1-20 characters).`,
  );
}

async function resolveProductUidForDelete(sourceDir: string, target: string): Promise<string> {
  if (NAIL_UID_RE.test(target)) return target.toUpperCase();
  if (FOLDER_ID_RE.test(target)) {
    const staticMeta = await readJsonIfExists<StaticMeta>(join(sourceDir, target, 'data-static.json'));
    const productUid = staticMeta?.['product-uid'];
    if (!productUid)
      fail(
        `Folder "${target}" has no data-static.json / product-uid in ${sourceDir} — pass its product-uid directly instead.`,
      );
    return productUid;
  }
  fail(`"${target}" must be a four-digit folder id or a product-uid (A-Z, 0-9, single dashes, 1-20 characters).`);
}

/** Vocabulary source-of-truth lives in product/data-common.json — shared by
 * library, library-nail, and library-user. A pure local read, no API call, so
 * `check` can validate shape/color keys without writing anything. Resolves
 * each shape's `"$key"` length references against the shared root `length`
 * table into the flattened per-shape form every other function here expects
 * (see RawShape's doc) — a dangling reference (a length key with no matching
 * root entry) is dropped, same rule as a dangling shape/color reference
 * elsewhere in this file. */
function vocabularyPath(sourceDir: string): string {
  return join(dirname(sourceDir), 'data-common.json');
}

async function loadVocabulary(sourceDir: string): Promise<{
  shapes: Record<string, RawShape>;
  colors: Record<string, RawPartial>;
  variations?: VariationVocabulary;
}> {
  // Root product/data-common.json merged with this catalogue's own file
  // (scripts/libraryVocabularyLayers.ts); a key at both levels throws.
  const layers = readLayeredDataCommon(sourceDir);
  const dataCommon = layers.tables as unknown as Partial<DataCommon>;
  const lengthTable = dataCommon?.length ?? {};
  const shapes: Record<string, RawShape> = {};
  for (const [shapeKey, entry] of Object.entries(dataCommon?.shape ?? {})) {
    const length: Record<string, RawShapeLength> = {};
    for (const ref of entry.length ?? []) {
      const lengthKey = ref.replace(/^\$/, '');
      const lengthEntry = lengthTable[lengthKey];
      if (lengthEntry) length[lengthKey] = lengthEntry;
    }
    shapes[shapeKey] = {
      title: entry.title,
      gender: entry.gender,
      attributive: entry.attributive,
      length,
    };
  }
  const variations = resolveVariationVocabulary(layers);
  return { shapes, colors: dataCommon?.color ?? {}, ...(variations ? { variations } : {}) };
}

async function pushVocabulary(
  apiBaseUrl: string,
  opsToken: string,
  vocab: {
    shapes: Record<string, RawShape>;
    colors: Record<string, RawPartial>;
    variations?: VariationVocabulary;
  },
  deleteMissing = false,
  json = false,
): Promise<{ shapes: number; colors: number; deletedShapes: string[]; deletedColors: string[] }> {
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/library-import/vocabulary', {
    ...vocab,
    deleteMissing,
  })) as {
    shapes: number;
    colors: number;
    deletedShapes: string[];
    deletedColors: string[];
    variationAxes?: number;
    variationOptions?: number;
    deletedVariations?: string[];
  };
  log(json, `[library] vocabulary: ${result.shapes} shapes, ${result.colors} colors.`);
  if (vocab.variations) {
    log(
      json,
      `[library] variations: ${result.variationAxes ?? 0} axes, ${result.variationOptions ?? 0} options.`,
    );
    for (const key of result.deletedVariations ?? []) log(json, `[library] deleted stale variation ${key}.`);
  }
  for (const key of result.deletedShapes) log(json, `[library] deleted stale shape ${key}.`);
  for (const key of result.deletedColors) log(json, `[library] deleted stale color ${key}.`);
  return result;
}

/** Inverse of `loadVocabulary`'s resolution: deduplicates each shape's
 * flattened `length` map back into the shared root `length` table plus
 * `"$key"` references, so a `pull --update` (the only caller, when the DB's
 * vocabulary differs from the local file) writes data-common.json back in
 * its real on-disk shape instead of reintroducing per-shape-duplicated
 * length objects. Identical length keys across shapes are assumed to mean
 * the same length (true in practice — they all originate from the same
 * manager-authored table); the last shape holding a given key wins if two
 * ever disagree. */
function writeVocabulary(
  sourceDir: string,
  vocab: { shapes: Record<string, RawShape>; colors: Record<string, RawPartial> },
): void {
  const length: Record<string, RawShapeLength> = {};
  const shape: Record<string, DataCommonShape> = {};
  for (const [shapeKey, entry] of Object.entries(vocab.shapes)) {
    const refs: string[] = [];
    for (const [lengthKey, lengthEntry] of Object.entries(entry.length ?? {})) {
      length[lengthKey] = lengthEntry;
      refs.push(`$${lengthKey}`);
    }
    shape[shapeKey] = {
      title: entry.title,
      gender: entry.gender,
      attributive: entry.attributive,
      length: refs,
    };
  }
  writeFileSync(
    vocabularyPath(sourceDir),
    `${JSON.stringify({ shape, length, color: vocab.colors }, null, 2)}\n`,
  );
}

function trilingualMapsDiffer(a: Record<string, RawPartial>, b: Record<string, RawPartial>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].some((key) => !a[key] || !b[key] || trilingualDiffers(a[key]!, b[key]!));
}

/** Same idea as trilingualMapsDiffer for the shape table, which is two
 * levels deep now: the shape's own title plus one title (and physical
 * `value`) per length it declares. */
/** An absent gender map and an empty one mean the same thing, so they must
 * not read as a difference and trigger a pointless push. */
function genderDiffers(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const left = a ?? {};
  const right = b ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].some((key) => (left[key] ?? '') !== (right[key] ?? ''));
}

function shapeMapsDiffer(a: Record<string, RawShape>, b: Record<string, RawShape>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].some((key) => {
    const shapeA = a[key];
    const shapeB = b[key];
    if (!shapeA || !shapeB) return true;
    if (trilingualDiffers(shapeA.title ?? {}, shapeB.title ?? {})) return true;
    if (genderDiffers(shapeA.gender, shapeB.gender)) return true;
    if (trilingualDiffers(shapeA.attributive ?? {}, shapeB.attributive ?? {})) return true;
    const lengthsA = shapeA.length ?? {};
    const lengthsB = shapeB.length ?? {};
    const lengthKeys = new Set([...Object.keys(lengthsA), ...Object.keys(lengthsB)]);
    return [...lengthKeys].some((lengthKey) => {
      const lengthA = lengthsA[lengthKey];
      const lengthB = lengthsB[lengthKey];
      if (!lengthA || !lengthB) return true;
      return (
        (lengthA.value ?? '') !== (lengthB.value ?? '') ||
        trilingualDiffers(lengthA.title ?? {}, lengthB.title ?? {}) ||
        genderDiffers(lengthA.gender, lengthB.gender)
      );
    });
  });
}

interface PhotoFile {
  modalPath: string;
  /** SHA-256 of modal bytes from data-generated.json `photos`, when present. */
  hash: string | null;
}

/** Only the modal/ folder is read — every photo this backend accepts (admin
 * upload or library import alike) is expected to already be at modal
 * quality/size; media/storage.ts derives just the small grid thumbnail from
 * it. library/'s own pre-made small/ copy is irrelevant here (the backend
 * generates its own from the modal file). Every image uses the filename stem
 * recorded as `photo` in data-generated.json. Legacy numeric `photo` values
 * and temporary full-filename `file` values remain readable. */
async function collectPhotos(
  setDir: string,
  shapeKey: string,
  lengthKey: string,
  generatedPhotos?: GeneratedMeta['photos'],
  /** Single nail variation option: `modal/<shape>/<length>/<variation>/`. */
  variationKey = '',
): Promise<PhotoFile[]> {
  const modalDir = variationKey
    ? join(setDir, 'modal', shapeKey, lengthKey, variationKey)
    : join(setDir, 'modal', shapeKey, lengthKey);
  if (!existsSync(modalDir)) return [];

  const parseNum = (filename: string) => {
    const match = /^(\d+)\.(?:jpe?g|png|webp)$/i.exec(filename);
    return match ? Number(match[1]) : undefined;
  };
  const isImage = (filename: string) => /\.(?:jpe?g|png|webp)$/i.test(filename);

  const hashByPhoto = new Map<string, string>();
  const hashByFile = new Map<string, string>();
  const lengthEntries = generatedPhotos?.[shapeKey]?.[lengthKey];
  const shapeEntries = variationKey
    ? lengthEntries && !Array.isArray(lengthEntries)
      ? lengthEntries[variationKey]
      : undefined
    : lengthEntries;
  if (Array.isArray(shapeEntries)) {
    for (const entry of shapeEntries) {
      if (
        (typeof entry?.photo === 'string' || typeof entry?.photo === 'number') &&
        typeof entry?.hash === 'string' &&
        entry.hash.length > 0
      ) {
        hashByPhoto.set(String(entry.photo), entry.hash);
      }
      if (typeof entry?.file === 'string' && typeof entry?.hash === 'string' && entry.hash.length > 0) {
        hashByFile.set(entry.file, entry.hash);
      }
    }
  }

  const files = (await readdir(modalDir)).filter(isImage).sort((left, right) => {
    const leftNumber = parseNum(left);
    const rightNumber = parseNum(right);
    if (leftNumber !== undefined && rightNumber !== undefined) {
      return leftNumber - rightNumber || left.localeCompare(right);
    }
    if (leftNumber !== undefined) return -1;
    if (rightNumber !== undefined) return 1;
    return left.localeCompare(right);
  });

  const photos: PhotoFile[] = [];
  for (const file of files) {
    const modalPath = join(modalDir, file);
    const photo = basename(file, extname(file));
    const hash =
      hashByPhoto.get(photo) ??
      hashByFile.get(file) ??
      createHash('sha256')
        .update(await readFile(modalPath))
        .digest('hex');
    photos.push({ modalPath, hash });
  }
  return photos;
}

async function uploadPhotos(
  apiBaseUrl: string,
  opsToken: string,
  setId: string,
  shapeKey: string,
  lengthKey: string,
  photos: PhotoFile[],
  json: boolean,
  variationKey = '',
): Promise<number> {
  if (photos.length === 0) return 0;
  const form = new FormData();
  // PHP collapses repeated unbracketed upload fields into the last file. The
  // `--ftp` PHP gateway must parse this form before proxying it to loopback
  // Multer, so use PHP's array spelling there; it rewrites the field back to
  // `photos`. SSH and local imports keep the public field name unchanged.
  const photoField = process.env.PAM_OPS_TRANSPORT === 'ftp' ? 'photos[]' : 'photos';
  for (const photo of photos) {
    const buffer = await readFile(photo.modalPath);
    form.append(photoField, new Blob([buffer]), photo.modalPath.split('/').pop());
  }
  form.append('hashes', JSON.stringify(photos.map((photo) => photo.hash)));
  const result = (await apiFetch(
    apiBaseUrl,
    opsToken,
    variationKey
      ? `/operation/library-import/sets/${setId}/shapes/${shapeKey}/lengths/${lengthKey}/variations/${variationKey}/photos`
      : `/operation/library-import/sets/${setId}/shapes/${shapeKey}/lengths/${lengthKey}/photos`,
    {
      method: 'POST',
      body: form,
    },
  )) as { added: number };
  log(
    json,
    `[library]   ${shapeKey}/${lengthKey}${variationKey ? `/${variationKey}` : ''}: ${result.added} photo(s) uploaded.`,
  );
  return result.added;
}

interface DesiredState {
  title: RawPartial;
  desc: RawPartial;
  occasion: RawPartial;
  /** Optional authored image alt text — absent (not merely empty) until
   * catalog source's generation pass has produced one for this set. */
  alt: RawPartial | undefined;
  shapeKeys: string[];
  /** The lengths of each offered shape, keyed by shape key. */
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  /** Shape/length pairs hidden while the rest of the product stays visible
   * (data-static.json `hidden` object form). */
  hiddenShapeLengths: HiddenPair[];
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  price: number | undefined;
  availability: SetAvailability;
  users: string[];
  loyaltyMultiplier: number;
  /** Single nails: the variation axis key, or null. */
  variationAxis: string | null;
  /** Options in display order, each with its price override (null = the
   * product price) and its own resolved copy and colours. */
  variations: DesiredVariation[];
  /** data-static.json `variations`: what is switched off (sparse tree). */
  variationOff: Record<string, unknown>;
}

function parseLoyalties(raw: unknown, folderId: string): number {
  if (raw === undefined || raw === null) return 1;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    console.warn(
      `[library] ${folderId}: "loyalties" must be a number >= 0 — got ${JSON.stringify(raw)}, using 1.`,
    );
    return 1;
  }
  return raw;
}

interface FolderView {
  folderId: string;
  productUid: string;
  /** The raw data-generated.json behind `desired` — `--direction local`
   * needs it to tell a real hand override apart from a value that merely
   * echoes generated metadata. */
  generated: GeneratedMeta;
  desired: DesiredState;
  photoCounts: Record<string, Record<string, number>>;
  /** Ordered modal hashes per shape then length — for check drift vs DB
   * content_hash. */
  photoHashes: Record<string, Record<string, string[]>>;
}

type FolderViewResult = { ok: true; view: FolderView } | { ok: false; folderId: string; reason: string };

/** Parses data-static.json's "available" (nested by shape key, then length
 * key, then size) into SetAvailability, warning and dropping anything a
 * shape/length pair isn't offered in — gallery becomes the sole authority
 * over which variants are visible at all (see library/README.md's
 * "available" section): stock recorded for a variant the gallery doesn't
 * show would otherwise be unreachable in the cart/order, silently, with no
 * photo to show for it even if it were. Also drops an unrecognized size or
 * a non-positive/non-integer quantity, same "warn, don't crash the whole
 * set" convention as every other malformed field here. */
function parseAvailability(
  raw: StaticMeta['available'],
  shapeLengths: Record<string, string[]>,
  folderId: string,
): SetAvailability {
  const result: SetAvailability = {};
  if (!raw) return result;

  const pairSet = new Set(
    Object.entries(shapeLengths).flatMap(([shapeKey, lengths]) =>
      lengths.map((lengthKey) => `${shapeKey}/${lengthKey}`),
    ),
  );
  for (const [shapeKey, lengths] of Object.entries(raw)) {
    if (!lengths) continue;

    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      if (!pairSet.has(`${shapeKey}/${lengthKey}`)) {
        console.warn(
          `[library] ${folderId}: "available" has shape/length "${shapeKey}/${lengthKey}", which isn't in this set's shape list (${[...pairSet].join(', ') || '(none)'}) — ignored, won't be visible in the cart/order.`,
        );
        continue;
      }
      if (!sizes) continue;

      for (const [size, quantity] of Object.entries(sizes)) {
        if (!SIZES.includes(size as Size)) {
          console.warn(
            `[library] ${folderId}: "available.${shapeKey}.${lengthKey}" has unknown size "${size}" — ignored.`,
          );
          continue;
        }
        if (quantity === true) {
          ((result[shapeKey] ??= {})[lengthKey] ??= {})[size as Size] = 1;
          continue;
        }
        if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
          console.warn(
            `[library] ${folderId}: "available.${shapeKey}.${lengthKey}.${size}" must be a positive integer or true — got ${JSON.stringify(quantity)}, ignored.`,
          );
          continue;
        }
        ((result[shapeKey] ??= {})[lengthKey] ??= {})[size as Size] = quantity;
      }
    }
  }
  return result;
}

/** Reads+merges one folder's data-generated.json/data-static.json into the
 * same desired-state shape both `seed` (to send) and `check` (to
 * compare) need — kept in one place so the two commands can never drift on
 * what counts as "this folder's current state". */
async function buildFolderView(
  setDir: string,
  folderId: string,
  vocab: {
    shapes: Record<string, RawShape>;
    colors: Record<string, RawPartial>;
    variations?: VariationVocabulary;
  },
): Promise<FolderViewResult> {
  const generated = normalizeGeneratedKeys(
    (await readJsonIfExists<GeneratedMeta>(join(setDir, 'data-generated.json'))) ?? {},
  );
  const rawStatic = await readJsonIfExists<StaticMeta>(join(setDir, 'data-static.json'));

  if (!rawStatic) return { ok: false, folderId, reason: 'no data-static.json (no product-uid)' };
  const staticMeta = normalizeStaticKeys(rawStatic);
  const productUid = staticMeta['product-uid'];
  if (!productUid) return { ok: false, folderId, reason: 'data-static.json has no product-uid' };

  // Single-nail variations: one axis, its options must exist in the layered
  // vocabulary, and every option needs a photo in every shape/length
  // (tuucho/docs/plans/nail-variations.md, decision 1). In the object form each
  // option carries its own copy (tuucho/docs/plans/nail-variation-copy.md).
  const variationRefs = Object.entries(generated.variation ?? staticMeta.variation ?? {});
  if (variationRefs.length > 1) return { ok: false, folderId, reason: 'more than one variation axis' };
  const variationAxis = variationRefs[0] ? variationRefs[0][0].replace(/^\$/, '') : null;
  const rawOptions = variationRefs[0]?.[1];
  const optionMetas: Array<[string, OptionMeta]> = Array.isArray(rawOptions)
    ? rawOptions.map((ref) => [ref.replace(/^\$/, ''), {}])
    : Object.entries(rawOptions ?? {}).map(([ref, meta]) => [ref.replace(/^\$/, ''), meta ?? {}]);
  const optionKeys = optionMetas.map(([key]) => key);
  const firstOption = optionMetas[0]?.[1] ?? {};

  // A nail with variations may leave the nail-level copy out: every option
  // then carries its own, and the product row keeps the first option's.
  const title = mergeTrilingual(generated.title ?? firstOption.title, staticMeta.title);
  const desc = mergeTrilingual(generated.desc ?? firstOption.desc, staticMeta.desc);
  const occasion = mergeTrilingual(generated.occasion ?? firstOption.occasion, staticMeta.occasion);
  if (!title || !desc || !occasion) return { ok: false, folderId, reason: 'missing title/desc/occasion.fr' };
  // Optional — a set never regenerated since this field was introduced has
  // no alt yet, and that's fine: kernel/back falls back to a generated
  // string when this stays absent.
  const alt = mergeTrilingual(generated.alt ?? firstOption.alt, staticMeta.alt);

  // The folders are the only source of shapes and lengths, in vocabulary
  // order (tuucho/docs/plans/variant-visibility.md): a `shape` map in either file
  // is a leftover prepare removes.
  const { shapeKeys, shapeLengths, ignored } = folderShapeLengths(setDir, vocab.shapes);
  if (ignored.length > 0) {
    console.warn(
      `[library] ${folderId}: modal/ folder(s) not in data-common.json's shape/length tables — ignored: ${ignored.join(', ')}`,
    );
  }
  if (generated.shape || staticMeta.shape) {
    console.warn(
      `[library] ${folderId}: "shape" is no longer read (the folders say it); run prepare to remove it${staticMeta.shape ? ' and turn the data-static override into "hidden"' : ''}.`,
    );
  }
  if (shapeKeys.length === 0) return { ok: false, folderId, reason: 'no usable shape' };
  const visibility = parseHidden(staticMeta.hidden, shapeLengths);
  if ('error' in visibility) return { ok: false, folderId, reason: visibility.error };

  const knownColorKeys = (refs: string[]) =>
    refs.map((ref) => ref.replace(/^\$/, '')).filter((key) => !!vocab.colors[key]);
  const colorMainKeys = knownColorKeys(
    mergeArray(generated['color-main'] ?? firstOption['color-main'], staticMeta['color-main']),
  );
  const colorSecondaryKeys = knownColorKeys(
    mergeArray(generated['color-secondary'] ?? firstOption['color-secondary'], staticMeta['color-secondary']),
  );

  // Each option's copy: its own field, else the nail-level one.
  const optionCopies = new Map<string, Omit<DesiredVariation, 'key' | 'price'>>();
  for (const [key, meta] of optionMetas) {
    const optionTitle = meta.title ?? title;
    const optionDesc = meta.desc ?? desc;
    const optionOccasion = meta.occasion ?? occasion;
    if (!optionTitle.fr || !optionDesc.fr || !optionOccasion.fr) {
      return { ok: false, folderId, reason: `variation "${key}" is missing title/desc/occasion.fr` };
    }
    optionCopies.set(key, {
      title: optionTitle,
      desc: optionDesc,
      alt: meta.alt ?? alt ?? null,
      occasion: optionOccasion,
      colorMainKeys: meta['color-main'] ? knownColorKeys(meta['color-main']) : colorMainKeys,
      colorSecondaryKeys: meta['color-secondary']
        ? knownColorKeys(meta['color-secondary'])
        : colorSecondaryKeys,
    });
  }

  if (variationAxis) {
    const axis = vocab.variations?.[variationAxis];
    if (!axis) return { ok: false, folderId, reason: `unknown variation axis "${variationAxis}"` };
    const known = new Set(axis.options.map((option) => option.key));
    const unknown = optionKeys.filter((key) => !known.has(key));
    if (unknown.length > 0) {
      return { ok: false, folderId, reason: `unknown ${variationAxis} variation(s): ${unknown.join(', ')}` };
    }
    if (optionKeys.length === 0) return { ok: false, folderId, reason: 'variation axis with no option' };
  }

  // `price` is a number, or `{ default, <option>: … }` for a nail with options.
  const rawPrice = staticMeta.price;
  let price: number | undefined;
  const optionPrices: Record<string, number> = {};
  if (typeof rawPrice === 'number') {
    price = rawPrice;
  } else if (rawPrice && typeof rawPrice === 'object') {
    if (!variationAxis) return { ok: false, folderId, reason: 'price object needs a variation axis' };
    if (typeof rawPrice.default !== 'number')
      return { ok: false, folderId, reason: 'price object needs "default"' };
    price = rawPrice.default;
    for (const [key, value] of Object.entries(rawPrice)) {
      if (key === 'default') continue;
      if (!optionKeys.includes(key) || typeof value !== 'number') {
        return { ok: false, folderId, reason: `price key "${key}" is not a variation of this nail` };
      }
      optionPrices[key] = value;
    }
  }
  const variationOff =
    staticMeta.variations && typeof staticMeta.variations === 'object' ? staticMeta.variations : {};
  for (const key of Object.keys(variationOff)) {
    if (!optionKeys.includes(key)) {
      return { ok: false, folderId, reason: `data-static "variations" names unknown variation "${key}"` };
    }
  }

  const photoCounts: Record<string, Record<string, number>> = {};
  const photoHashes: Record<string, Record<string, string[]>> = {};
  for (const shapeKey of shapeKeys) {
    photoCounts[shapeKey] = {};
    photoHashes[shapeKey] = {};
    for (const lengthKey of shapeLengths[shapeKey]!) {
      if (!variationAxis) {
        const photos = await collectPhotos(setDir, shapeKey, lengthKey, generated.photos);
        photoCounts[shapeKey][lengthKey] = photos.length;
        photoHashes[shapeKey][lengthKey] = photos.map((photo) => photo.hash ?? '');
        continue;
      }
      for (const optionKey of optionKeys) {
        const photos = await collectPhotos(setDir, shapeKey, lengthKey, generated.photos, optionKey);
        if (photos.length === 0) {
          return { ok: false, folderId, reason: `no photo for ${shapeKey}/${lengthKey}/${optionKey}` };
        }
        // Same key the API's library listing uses for variation photos.
        photoCounts[shapeKey][`${lengthKey}/${optionKey}`] = photos.length;
        photoHashes[shapeKey][`${lengthKey}/${optionKey}`] = photos.map((photo) => photo.hash ?? '');
      }
    }
  }

  return {
    ok: true,
    view: {
      folderId,
      productUid,
      generated,
      desired: {
        title,
        desc,
        occasion,
        alt,
        shapeKeys,
        shapeLengths,
        colorMainKeys,
        colorSecondaryKeys,
        hidden: visibility.hidden,
        hiddenShapeLengths: visibility.hiddenShapeLengths,
        featuredFrom: staticMeta.featured?.from ?? null,
        featuredFor: staticMeta.featured?.for ?? null,
        creationDate: staticMeta['creation-date'] ?? todayIso(),
        price,
        availability: parseAvailability(staticMeta.available, shapeLengths, folderId),
        users: staticMeta.users ?? [],
        loyaltyMultiplier: parseLoyalties(staticMeta.loyalties, folderId),
        variationAxis,
        variations: optionKeys.map((key) => ({
          key,
          price: optionPrices[key] ?? null,
          ...optionCopies.get(key)!,
        })),
        variationOff,
      },
      photoCounts,
      photoHashes,
    },
  };
}

function sourceAudience(sourceDir: string): 'public' | 'user-library' {
  const name = basename(sourceDir);
  // Folder CLI name is library-user; DB/API audience stays user-library.
  return name === 'library-user' || name === 'user-library' ? 'user-library' : 'public';
}

function sourceProductType(sourceDir: string): 'nail' | 'nail_single' {
  return basename(sourceDir) === 'library-nail' ? 'nail_single' : 'nail';
}

function importSetsPath(sourceDir: string): string {
  const audience = sourceAudience(sourceDir);
  const productType = sourceProductType(sourceDir);
  if (productType === 'nail_single') {
    return '/operation/library-import/sets?audience=public&productType=nail_single';
  }
  return audience === 'user-library'
    ? '/operation/library-import/sets?audience=user-library'
    : '/operation/library-import/sets?audience=public';
}

interface CreateSummary {
  created: number;
  updated: number;
  priceOnlyUpdated: number;
  stockUpdated: number;
  unchanged: number;
  skippedDiffers: number;
  invalid: number;
  rows: Array<{
    folder: string;
    id: string;
    productUid: string;
    result: string;
    price: string;
    availability: string;
    changes: string;
    changedFields: string[];
    stock: Array<{
      shape: string;
      length: string;
      sizes: Record<Size, number>;
      total: number;
    }>;
  }>;
  driftDetails: Array<{
    productUid: string;
    drift: string[];
    price: { local: string; db: string } | undefined;
    availability: { local: string; db: string } | undefined;
  }>;
  vocabulary: { shapes: number; colors: number; deletedShapes: string[]; deletedColors: string[] };
  deleteSync?: { deletedSets: number };
}

function formatAvailabilityUpdate(
  availability: SetAvailability,
  shapeLengths: Record<string, string[]>,
): {
  label: string;
  variants: Array<{
    shape: string;
    length: string;
    sizes: Record<Size, number>;
    total: number;
  }>;
} {
  const variants = Object.entries(shapeLengths).flatMap(([shape, lengths]) =>
    lengths.map((length) => {
      const source = availability[shape]?.[length] ?? {};
      const sizes: Record<Size, number> = {
        XS: source.XS ?? 0,
        S: source.S ?? 0,
        M: source.M ?? 0,
        L: source.L ?? 0,
      };
      return {
        shape,
        length,
        sizes,
        total: SIZES.reduce((sum, size) => sum + sizes[size], 0),
      };
    }),
  );
  let total = 0;
  const labels = variants.map((variant) => {
    total += variant.total;
    return `${variant.shape}/${variant.length} ${SIZES.map((size) => `${size}=${variant.sizes[size]}`).join(' ')}`;
  });
  return {
    label: `${labels.join('; ') || 'none'} (total=${total})`,
    variants,
  };
}

async function runCreate(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string | undefined,
  update: boolean,
  deleteMissing: boolean,
  json: boolean,
): Promise<CreateSummary> {
  const productType = sourceProductType(sourceDir);
  // Single-nail folders share vocabulary with the set library; do not push
  // from library-nail (shared product/data-common.json is owned by npm run library).
  const vocab = await loadVocabulary(sourceDir);
  // Single nails still leave shapes/colors to `npm run library`, but their
  // own variation axes (library-nail/data-common.json) are pushed here.
  // Single nails push their variation axes and the shared colours (each
  // option has its own colours, often ones no set uses yet), never the
  // shapes, which stay `npm run library`'s. Upsert only, nothing deleted.
  const vocabulary =
    productType === 'nail_single'
      ? await pushVocabulary(
          apiBaseUrl,
          opsToken,
          { shapes: {}, colors: vocab.colors, ...(vocab.variations ? { variations: vocab.variations } : {}) },
          false,
          json,
        )
      : await pushVocabulary(apiBaseUrl, opsToken, vocab, false, json);

  const folderIds = await resolveFolderIdsForCreate(sourceDir, target);

  let created = 0;
  let updated = 0;
  let priceOnlyUpdated = 0;
  let stockUpdated = 0;
  let unchanged = 0;
  let skippedDiffers = 0;
  const driftDetails: {
    productUid: string;
    drift: string[];
    price: { local: string; db: string } | undefined;
    availability: { local: string; db: string } | undefined;
  }[] = [];
  let invalid = 0;
  const rows: {
    folder: string;
    id: string;
    productUid: string;
    result: string;
    price: string;
    availability: string;
    changes: string;
    changedFields: string[];
    stock: Array<{
      shape: string;
      length: string;
      sizes: Record<Size, number>;
      total: number;
    }>;
  }[] = [];

  const prepared: { folderId: string; setDir: string; view: FolderView }[] = [];
  for (const folderId of folderIds) {
    const setDir = join(sourceDir, folderId);
    const result = await buildFolderView(setDir, folderId, vocab);
    if (!result.ok) {
      console.warn(`[library] ${result.folderId}: ${result.reason} — skipped.`);
      invalid++;
      continue;
    }
    prepared.push({ folderId, setDir, view: result.view });
  }

  // Fetched unconditionally (not just under --update): a plain seed needs it
  // too, to tell a genuinely unchanged skip apart from one where the local
  // source has drifted from the DB and --update was simply never passed.
  const remoteByUid = new Map<string, DbSet>();
  if (prepared.length > 0) {
    const remote = (await apiFetch(apiBaseUrl, opsToken, importSetsPath(sourceDir))) as {
      sets: DbSet[];
    };
    for (const set of remote.sets) remoteByUid.set(set.productUid.toUpperCase(), set);
  }

  type ImportResponse = {
    created: boolean;
    updated: boolean;
    photosCleared?: boolean;
    priceUpdated: boolean;
    availabilityUpdated: boolean;
    changes?: string[];
    id: string;
  };
  const batch =
    prepared.length === 0
      ? { results: [] as ImportResponse[] }
      : ((await apiJson(apiBaseUrl, opsToken, '/operation/library-import/sets/batch', {
          sets: prepared.map(({ view }) => {
            const remote = remoteByUid.get(view.productUid.toUpperCase());
            const refreshPhotos =
              update &&
              !!remote &&
              (photoCountsDiffer(view.photoCounts, remote.photoCounts ?? {}) ||
                photoHashesDiffer(view.photoHashes, remote.photoHashes ?? {}));
            return {
              productUid: view.productUid,
              productType: sourceProductType(sourceDir),
              audience: sourceAudience(sourceDir),
              ...(sourceAudience(sourceDir) === 'user-library' ? { users: view.desired.users } : {}),
              ...view.desired,
              update,
              refreshPhotos,
            };
          }),
        })) as { results: ImportResponse[] });

  for (const [index, { folderId, setDir, view }] of prepared.entries()) {
    const response = batch.results[index];
    if (!response) throw new Error(`Batch response is missing result ${index} (${view.productUid}).`);

    // A metadata-only update leaves photos intact. Upload only for a new set
    // or after a hash/count difference explicitly cleared existing photos.
    if (response.created || response.photosCleared) {
      const generated = (await readJsonIfExists<GeneratedMeta>(join(setDir, 'data-generated.json'))) ?? {};
      for (const shapeKey of view.desired.shapeKeys) {
        for (const lengthKey of view.desired.shapeLengths[shapeKey] ?? []) {
          if (view.desired.variationAxis) {
            for (const { key: optionKey } of view.desired.variations) {
              const photos = await collectPhotos(setDir, shapeKey, lengthKey, generated.photos, optionKey);
              await uploadPhotos(
                apiBaseUrl,
                opsToken,
                response.id,
                shapeKey,
                lengthKey,
                photos,
                json,
                optionKey,
              );
            }
            continue;
          }
          const photos = await collectPhotos(setDir, shapeKey, lengthKey, generated.photos);
          if (photos.length === 0) {
            console.warn(
              `[library] ${folderId}: shape/length "${shapeKey}/${lengthKey}" declared but no photos found on disk.`,
            );
            continue;
          }
          const missingHash = photos.filter((photo) => !photo.hash).length;
          if (missingHash > 0) {
            console.warn(
              `[library] ${folderId}/${shapeKey}/${lengthKey}: ${missingHash} photo(s) missing hash in data-generated.json — run prepare-library first.`,
            );
          }
          await uploadPhotos(apiBaseUrl, opsToken, response.id, shapeKey, lengthKey, photos, json);
        }
      }
    }

    const price = view.desired.price?.toFixed(2) ?? 'none';
    if (response.availabilityUpdated) stockUpdated++;
    const stockReport = formatAvailabilityUpdate(view.desired.availability, view.desired.shapeLengths);
    const availability = stockReport.label;
    const stock = stockReport.variants;
    const changedFields = response.changes ?? [
      ...(response.priceUpdated ? ['price'] : []),
      ...(response.availabilityUpdated ? ['availability'] : []),
    ];
    const changes = changedFields.join(', ');
    if (response.created) {
      created++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'created',
        price,
        availability,
        changes,
        changedFields,
        stock,
      });
    } else if (response.updated) {
      updated++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'updated',
        price,
        availability,
        changes,
        changedFields,
        stock,
      });
    } else if (response.photosCleared) {
      updated++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'photos refreshed',
        price,
        availability,
        changes,
        changedFields,
        stock,
      });
    } else if (response.priceUpdated || response.availabilityUpdated) {
      priceOnlyUpdated++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'price/availability only',
        price,
        availability,
        changes,
        changedFields,
        stock,
      });
    } else {
      // This is the no-`--update`, already-exists skip: the API never even
      // looked at price/availability, so response.*Updated is unconditionally
      // false here — it says nothing about whether the DB actually matches
      // the source. Check for real, so a drifted-but-skipped set is never
      // reported as "unchanged" while showing numbers that aren't in the DB.
      const remote = !update ? remoteByUid.get(view.productUid.toUpperCase()) : undefined;
      const drift = remote ? sourceDifferences(view, remote) : [];
      if (drift.length > 0) {
        skippedDiffers++;
        driftDetails.push({
          productUid: view.productUid,
          drift,
          price: drift.includes('price')
            ? { local: price, db: remote!.price?.toFixed(2) ?? 'none' }
            : undefined,
          availability: drift.includes('availability')
            ? {
                local: availability,
                db: formatAvailabilityUpdate(remote!.availability, view.desired.shapeLengths).label,
              }
            : undefined,
        });
        rows.push({
          folder: folderId,
          id: response.id,
          productUid: view.productUid,
          result: 'DIFFERS (skipped)',
          price,
          availability,
          changes: drift.join(', '),
          changedFields: drift,
          stock,
        });
      } else {
        unchanged++;
        rows.push({
          folder: folderId,
          id: response.id,
          productUid: view.productUid,
          result: 'unchanged',
          price,
          availability,
          changes,
          changedFields,
          stock,
        });
      }
    }
  }

  log(
    json,
    `[library] seed done: ${created} created, ${updated} updated, ${priceOnlyUpdated} price/availability-only updated, ${stockUpdated} stock updated, ${unchanged} unchanged, ${skippedDiffers} skipped (local differs from DB), ${invalid} invalid.`,
  );
  // One line per shape/length with its sizes in their own columns; the
  // product's columns are filled on its first line only, so a product offered
  // in many variants stays readable instead of one very wide cell.
  logTable(
    json,
    rows.flatMap(({ folder, productUid, result, price, changes, stock }) => {
      const product = { folder, productUid, result, changes, price };
      const blank = { folder: '', productUid: '', result: '', changes: '', price: '' };
      if (stock.length === 0) return [{ ...product, variant: 'none', XS: '', S: '', M: '', L: '', total: 0 }];
      return stock.map((variant, index) => ({
        ...(index === 0 ? product : blank),
        variant: `${variant.shape}/${variant.length}`,
        ...variant.sizes,
        total: variant.total,
      }));
    }),
  );
  if (skippedDiffers > 0) {
    log(
      json,
      `[library] ${skippedDiffers} set(s) marked DIFFERS (skipped) — --update was not passed, so none of these were applied:`,
    );
    for (const { productUid, drift, price: priceDrift, availability: availabilityDrift } of driftDetails) {
      const price = priceDrift ? ` — price local=${priceDrift.local} db=${priceDrift.db}` : '';
      log(json, `  ${productUid} (${drift.join(', ')})${price}`);
      // One shape/length per line, like the table above.
      if (availabilityDrift) {
        log(json, '    availability in the DB:');
        for (const line of availabilityDrift.db.split('; ')) log(json, `      ${line}`);
      }
    }
  }

  let deleteSync: CreateSummary['deleteSync'];
  if (deleteMissing) {
    const deletedSets = await deleteMissingRemoteSets(sourceDir, apiBaseUrl, opsToken, json);
    // The user library shares vocabulary with public nails; it must never
    // use its smaller source tree as authority to delete global keys.
    if (sourceAudience(sourceDir) === 'public') await pushVocabulary(apiBaseUrl, opsToken, vocab, true, json);
    deleteSync = { deletedSets };
  }

  return {
    created,
    updated,
    priceOnlyUpdated,
    stockUpdated,
    unchanged,
    skippedDiffers,
    driftDetails,
    invalid,
    rows,
    vocabulary,
    deleteSync,
  };
}

/** An inventory independent of import validity. A folder that still names a
 * product-uid is never considered permission to delete that DB set merely
 * because its other source data is malformed. */
async function sourceSetRecords(sourceDir: string): Promise<{ folderId: string; productUid: string }[]> {
  const records: { folderId: string; productUid: string }[] = [];
  for (const folderId of await listFolderIds(sourceDir)) {
    const meta = await readJsonIfExists<StaticMeta>(join(sourceDir, folderId, 'data-static.json'));
    if (meta?.['product-uid']) records.push({ folderId, productUid: meta['product-uid'] });
  }
  return records;
}

async function deleteMissingRemoteSets(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<number> {
  const sourceUids = new Set(
    (await sourceSetRecords(sourceDir)).map((record) => record.productUid.toUpperCase()),
  );
  const { sets } = (await apiFetch(apiBaseUrl, opsToken, importSetsPath(sourceDir))) as {
    sets: DbSet[];
  };
  const missing = sets.filter((set) => !sourceUids.has(set.productUid.toUpperCase()));
  for (const set of missing) {
    await apiFetch(
      apiBaseUrl,
      opsToken,
      `/operation/library-import/sets/${encodeURIComponent(set.productUid)}`,
      {
        method: 'DELETE',
      },
    );
    log(json, `[library] deleted stale set ${set.productUid}.`);
  }
  log(
    json,
    `[library] delete sync: ${missing.length} DB-only set${missing.length === 1 ? '' : 's'} deleted.`,
  );
  return missing.length;
}

/** Only the languages whose DB value actually differs from what
 * data-generated.json already carries — data-static.json is deep-merged
 * field by field, so a language that matches the generated value has no
 * business being repeated in the override file. Returns undefined when
 * nothing differs, i.e. "don't write this key at all". */
function trilingualOverride(
  generated: RawPartial | undefined,
  db: RawPartial | null,
): RawPartial | undefined {
  if (!db) return undefined;
  const override: RawPartial = {};
  for (const lang of TRILINGUAL_LANGS) {
    const dbValue = db[lang] ?? '';
    if (dbValue === '') continue;
    if (dbValue !== (generated?.[lang] ?? '')) override[lang] = dbValue;
  }
  return Object.keys(override).length > 0 ? override : undefined;
}

/** Builds the data-static.json content `--direction local` writes for one
 * folder. data-static.json is an *override* file: library/README.md's own
 * rule is "only include the keys you're actually overriding", so a field the
 * DB agrees on with data-generated.json must not be repeated here. Writing a
 * full snapshot instead froze generated metadata behind a hand override that
 * a later regeneration pass could no longer update, which is why the
 * generated-side fields below are emitted only when they genuinely differ.
 * The override-only fields (price, available, featured, hidden, loyalties,
 * creation-date, users) have no generated counterpart, so they are always
 * this file's to carry. */
function staticMetaFromDbSet(productUid: string, dbSet: DbSet, generated: GeneratedMeta): StaticMeta {
  const meta: StaticMeta = {
    'product-uid': productUid,
    'creation-date': dbSet.creationDate,
  };
  // Absent means visible in buildFolderView — don't write the default back.
  const hidden = hiddenToStatic(dbSet.hidden, dbSet.hiddenShapeLengths ?? [], dbSet.shapeLengths);
  if (hidden) meta.hidden = hidden;
  if (dbSet.featuredFrom && dbSet.featuredFor) {
    meta.featured = { from: dbSet.featuredFrom, for: dbSet.featuredFor };
  }
  if (dbSet.price !== undefined) {
    const overrides = (dbSet.variations ?? []).filter((option) => option.price !== null);
    meta.price =
      overrides.length > 0
        ? {
            default: dbSet.price,
            ...Object.fromEntries(overrides.map((option) => [`$${option.key}`, option.price!])),
          }
        : dbSet.price;
  }
  if (dbSet.loyaltyMultiplier !== 1) meta.loyalties = dbSet.loyaltyMultiplier;
  if (Object.keys(dbSet.availability).length > 0) meta.available = refKeys(dbSet.availability, 2);
  if (dbSet.users.length > 0) meta.users = dbSet.users;

  const title = trilingualOverride(generated.title, dbSet.title);
  if (title) meta.title = title;
  const desc = trilingualOverride(generated.desc, dbSet.desc);
  if (desc) meta.desc = desc;
  const occasion = trilingualOverride(generated.occasion, dbSet.occasion);
  if (occasion) meta.occasion = occasion;
  const alt = trilingualOverride(generated.alt, dbSet.alt);
  if (alt) meta.alt = alt;

  // Shapes and lengths come from the folders (tuucho/docs/plans/variant-visibility.md):
  // never written back.

  const colorMain = dbSet.colorMainKeys.map((key) => `$${key}`);
  if (refArrayDiffers(generated['color-main'], colorMain)) meta['color-main'] = colorMain;
  const colorSecondary = dbSet.colorSecondaryKeys.map((key) => `$${key}`);
  if (refArrayDiffers(generated['color-secondary'], colorSecondary)) meta['color-secondary'] = colorSecondary;

  return meta;
}

function stripRef(ref: string): string {
  return ref.replace(/^\$/, '');
}

/** "$" prefixes are optional-by-convention in the source files, so compare
 * the resolved keys, in order (order is the shape/color sort order). */
function refArrayDiffers(generated: string[] | undefined, db: string[]): boolean {
  const a = (generated ?? []).map(stripRef);
  const b = db.map(stripRef);
  return a.length !== b.length || a.some((key, index) => key !== b[index]);
}

function writeStaticMeta(setDir: string, meta: StaticMeta): void {
  writeFileSync(join(setDir, 'data-static.json'), `${JSON.stringify(meta, null, 2)}\n`);
}

/** `--direction local`: the reverse of runCreate above — instead of pushing
 * each target folder's local state up to the DB, pulls each target
 * folder's *current DB row* back down into its own data-static.json.
 * Read-only against the DB (no vocabulary push, no writes over the API at
 * all) and never touches photos — see this file's own usage doc comment. A
 * folder whose product-uid has no matching DB row is skipped with a warning
 * (nothing to pull there), not an error, same "warn and move on" rule as
 * every other malformed/unmatched case in this script. */
interface PullSummary {
  pulled: number;
  pending: number;
  unchanged: number;
  notInDb: number;
  invalid: number;
  vocabularyDiffers: boolean;
  vocabularyPulled: boolean;
  localDeleteSync?: { deletedLocalSets: number };
}

async function runPullFromRemote(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string | undefined,
  update: boolean,
  deleteMissing: boolean,
  json: boolean,
): Promise<PullSummary> {
  const vocab = await loadVocabulary(sourceDir);
  const { sets: dbSets } = (await apiFetch(apiBaseUrl, opsToken, importSetsPath(sourceDir))) as {
    sets: DbSet[];
  };
  const dbByUid = new Map(dbSets.map((set) => [set.productUid.toUpperCase(), set]));
  const dbVocab = (await apiFetch(apiBaseUrl, opsToken, '/operation/library-import/vocabulary')) as {
    shapes: Record<string, RawShape>;
    colors: Record<string, RawPartial>;
  };

  const folderIds = await resolveFolderIdsForCreate(sourceDir, target);

  let pulled = 0;
  let pending = 0;
  let unchanged = 0;
  let notInDb = 0;
  let invalid = 0;
  const rows: { folder: string; productUid: string; result: string; differences: string }[] = [];

  for (const folderId of folderIds) {
    const setDir = join(sourceDir, folderId);
    const result = await buildFolderView(setDir, folderId, vocab);
    if (!result.ok) {
      console.warn(`[library] ${result.folderId}: ${result.reason} — skipped.`);
      invalid++;
      continue;
    }
    const { view } = result;

    const dbSet = dbByUid.get(view.productUid.toUpperCase());
    if (!dbSet) {
      console.warn(
        `[library] ${folderId} (${view.productUid}): not found in the DB — nothing to pull, skipped.`,
      );
      notInDb++;
      continue;
    }

    const differences: string[] = [];
    if (trilingualDiffers(view.desired.title, dbSet.title)) differences.push('title');
    if (trilingualDiffers(view.desired.desc, dbSet.desc)) differences.push('desc');
    if (trilingualDiffers(view.desired.occasion, dbSet.occasion)) differences.push('occasion');
    if (altDiffers(view.desired.alt, dbSet.alt)) differences.push('alt');
    if (arraysDiffer(view.desired.shapeKeys, dbSet.shapeKeys)) differences.push('shape');
    if (shapeLengthsDiffer(view.desired.shapeLengths, dbSet.shapeLengths ?? {})) differences.push('length');
    if (arraysDiffer(view.desired.colorMainKeys, dbSet.colorMainKeys)) differences.push('color-main');
    if (arraysDiffer(view.desired.colorSecondaryKeys, dbSet.colorSecondaryKeys))
      differences.push('color-secondary');
    if (
      view.desired.hidden !== dbSet.hidden ||
      hiddenPairsKey(view.desired.hiddenShapeLengths) !== hiddenPairsKey(dbSet.hiddenShapeLengths ?? [])
    )
      differences.push('hidden');
    if (view.desired.featuredFrom !== dbSet.featuredFrom || view.desired.featuredFor !== dbSet.featuredFor)
      differences.push('featured');
    if (view.desired.creationDate !== dbSet.creationDate) differences.push('creation-date');
    if (view.desired.price !== dbSet.price) differences.push('price');
    if (availabilityDiffers(view.desired.availability, dbSet.availability)) differences.push('availability');
    if (variationsDiffer(view.desired, dbSet)) differences.push('variations');
    if (view.desired.loyaltyMultiplier !== dbSet.loyaltyMultiplier) differences.push('loyalties');

    if (differences.length === 0) {
      unchanged++;
      rows.push({ folder: folderId, productUid: view.productUid, result: 'unchanged', differences: '' });
      continue;
    }

    if (!update) {
      pending++;
      rows.push({
        folder: folderId,
        productUid: view.productUid,
        result: 'differs (rerun with --update)',
        differences: differences.join(', '),
      });
      continue;
    }

    writeStaticMeta(setDir, staticMetaFromDbSet(view.productUid, dbSet, view.generated));
    pulled++;
    rows.push({
      folder: folderId,
      productUid: view.productUid,
      result: 'pulled',
      differences: differences.join(', '),
    });
  }

  const destinationVocab = deleteMissing
    ? dbVocab
    : {
        shapes: { ...vocab.shapes, ...dbVocab.shapes },
        colors: { ...vocab.colors, ...dbVocab.colors },
      };
  const vocabularyDiffers =
    shapeMapsDiffer(vocab.shapes, destinationVocab.shapes) ||
    trilingualMapsDiffer(vocab.colors, destinationVocab.colors);
  let vocabularyPulled = false;
  if (vocabularyDiffers && update) {
    writeVocabulary(sourceDir, destinationVocab);
    vocabularyPulled = true;
    log(json, '[library] data-common.json: pulled from the DB.');
  } else if (vocabularyDiffers) {
    log(json, '[library] data-common.json: differs from the DB — rerun with --update to pull.');
  }

  let localDeleteSync: PullSummary['localDeleteSync'];
  if (deleteMissing) {
    const deletedLocalSets = await deleteMissingLocalSets(sourceDir, dbByUid, json);
    localDeleteSync = { deletedLocalSets };
  }

  log(
    json,
    `[library] pull done: ${pulled} pulled, ${pending} differ (rerun with --update to pull), ${unchanged} unchanged, ${notInDb} not in DB, ${invalid} invalid, vocabulary ${vocabularyDiffers ? (update ? 'pulled' : 'differs') : 'unchanged'}.`,
  );
  logTable(json, rows);

  return {
    pulled,
    pending,
    unchanged,
    notInDb,
    invalid,
    vocabularyDiffers,
    vocabularyPulled,
    localDeleteSync,
  };
}

/** Local `--delete` removes the whole manager-only set folder (metadata,
 * generated data and photos). Leaving the folder behind minus its
 * data-static.json made it an orphan every later seed skipped as invalid. */
async function deleteMissingLocalSets(
  sourceDir: string,
  dbByUid: Map<string, DbSet>,
  json: boolean,
): Promise<number> {
  const missing = (await sourceSetRecords(sourceDir)).filter(
    (record) => !dbByUid.has(record.productUid.toUpperCase()),
  );
  for (const record of missing) {
    await rm(join(sourceDir, record.folderId), { recursive: true });
    log(json, `[library] removed local set folder ${record.folderId} (${record.productUid}).`);
  }
  log(
    json,
    `[library] local delete sync: ${missing.length} manager-only set folder${missing.length === 1 ? '' : 's'} removed.`,
  );
  return missing.length;
}

async function runDelete(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string,
  json: boolean,
): Promise<{ deleted: true; productUid: string }> {
  const productUid = await resolveProductUidForDelete(sourceDir, target);
  await apiFetch(apiBaseUrl, opsToken, `/operation/library-import/sets/${productUid}`, { method: 'DELETE' });
  log(json, `[library] deleted product-uid ${productUid}.`);
  return { deleted: true, productUid };
}

async function runDeleteAll(
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<{ sets: number; shapes: number; colors: number }> {
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/library-import/clear', {})) as {
    sets: number;
    shapes: number;
    colors: number;
  };
  log(
    json,
    `[library] delete-all: deleted ${result.sets} set(s), ${result.shapes} shape(s), ${result.colors} color(s).`,
  );
  return result;
}

async function runDeleteVocabulary(
  apiBaseUrl: string,
  opsToken: string,
  kind: 'shape' | 'color',
  key: string,
  json: boolean,
): Promise<{ deleted: true; kind: 'shape' | 'color'; key: string }> {
  const path = kind === 'shape' ? 'shapes' : 'colors';
  await apiFetch(apiBaseUrl, opsToken, `/operation/library-import/${path}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  log(json, `[library] deleted ${kind} ${key}.`);
  return { deleted: true, kind, key };
}

interface DbSet {
  id: string;
  productUid: string;
  title: RawPartial;
  desc: RawPartial;
  occasion: RawPartial;
  /** Authored image alt text — null until catalog source's generation
   * pass has produced one for this set. */
  alt: RawPartial | null;
  shapeKeys: string[];
  shapeLengths: Record<string, string[]>;
  colorMainKeys: string[];
  colorSecondaryKeys: string[];
  hidden: boolean;
  /** Hidden shape/length pairs; absent from an older API. */
  hiddenShapeLengths?: HiddenPair[];
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  photoCounts: Record<string, Record<string, number>>;
  photoHashes: Record<string, Record<string, string[]>>;
  price: number | undefined;
  availability: SetAvailability;
  users: string[];
  loyaltyMultiplier: number;
  variationAxis?: string | null;
  variations?: Array<{
    key: string;
    price: number | null;
    title?: RawPartial | null;
    desc?: RawPartial | null;
    alt?: RawPartial | null;
    occasion?: RawPartial | null;
    colorMainKeys?: string[];
    colorSecondaryKeys?: string[];
  }>;
}

/** Axis, option order, a price override or an option's own copy or colours
 * differs between source and DB. */
function variationsDiffer(desired: DesiredState, dbSet: DbSet): boolean {
  if ((desired.variationAxis ?? null) !== (dbSet.variationAxis ?? null)) return true;
  const remote = dbSet.variations ?? [];
  return (
    desired.variations.length !== remote.length ||
    desired.variations.some((option, index) => {
      const db = remote[index];
      return (
        !db ||
        option.key !== db.key ||
        option.price !== (db.price ?? null) ||
        !db.title ||
        !db.desc ||
        !db.occasion ||
        trilingualDiffers(option.title, db.title) ||
        trilingualDiffers(option.desc, db.desc) ||
        trilingualDiffers(option.occasion, db.occasion) ||
        altDiffers(option.alt ?? undefined, db.alt ?? null) ||
        arraysDiffer(option.colorMainKeys, db.colorMainKeys ?? []) ||
        arraysDiffer(option.colorSecondaryKeys, db.colorSecondaryKeys ?? [])
      );
    })
  );
}

const TRILINGUAL_LANGS = ['en', 'fr'] as const;

function trilingualDiffers(a: RawPartial, b: RawPartial): boolean {
  return TRILINGUAL_LANGS.some((lang) => (a[lang] ?? '') !== (b[lang] ?? ''));
}

/** Same as trilingualDiffers, but for the optional `alt` field — absent
 * (undefined, from a folder never regenerated with this field) and null
 * (from the DB, same meaning) both count as "no alt", not a difference from
 * each other. */
function altDiffers(a: RawPartial | undefined, b: RawPartial | null): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return trilingualDiffers(a, b);
}

function arraysDiffer(a: string[], b: string[]): boolean {
  return a.length !== b.length || a.some((value, i) => value !== b[i]);
}

function photoCountsDiffer(
  a: Record<string, Record<string, number>>,
  b: Record<string, Record<string, number>>,
): boolean {
  const shapeKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...shapeKeys].some((shapeKey) => {
    const lengthsA = a[shapeKey] ?? {};
    const lengthsB = b[shapeKey] ?? {};
    const lengthKeys = new Set([...Object.keys(lengthsA), ...Object.keys(lengthsB)]);
    return [...lengthKeys].some((lengthKey) => (lengthsA[lengthKey] ?? 0) !== (lengthsB[lengthKey] ?? 0));
  });
}

function photoHashesDiffer(
  a: Record<string, Record<string, string[]>>,
  b: Record<string, Record<string, string[]>>,
): boolean {
  const shapeKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...shapeKeys].some((shapeKey) => {
    const lengthsA = a[shapeKey] ?? {};
    const lengthsB = b[shapeKey] ?? {};
    const lengthKeys = new Set([...Object.keys(lengthsA), ...Object.keys(lengthsB)]);
    return [...lengthKeys].some((lengthKey) =>
      arraysDiffer(lengthsA[lengthKey] ?? [], lengthsB[lengthKey] ?? []),
    );
  });
}

function shapeLengthsDiffer(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const shapeKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...shapeKeys].some((shapeKey) => arraysDiffer(a[shapeKey] ?? [], b[shapeKey] ?? []));
}

function availabilityDiffers(a: SetAvailability, b: SetAvailability): boolean {
  const shapeKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const shapeKey of shapeKeys) {
    const lengthsA = a[shapeKey] ?? {};
    const lengthsB = b[shapeKey] ?? {};
    const lengthKeys = new Set([...Object.keys(lengthsA), ...Object.keys(lengthsB)]);
    for (const lengthKey of lengthKeys) {
      const sizesA = lengthsA[lengthKey] ?? {};
      const sizesB = lengthsB[lengthKey] ?? {};
      const sizes = new Set([...Object.keys(sizesA), ...Object.keys(sizesB)]);
      for (const size of sizes) {
        if ((sizesA[size as Size] ?? 0) !== (sizesB[size as Size] ?? 0)) return true;
      }
    }
  }
  return false;
}

/** Field-by-field local-vs-DB diff, shared by `check` and by `seed`'s
 * no-`--update` skip path — the latter needs it so a skip is never reported
 * as "unchanged" when the local source and the DB actually disagree. */
function sourceDifferences(view: FolderView, dbSet: DbSet): string[] {
  const differences: string[] = [];
  if (trilingualDiffers(view.desired.title, dbSet.title)) differences.push('title');
  if (trilingualDiffers(view.desired.desc, dbSet.desc)) differences.push('desc');
  if (trilingualDiffers(view.desired.occasion, dbSet.occasion)) differences.push('occasion');
  if (altDiffers(view.desired.alt, dbSet.alt)) differences.push('alt');
  if (arraysDiffer(view.desired.shapeKeys, dbSet.shapeKeys)) differences.push('shape');
  if (shapeLengthsDiffer(view.desired.shapeLengths, dbSet.shapeLengths ?? {})) differences.push('length');
  if (arraysDiffer(view.desired.colorMainKeys, dbSet.colorMainKeys)) differences.push('color-main');
  if (arraysDiffer(view.desired.colorSecondaryKeys, dbSet.colorSecondaryKeys))
    differences.push('color-secondary');
  if (
    view.desired.hidden !== dbSet.hidden ||
    hiddenPairsKey(view.desired.hiddenShapeLengths) !== hiddenPairsKey(dbSet.hiddenShapeLengths ?? [])
  )
    differences.push('hidden');
  if (view.desired.featuredFrom !== dbSet.featuredFrom || view.desired.featuredFor !== dbSet.featuredFor)
    differences.push('featured');
  if (view.desired.creationDate !== dbSet.creationDate) differences.push('creation-date');
  if (view.desired.price !== dbSet.price) differences.push('price');
  if (availabilityDiffers(view.desired.availability, dbSet.availability)) differences.push('availability');
  if (variationsDiffer(view.desired, dbSet)) differences.push('variations');
  if (view.desired.loyaltyMultiplier !== dbSet.loyaltyMultiplier) differences.push('loyalties');
  if (photoCountsDiffer(view.photoCounts, dbSet.photoCounts)) differences.push('photo-count');
  if (photoHashesDiffer(view.photoHashes, dbSet.photoHashes ?? {})) differences.push('photo-hash');
  return differences;
}

interface CheckSummary {
  localCount: number;
  dbCount: number;
  invalidCount: number;
  matched: number;
  mismatched: { folderId: string; productUid: string; differences: string[] }[];
  notImported: { folderId: string; productUid: string }[];
  orphaned: { productUid: string; id: string }[];
}

async function runCheck(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<CheckSummary> {
  const vocab = await loadVocabulary(sourceDir);
  const { sets: dbSets } = (await apiFetch(apiBaseUrl, opsToken, importSetsPath(sourceDir))) as {
    sets: DbSet[];
  };
  const dbByUid = new Map(dbSets.map((set) => [set.productUid.toUpperCase(), set]));

  const folderIds = await listFolderIds(sourceDir);
  const localByUid = new Map<string, FolderView>();
  let invalidCount = 0;

  for (const folderId of folderIds) {
    const result = await buildFolderView(join(sourceDir, folderId), folderId, vocab);
    if (!result.ok) {
      console.warn(`[library] ${result.folderId}: ${result.reason} — cannot compare.`);
      invalidCount++;
      continue;
    }
    localByUid.set(result.view.productUid.toUpperCase(), result.view);
  }

  log(
    json,
    `[library] check: ${localByUid.size} local set(s), ${dbSets.length} DB set(s), ${invalidCount} local folder(s) invalid/unimportable.`,
  );

  let matched = 0;
  const mismatched: CheckSummary['mismatched'] = [];
  const notImported: CheckSummary['notImported'] = [];
  const orphaned: CheckSummary['orphaned'] = [];
  const rows: { status: string; folder: string; productUid: string; id: string; differences: string }[] = [];

  for (const [uid, view] of localByUid) {
    const dbSet = dbByUid.get(uid);
    if (!dbSet) {
      notImported.push({ folderId: view.folderId, productUid: uid });
      rows.push({ status: 'NOT IMPORTED', folder: view.folderId, productUid: uid, id: '', differences: '' });
      continue;
    }

    const differences = sourceDifferences(view, dbSet);

    if (differences.length > 0) {
      mismatched.push({ folderId: view.folderId, productUid: uid, differences });
      rows.push({
        status: 'DIFFERS',
        folder: view.folderId,
        productUid: uid,
        id: dbSet.id,
        differences: differences.join(', '),
      });
    } else {
      matched++;
    }
  }

  for (const [uid, dbSet] of dbByUid) {
    if (!localByUid.has(uid)) {
      orphaned.push({ productUid: uid, id: dbSet.id });
      rows.push({ status: 'ORPHANED', folder: '', productUid: uid, id: dbSet.id, differences: '' });
    }
  }

  log(
    json,
    `[library] check done: ${matched} match, ${mismatched.length} differ, ${notImported.length} not imported, ${orphaned.length} orphaned in DB.`,
  );
  logTable(json, rows);

  return {
    localCount: localByUid.size,
    dbCount: dbSets.length,
    invalidCount,
    matched,
    mismatched,
    notImported,
    orphaned,
  };
}

type OrderStatus =
  'confirmed' | 'in_preparation' | 'to_send' | 'sent' | 'disponible' | 'received' | 'cancelled';

/** Only the fields this report reads — /operation/orders returns a lot more
 * (see AdminOrder in scripts/order.ts), left untyped here since every
 * script in this repo casts its own narrow view of a shared API response
 * rather than importing another script's types (see this file's header
 * comment on why). confirmedAt doubles as "order created date": this
 * schema's orders row has both created_at and confirmed_at default to
 * now() on the same insert (no separate draft stage precedes confirmation),
 * so they're always identical — and confirmedAt is the one already exposed
 * over this API. */
interface StockOrder {
  orderNumber: string;
  status: OrderStatus;
  confirmedAt: string;
  user: { email: string | null };
  items: { productUid: string; size: string; quantity: number }[];
}

interface StockReportRow {
  id: string;
  productUid: string;
  title: string;
  creationDate: string;
  /** Latest configured product price; absent only when a historic import has
   * no price row yet. */
  price?: number;
  /** User-library assignments; empty for public library products. */
  users: string[];
  sizes: Record<Size, number>;
  total: number;
  /** Order modes only (--with-orders/--not-sent) — one row per order item
   * rather than one per product, since a product's committed stock can come
   * from several different orders/customers at once and a single row can't
   * carry more than one order number. Undefined in the default `available`
   * scope. */
  orderNumber?: string;
  userEmail?: string;
  orderCreatedAt?: string;
}

interface StockReportSummary {
  scope: 'available' | 'with-orders' | 'not-sent';
  statuses: OrderStatus[] | undefined;
  totalsBySize: Record<Size, number>;
  totalUnits: number;
  /** Count of matching rows before --limit trims the page — a product count
   * in the default `available` scope, an order-item count in the two order
   * scopes (see StockReportRow's own comment on why the row unit changes). */
  totalRows: number;
  shown: number;
  offset: number;
  rows: StockReportRow[];
}

function emptySizeCounts(): Record<Size, number> {
  return { XS: 0, S: 0, M: 0, L: 0 };
}

/** stock-report's two data sources: `available` (this set's own sellable
 * stock table) by default, or live order items (already-committed units)
 * under --with-orders/--not-sent — see this file's header comment for why
 * those two modes count different order-status ranges. Both funnel into the
 * same StockReportRow shape so filtering/sorting/paging below stays a
 * single code path regardless of source. */
async function runStockReport(
  apiBaseUrl: string,
  opsToken: string,
  args: StockReportArgs,
): Promise<StockReportSummary> {
  const { sets } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    `/operation/library-import/sets?audience=${args.audience}`,
  )) as {
    sets: DbSet[];
  };

  let rows: StockReportRow[];
  let scope: StockReportSummary['scope'];
  let statuses: OrderStatus[] | undefined;

  if (args.withOrders || args.notSent) {
    statuses = args.notSent
      ? ['confirmed', 'in_preparation', 'to_send']
      : ['confirmed', 'in_preparation', 'to_send', 'sent', 'disponible'];
    scope = args.notSent ? 'not-sent' : 'with-orders';
    const statusSet = new Set<OrderStatus>(statuses);

    const setsByUid = new Map(sets.map((set) => [set.productUid.toUpperCase(), set]));
    const { orders } = (await apiFetch(apiBaseUrl, opsToken, '/operation/orders')) as {
      orders: StockOrder[];
    };

    rows = [];
    for (const order of orders) {
      if (!statusSet.has(order.status)) continue;
      for (const item of order.items) {
        if (!SIZES.includes(item.size as Size)) continue;
        const uid = item.productUid.toUpperCase();
        const set = setsByUid.get(uid);
        const sizeCounts = emptySizeCounts();
        sizeCounts[item.size as Size] = item.quantity;
        rows.push({
          id: set?.id ?? uid,
          productUid: uid,
          title: set?.title.fr ?? uid,
          creationDate: set?.creationDate ?? '',
          price: set?.price,
          users: set?.users ?? [],
          sizes: sizeCounts,
          total: item.quantity,
          orderNumber: order.orderNumber,
          userEmail: order.user.email ?? '—',
          orderCreatedAt: order.confirmedAt.slice(0, 10),
        });
      }
    }
  } else {
    scope = 'available';
    rows = sets.map((set) => {
      const sizeCounts = emptySizeCounts();
      for (const shapeAvailability of Object.values(set.availability)) {
        for (const lengthAvailability of Object.values(shapeAvailability)) {
          for (const size of SIZES) sizeCounts[size] += lengthAvailability[size] ?? 0;
        }
      }
      return {
        id: set.id,
        productUid: set.productUid,
        title: set.title.fr ?? set.productUid,
        creationDate: set.creationDate,
        price: set.price,
        users: set.users,
        sizes: sizeCounts,
        total: SIZES.reduce((sum, size) => sum + sizeCounts[size], 0),
      };
    });
  }

  if (args.creationBefore)
    rows = rows.filter((row) => row.creationDate && row.creationDate <= args.creationBefore!);
  if (args.creationAfter)
    rows = rows.filter((row) => row.creationDate && row.creationDate >= args.creationAfter!);
  // Newest product first; order modes break ties between several orders of
  // the same product by that order's own date, then its number, so the
  // table reads deterministically instead of shuffling on every run.
  rows.sort((a, b) => {
    if (a.creationDate !== b.creationDate) return a.creationDate < b.creationDate ? 1 : -1;
    const aOrderDate = a.orderCreatedAt ?? '';
    const bOrderDate = b.orderCreatedAt ?? '';
    if (aOrderDate !== bOrderDate) return aOrderDate < bOrderDate ? 1 : -1;
    return (a.orderNumber ?? '').localeCompare(b.orderNumber ?? '');
  });

  const totalsBySize = emptySizeCounts();
  let totalUnits = 0;
  for (const row of rows) {
    for (const size of SIZES) totalsBySize[size] += row.sizes[size];
    totalUnits += row.total;
  }
  const totalRows = rows.length;
  const noun = scope === 'available' ? 'product' : 'order item';

  const paged = rows.slice(args.offset, args.limit !== undefined ? args.offset + args.limit : undefined);

  log(
    args.json,
    `[library] stock-report scope=${scope}${statuses ? ` statuses=${statuses.join(',')}` : ''}: ${SIZES.map((size) => `${size}=${totalsBySize[size]}`).join(' ')} total=${totalUnits} (${totalRows} ${noun}${totalRows === 1 ? '' : 's'} matched).`,
  );
  if (!args.json) {
    // Footer row sums the page actually shown (not the full --from/--to
    // match) — the two are the same number whenever --limit isn't cutting
    // the table short, which is the common case; the summary line above
    // always carries the full-match totals regardless.
    let shownTotal = 0;
    for (const row of paged) shownTotal += row.total;
    const countLabel = `TOTAL (${paged.length} ${noun}${paged.length === 1 ? '' : 's'})`;

    if (scope === 'available') {
      logTable(args.json, [
        ...paged.map((row) => ({
          productUid: row.productUid,
          title: row.title,
          created: row.creationDate,
          price: row.price === undefined ? 'none' : row.price.toFixed(2),
          users: row.users.join(', ') || '—',
          XS: row.sizes.XS,
          S: row.sizes.S,
          M: row.sizes.M,
          L: row.sizes.L,
          total: row.total,
        })),
        {
          productUid: '',
          title: countLabel,
          created: '',
          price: '',
          users: '',
          XS: paged.reduce((sum, row) => sum + row.sizes.XS, 0),
          S: paged.reduce((sum, row) => sum + row.sizes.S, 0),
          M: paged.reduce((sum, row) => sum + row.sizes.M, 0),
          L: paged.reduce((sum, row) => sum + row.sizes.L, 0),
          total: shownTotal,
        },
      ]);
    } else {
      logTable(args.json, [
        ...paged.map((row) => ({
          orderNumber: row.orderNumber,
          userEmail: row.userEmail,
          orderCreated: row.orderCreatedAt,
          productUid: row.productUid,
          title: row.title,
          price: row.price === undefined ? 'none' : row.price.toFixed(2),
          users: row.users.join(', ') || '—',
          size: SIZES.find((size) => row.sizes[size] > 0) ?? '',
          quantity: row.total,
        })),
        {
          orderNumber: '',
          userEmail: '',
          orderCreated: '',
          productUid: '',
          title: countLabel,
          price: '',
          users: '',
          size: '',
          quantity: shownTotal,
        },
      ]);
    }
  }
  log(
    args.json,
    `[library] showing ${paged.length} of ${totalRows} ${noun}${totalRows === 1 ? '' : 's'}, offset=${args.offset}.`,
  );

  return {
    scope,
    statuses,
    totalsBySize,
    totalUnits,
    totalRows,
    shown: paged.length,
    offset: args.offset,
    rows: paged,
  };
}

async function runMain(args: Args | StockReportArgs): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in kernel JSON for ${args.mode} (http.apiBaseUrl).`);
  const opsToken = loadOpsToken(root, args.mode);
  if (!opsToken) fail(`OPS_TOKEN not found in kernel private JSON for ${args.mode} (ops.token).`);

  if (args.command === 'stock-report') {
    log(args.json, `[library] command=stock-report mode=${args.mode} api=${apiBaseUrl}`);
    const summary = await runStockReport(apiBaseUrl, opsToken, args);
    if (args.json) printJson({ command: args.command, ...summary });
    return;
  }

  const { command, target, update, deleteMissing, direction, mode, source, json } = args;
  const sourceDir = source ?? join(root, '..', '..', '..', 'sample', 'product', 'library');
  if (!existsSync(sourceDir)) {
    throw new Error(`Source library directory not found: ${sourceDir} (pass --source <path> to override).`);
  }

  log(
    json,
    `[library] command=${command} direction=${direction} deleteMissing=${deleteMissing} mode=${mode} api=${apiBaseUrl}`,
  );

  const { postOperatorActivity } = await import('./postOperatorActivity.js');
  const sourceBase = sourceDir.replace(/\/+$/, '').split('/').pop() || 'library';
  const catalogueLabel =
    sourceBase === 'library-user' || sourceBase === 'user-library'
      ? 'library-user'
      : sourceBase === 'library-nail'
        ? 'library-nail'
        : 'library';

  if (command === 'seed' && direction === 'local') {
    const summary = await runPullFromRemote(
      sourceDir,
      apiBaseUrl,
      opsToken,
      target,
      update,
      deleteMissing,
      json,
    );
    if (json) printJson({ command, direction, ...summary });
  } else if (command === 'seed') {
    const summary = await runCreate(sourceDir, apiBaseUrl, opsToken, target, update, deleteMissing, json);
    if (json) printJson({ command, direction, ...summary });
    const changed = summary.created + summary.updated + (summary.deleteSync?.deletedSets ?? 0);
    await postOperatorActivity(root, mode, {
      category: 'catalogue',
      action: 'library.seed',
      summary:
        changed === 0
          ? `Import catalogue (${catalogueLabel}): aucun changement`
          : `Import catalogue (${catalogueLabel}): ${summary.created} crees, ${summary.updated} mis a jour, ${summary.unchanged} inchanges`,
      detail: {
        direction: 'remote',
        catalogue: catalogueLabel,
        update,
        deleteMissing,
        target: target ?? null,
        created: summary.created,
        updated: summary.updated,
        unchanged: summary.unchanged,
        deletedSets: summary.deleteSync?.deletedSets ?? 0,
      },
      targets: summary.rows
        .filter((row) => row.result === 'created' || row.result === 'updated')
        .map((row) => row.productUid),
    });
  } else if (command === 'delete') {
    const summary = await runDelete(sourceDir, apiBaseUrl, opsToken, target!, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'catalogue',
      action: 'library.delete',
      summary: `Suppression catalogue (${catalogueLabel}): ${target}`,
      targetType: 'product',
      targetId: typeof summary === 'object' && summary && 'productUid' in summary
        ? String((summary as { productUid?: string }).productUid ?? target)
        : target!,
      detail: { catalogue: catalogueLabel, ...((summary as object) ?? {}) },
    });
  } else if (command === 'delete-shape') {
    const summary = await runDeleteVocabulary(apiBaseUrl, opsToken, 'shape', target!, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'catalogue',
      action: 'library.delete_shape',
      summary: `Suppression forme: ${target}`,
      targetType: 'shape',
      targetId: target!,
      detail: summary,
    });
  } else if (command === 'delete-color') {
    const summary = await runDeleteVocabulary(apiBaseUrl, opsToken, 'color', target!, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'catalogue',
      action: 'library.delete_color',
      summary: `Suppression couleur: ${target}`,
      targetType: 'color',
      targetId: target!,
      detail: summary,
    });
  } else if (command === 'delete-all') {
    const summary = await runDeleteAll(apiBaseUrl, opsToken, json);
    if (json) printJson({ command, ...summary });
    await postOperatorActivity(root, mode, {
      category: 'catalogue',
      action: 'library.delete_all',
      summary: 'Suppression complete du catalogue library',
      detail: summary,
    });
  } else {
    const summary = await runCheck(sourceDir, apiBaseUrl, opsToken, json);
    if (json) printJson({ command, ...summary });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[library] failed', error);
    process.exitCode = 1;
  }
}

type SeedOpts = {
  mode: Mode;
  json?: boolean;
  update?: boolean;
  delete?: boolean;
  direction: Direction;
  source?: string;
  confirm?: boolean;
};
type TargetOpts = { mode: Mode; json?: boolean; confirm?: boolean };
type DeleteAllOpts = { mode: Mode; json?: boolean; confirm?: boolean };
type CheckOpts = { mode: Mode; json?: boolean; source?: string };

function baseArgs(command: Command, mode: Mode, json: boolean): Args {
  return {
    command,
    target: undefined,
    update: false,
    deleteMissing: false,
    direction: 'remote',
    mode,
    source: undefined,
    confirm: false,
    json,
  };
}

addConfirmOption(addCommonOptions(program.command('seed')))
  .description(
    "Push catalog source's local library up into the DB (or pull DB rows down into data-static.json with --direction local).",
  )
  .argument('[target]', 'a folder id (0158) or a product-uid (case-insensitive)')
  .option('--update', 'update the destination in place when a product-uid already exists and differs')
  .option('--delete', 'with a full seed --update, make the destination match the complete source')
  .addOption(
    new Option(
      '--direction <direction>',
      'remote pushes the local library to the DB; local pulls DB rows into data-static.json',
    )
      .choices(['local', 'remote'])
      .default('remote'),
  )
  .option('--source <path>', 'defaults to catalog import tree/product/library')
  .action((target: string | undefined, opts: SeedOpts) =>
    runAction(async () => {
      // --direction local only reads the target DB (writes local files) —
      // same "reading prod is fine" treatment as order/log's own read
      // commands. Only the DB-mutating remote direction needs --confirm.
      if (opts.direction !== 'local') requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      const deleteMissing = Boolean(opts.delete);
      const update = Boolean(opts.update);
      if (deleteMissing && !update) fail('--delete requires --update.');
      if (deleteMissing && target !== undefined) fail('--delete requires a full seed with no <target>.');
      await runMain({
        ...baseArgs('seed', opts.mode, Boolean(opts.json)),
        target,
        update,
        deleteMissing,
        direction: opts.direction,
        source: opts.source,
      });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete')))
  .description('Delete a set from the DB.')
  .argument('<target>', 'a folder id (0158) or a product-uid (case-insensitive)')
  .action((target: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      await runMain({ ...baseArgs('delete', opts.mode, Boolean(opts.json)), target });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete-shape')))
  .description('Delete a shape vocabulary key from the DB.')
  .argument('<key>', 'the shape key')
  .action((target: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-shape');
      await runMain({ ...baseArgs('delete-shape', opts.mode, Boolean(opts.json)), target });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete-color')))
  .description('Delete a color vocabulary key from the DB.')
  .argument('<key>', 'the color key')
  .action((target: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-color');
      await runMain({ ...baseArgs('delete-color', opts.mode, Boolean(opts.json)), target });
    }),
  );

addConfirmOption(
  addCommonOptions(program.command('delete-all')),
  'required when targeting --prod — destroys every set and vocabulary entry in the target database',
)
  .description('Wipe every gallery set and the shapes/colors vocabulary tables. Destructive.')
  .action((opts: DeleteAllOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-all');
      await runMain({ ...baseArgs('delete-all', opts.mode, Boolean(opts.json)), confirm: true });
    }),
  );

addCommonOptions(program.command('check'))
  .description('Compare the local library against the DB without changing anything.')
  .option('--source <path>', 'defaults to catalog import tree/product/library')
  .action((opts: CheckOpts) =>
    runAction(async () => {
      await runMain({ ...baseArgs('check', opts.mode, Boolean(opts.json)), source: opts.source });
    }),
  );

addCommonOptions(program.command('stock-report'))
  .description('Read-only stock report by size, from either the available-stock table or live orders.')
  .option(
    '--from <val>',
    'index, relative day count ("5d"), or date (YYYY-MM-DD) — recent boundary, against product creation-date',
  )
  .option(
    '--to <val>',
    'index, relative day count ("5d"), or date (YYYY-MM-DD) — older boundary, against product creation-date',
  )
  .option('--limit <n>', 'cap the result count (cannot combine with an index --from/--to range)')
  .option(
    '--with-orders',
    'source from live orders in the confirmed -> sent pipeline instead of the available-stock table',
  )
  .option('--not-sent', 'like --with-orders, but excludes already-sent orders')
  .addOption(
    new Option('--audience <audience>', 'internal audience scope')
      .choices(['public', 'user-library'])
      .default('public')
      .hideHelp(),
  )
  .action((opts: StockReportOpts) => runAction(() => runMain(buildStockReportArgs(opts))));

program.parse();
