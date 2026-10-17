/** OPS_TOKEN-gated CLI driving /operation/library-import/* for accessories
 * under catalog source/product/accessory/<id>/ — same HTTP-only pattern
 * as scripts/library.ts (no direct DB/filesystem on remote targets).
 *
 * Usage:
 *   npm run accessory -- seed [<target>] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run accessory -- delete <target> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run accessory -- check [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run accessory -- stock-report [--from <val>] [--to <val>] [--limit <n>] [--json] --dev|--preprod|--prod
 *
 *   --confirm       required on seed (unless --direction local, which only
 *                    reads the target DB) and delete, only when targeting
 *                    --prod — never for --dev/--preprod. check is read-only
 *                    and never needs it.
 *   <target>        a folder id (0001) or a product-uid (TK-PT-248,
 *                    case-insensitive).
 *   --update        an existing product-uid is normally a no-op; with this
 *                    flag, differences update the DB in place; photos are
 *                    re-uploaded only when their count/hash state differs.
 *   --delete        with a full `seed --update`, deletes DB accessories that
 *                    are absent from the manager source (remote), or local
 *                    accessory folders absent from the DB (local).
 *   --direction     remote (default) pushes manager data to the DB; local
 *                    pulls DB metadata into manager data-static.json files.
 *   --dev|--preprod|--prod  required, no default.
 *   --source        defaults to catalog import tree/product/accessory.
 *
 * Accessories differ from nails:
 *   - product_type = 'accessory'
 *   - no shapes/colors/occasion required (occasion null)
 *   - default type: scalar `available` / `price`, photos flat under modal/*.webp
 *     (shape_key '' in DB; URL sentinel `-`)
 *   - byQuantity type: `available.max` unit pool + pack multipliers, photos under
 *     modal/<packKey>/ (shape_key = pack, length_key '')
 */
import { Command as Program, Option } from 'commander';
import { existsSync } from 'node:fs';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';
import {
  AccessoryPackError,
  jsonRecordEqual,
  parseAccessorySource,
  parseInCartCarousel,
  sourceAvailable,
  sourcePrice,
  type AccessoryType,
} from '../src/modules/catalog/domain/accessoryPacks.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** URL sentinel for accessory shape_key '' — see libraryImport.routes.ts. */
const EMPTY_SHAPE_SENTINEL = '-';

const PRODUCT_UID_RE = /^[a-z]{2}-[a-z]{2}-\d{3}$/i;
const FOLDER_ID_RE = /^\d{4}$/;

type Command = 'seed' | 'delete' | 'check' | 'stock-report';

interface Args {
  command: Command;
  target?: string;
  update: boolean;
  deleteMissing: boolean;
  direction: 'local' | 'remote';
  mode: string;
  source?: string;
  json: boolean;
  offset?: number;
  limit?: number;
  creationAfter?: string;
  creationBefore?: string;
}

interface RemoteAccessoryStockRow {
  productUid: string;
  title: RawPartial;
  creationDate: string;
  price: number | undefined;
  availability: Record<string, Record<string, Record<string, number>>>;
  accessoryType?: AccessoryType;
  accessoryPackPrices?: Record<string, number>;
}

function stockPrice(row: RemoteAccessoryStockRow): string {
  const packPrices = row.accessoryPackPrices ?? {};
  if (row.accessoryType === 'byQuantity' && Object.keys(packPrices).length > 0) {
    return Object.entries(packPrices)
      .map(([pack, price]) => `${pack}=${price.toFixed(2)}`)
      .join(', ');
  }
  return row.price === undefined ? 'none' : row.price.toFixed(2);
}

async function runStockReport(
  apiBaseUrl: string,
  opsToken: string,
  args: Required<Pick<Args, 'offset'>> & Pick<Args, 'limit' | 'creationAfter' | 'creationBefore' | 'json'>,
) {
  const { sets } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/library-import/sets?productType=accessory',
  )) as {
    sets: RemoteAccessoryStockRow[];
  };
  let rows = sets.map((set) => ({
    productUid: set.productUid,
    title: set.title.fr ?? set.productUid,
    created: set.creationDate,
    type: set.accessoryType ?? 'default',
    price: stockPrice(set),
    available: set.availability?.['']?.['']?.[''] ?? 0,
  }));
  if (args.creationBefore) rows = rows.filter((row) => row.created <= args.creationBefore!);
  if (args.creationAfter) rows = rows.filter((row) => row.created >= args.creationAfter!);
  rows.sort((left, right) => right.created.localeCompare(left.created));
  const total = rows.reduce((sum, row) => sum + row.available, 0);
  const paged = rows.slice(args.offset, args.limit === undefined ? undefined : args.offset + args.limit);
  log(
    args.json,
    `[accessory] stock-report scope=available: total=${total} (${rows.length} accessor${rows.length === 1 ? 'y' : 'ies'} matched).`,
  );
  logTable(args.json, [
    ...paged,
    {
      productUid: '',
      title: `TOTAL (${paged.length})`,
      created: '',
      type: '',
      price: '',
      available: paged.reduce((sum, row) => sum + row.available, 0),
    },
  ]);
  return { total, totalRows: rows.length, rows: paged };
}

type DateOrIndex = { kind: 'date'; iso: string } | { kind: 'index'; value: number };
function parseStockBound(raw: string, flag: string): DateOrIndex {
  if (/^\d+d$/i.test(raw)) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - Number(raw.slice(0, -1)));
    return { kind: 'date', iso: date.toISOString().slice(0, 10) };
  }
  if (/^\d+$/.test(raw)) return { kind: 'index', value: Number(raw) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(raw).getTime())) {
    fail(`${flag} must be an index, a relative day count (e.g. "5d"), or YYYY-MM-DD.`);
  }
  return { kind: 'date', iso: raw };
}

function stockReportArgs(
  opts: StockReportOpts,
): Pick<Args, 'offset' | 'limit' | 'creationAfter' | 'creationBefore'> {
  const from = opts.from === undefined ? undefined : parseStockBound(opts.from, '--from');
  const to = opts.to === undefined ? undefined : parseStockBound(opts.to, '--to');
  if (from && to && from.kind !== to.kind) fail('--from and --to must be the same kind.');
  const rawLimit = opts.limit === undefined ? undefined : Number(opts.limit);
  if (rawLimit !== undefined && (!Number.isSafeInteger(rawLimit) || rawLimit <= 0))
    fail('--limit must be a positive integer.');
  if ((from?.kind ?? to?.kind) === 'index') {
    if (rawLimit !== undefined) fail('--limit cannot be combined with an index range.');
    const offset = from?.kind === 'index' ? from.value : 0;
    const end = to?.kind === 'index' ? to.value : undefined;
    const limit = end === undefined ? undefined : end - offset + 1;
    if (limit !== undefined && limit <= 0) fail('--from/--to index range must resolve to a positive count.');
    return { offset, limit };
  }
  return {
    offset: 0,
    limit: rawLimit,
    creationBefore: from?.kind === 'date' ? from.iso : undefined,
    creationAfter: to?.kind === 'date' ? to.iso : undefined,
  };
}

const program = new Program();
program
  .name('accessory')
  .description('OPS_TOKEN-gated CLI driving /operation/library-import/* for accessories.');
const fail: (message: string) => never = makeFail(program, 'accessory');

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { ...opsRequestHeaders(opsToken), ...init.headers },
  });
  const body = (await res.json().catch(() => null)) as unknown;
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

interface RawPartial {
  fr?: string;
  en?: string;
  th?: string;
  es?: string;
  it?: string;
  nl?: string;
  pt?: string;
}

interface GeneratedMeta {
  title?: RawPartial;
  desc?: RawPartial;
  /** Default: flat array. byQuantity: pack → array. photo is the filename stem. */
  photos?:
    | Array<{ photo?: string | number; hash?: string }>
    | Record<string, Array<{ photo?: string | number; hash?: string }>>;
}

interface StaticMeta {
  'product-uid'?: string;
  'creation-date'?: string;
  hidden?: boolean;
  featured?: { from: string; for: number };
  type?: AccessoryType;
  inCartCarousel?: boolean | string;
  price?: number | Record<string, number>;
  available?: number | Record<string, number>;
  title?: RawPartial;
  desc?: RawPartial;
  /** Per-product loyalty earn multiplier (maps to products.loyalty_multiplier). */
  loyalties?: number;
}

interface PhotoFile {
  packKey: string;
  position: number;
  modalPath: string;
  hash: string | null;
}

interface DesiredState {
  title: RawPartial;
  desc: RawPartial;
  hidden: boolean;
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  accessoryType: AccessoryType;
  packs: Record<string, number>;
  packPrices: Record<string, number>;
  price: number | undefined;
  availability: number;
  inCartCarousel: boolean;
  loyaltyMultiplier: number;
}

function parseLoyalties(raw: unknown, folderId: string): number {
  if (raw === undefined || raw === null) return 1;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
    console.warn(
      `[accessory] ${folderId}: "loyalties" must be a number >= 0 — got ${JSON.stringify(raw)}, using 1.`,
    );
    return 1;
  }
  return raw;
}

interface FolderView {
  folderId: string;
  productUid: string;
  desired: DesiredState;
  photos: PhotoFile[];
}

type FolderViewResult = { ok: true; view: FolderView } | { ok: false; folderId: string; reason: string };

async function readJsonIfExists<T>(path: string): Promise<T | undefined> {
  if (!existsSync(path)) return undefined;
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function mergeTrilingual(
  generated: RawPartial | undefined,
  staticOverride: RawPartial | undefined,
): RawPartial | undefined {
  const merged = { ...generated, ...staticOverride };
  if (!merged.fr) return undefined;
  return merged;
}

interface AccessoryDataCommon {
  quantity?: Record<string, RawPartial>;
}

function parseQuantityVocab(raw: unknown): Record<string, RawPartial> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const quantities: Record<string, RawPartial> = {};
  for (const [key, label] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !label || typeof label !== 'object' || Array.isArray(label)) continue;
    const partial = label as RawPartial;
    if (typeof partial.fr !== 'string' || !partial.fr) continue;
    quantities[key] = partial;
  }
  return quantities;
}

function quantityMapsDiffer(a: Record<string, RawPartial>, b: Record<string, RawPartial>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].some((key) => !a[key] || !b[key] || partialDiffers(a[key]!, b[key]!));
}

async function loadLocalQuantity(sourceDir: string): Promise<Record<string, RawPartial>> {
  const dataCommon = await readJsonIfExists<AccessoryDataCommon>(join(sourceDir, 'data-common.json'));
  return parseQuantityVocab(dataCommon?.quantity);
}

async function syncRemoteQuantityVocab(
  apiBaseUrl: string,
  opsToken: string,
  quantities: Record<string, RawPartial>,
  deleteMissing: boolean,
  json: boolean,
): Promise<{ quantities: number; deletedQuantities: string[] }> {
  const result = (await apiJson(apiBaseUrl, opsToken, '/operation/library-import/accessory-vocabulary', {
    quantities,
    deleteMissing,
  })) as { quantities: number; deletedQuantities: string[] };
  log(
    json,
    `[accessory] quantity vocab: ${result.quantities} key(s)${
      result.deletedQuantities?.length ? `, deleted ${result.deletedQuantities.join(', ')}` : ''
    }.`,
  );
  return result;
}

async function fetchRemoteQuantityVocab(
  apiBaseUrl: string,
  opsToken: string,
): Promise<Record<string, RawPartial>> {
  const remote = (await apiFetch(apiBaseUrl, opsToken, '/operation/library-import/accessory-vocabulary')) as {
    quantities?: Record<string, RawPartial>;
  };
  return parseQuantityVocab(remote.quantities);
}

async function writeLocalQuantity(sourceDir: string, quantities: Record<string, RawPartial>): Promise<void> {
  const path = join(sourceDir, 'data-common.json');
  const existing = (await readJsonIfExists<AccessoryDataCommon>(path)) ?? {};
  await writeFile(path, `${JSON.stringify({ ...existing, quantity: quantities }, null, 2)}\n`);
}

async function listFolderIds(sourceDir: string): Promise<string[]> {
  return (await readdir(sourceDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== '_new')
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function resolveFolderIds(sourceDir: string, target: string | undefined): Promise<string[]> {
  const allFolderIds = await listFolderIds(sourceDir);
  if (target === undefined) return allFolderIds;
  if (allFolderIds.includes(target)) return [target];
  if (PRODUCT_UID_RE.test(target)) {
    const upper = target.toUpperCase();
    for (const folderId of allFolderIds) {
      const staticMeta = await readJsonIfExists<StaticMeta>(join(sourceDir, folderId, 'data-static.json'));
      if (staticMeta?.['product-uid']?.toUpperCase() === upper) return [folderId];
    }
    fail(`No folder in ${sourceDir} has product-uid "${upper}".`);
  }
  if (FOLDER_ID_RE.test(target)) {
    fail(`"${target}" is not a folder in ${sourceDir}.`);
  }
  fail(`"${target}" must be a four-digit folder id or a product-uid (LL-LL-DDD).`);
}

async function resolveProductUidForDelete(sourceDir: string, target: string): Promise<string> {
  if (PRODUCT_UID_RE.test(target)) return target.toUpperCase();
  if (FOLDER_ID_RE.test(target)) {
    const staticMeta = await readJsonIfExists<StaticMeta>(join(sourceDir, target, 'data-static.json'));
    const productUid = staticMeta?.['product-uid'];
    if (!productUid) {
      fail(
        `Folder "${target}" has no data-static.json / product-uid in ${sourceDir} — pass its product-uid directly instead.`,
      );
    }
    return productUid.toUpperCase();
  }
  fail(`"${target}" must be a four-digit folder id or a product-uid (LL-LL-DDD).`);
}

function hashMapFromEntries(
  entries: Array<{ photo?: string | number; hash?: string }> | undefined,
): Map<string, string> {
  const hashByPhoto = new Map<string, string>();
  if (!Array.isArray(entries)) return hashByPhoto;
  for (const entry of entries) {
    if (
      (typeof entry?.photo === 'string' || typeof entry?.photo === 'number') &&
      typeof entry?.hash === 'string' &&
      entry.hash.length > 0
    ) {
      hashByPhoto.set(String(entry.photo), entry.hash);
    }
  }
  return hashByPhoto;
}

async function collectPhotosInDir(
  modalDir: string,
  packKey: string,
  generatedPhotos?: Array<{ photo?: string | number; hash?: string }>,
): Promise<PhotoFile[]> {
  if (!existsSync(modalDir)) return [];
  const parseNum = (filename: string) => {
    const match = /^(\d+)\.[^.]+$/.exec(filename);
    return match ? Number(match[1]) : undefined;
  };
  const hashByPhoto = hashMapFromEntries(generatedPhotos);
  const photos: PhotoFile[] = [];
  for (const file of await readdir(modalDir)) {
    const num = parseNum(file);
    if (num === undefined) continue;
    const photo = basename(file, extname(file));
    photos.push({
      packKey,
      position: num,
      modalPath: join(modalDir, file),
      hash: hashByPhoto.get(photo) ?? null,
    });
  }
  return photos.sort((a, b) => a.position - b.position);
}

async function collectAccessoryPhotos(
  setDir: string,
  accessoryType: AccessoryType,
  packKeys: string[],
  generatedPhotos: GeneratedMeta['photos'],
): Promise<PhotoFile[]> {
  if (accessoryType !== 'byQuantity') {
    return collectPhotosInDir(
      join(setDir, 'modal'),
      '',
      Array.isArray(generatedPhotos) ? generatedPhotos : undefined,
    );
  }
  const nested =
    generatedPhotos && typeof generatedPhotos === 'object' && !Array.isArray(generatedPhotos)
      ? generatedPhotos
      : {};
  const photos: PhotoFile[] = [];
  for (const packKey of [...packKeys].sort()) {
    photos.push(...(await collectPhotosInDir(join(setDir, 'modal', packKey), packKey, nested[packKey])));
  }
  return photos;
}

function photosByPack(photos: PhotoFile[]): Map<string, PhotoFile[]> {
  const grouped = new Map<string, PhotoFile[]>();
  for (const photo of photos) {
    const list = grouped.get(photo.packKey) ?? [];
    list.push(photo);
    grouped.set(photo.packKey, list);
  }
  return grouped;
}

async function uploadPhotos(
  apiBaseUrl: string,
  opsToken: string,
  setId: string,
  photos: PhotoFile[],
  json: boolean,
): Promise<number> {
  let added = 0;
  for (const [packKey, packPhotos] of photosByPack(photos)) {
    if (packPhotos.length === 0) continue;
    const form = new FormData();
    // See library.ts: the PHP gateway needs bracketed repeated field names
    // to preserve every upload before it proxies to loopback Multer.
    const photoField = process.env.PAM_OPS_TRANSPORT === 'ftp' ? 'photos[]' : 'photos';
    for (const photo of packPhotos) {
      const buffer = await readFile(photo.modalPath);
      form.append(photoField, new Blob([buffer]), photo.modalPath.split('/').pop());
    }
    form.append('hashes', JSON.stringify(packPhotos.map((photo) => photo.hash)));
    const shapeKey = packKey || EMPTY_SHAPE_SENTINEL;
    const result = (await apiFetch(
      apiBaseUrl,
      opsToken,
      `/operation/library-import/sets/${setId}/shapes/${encodeURIComponent(shapeKey)}/lengths/${EMPTY_SHAPE_SENTINEL}/photos`,
      { method: 'POST', body: form },
    )) as { added: number };
    added += result.added;
    log(
      json,
      `[accessory]   photos: ${result.added} uploaded (shape_key ${packKey || "''"} / length_key '').`,
    );
  }
  return added;
}

function accessoryPhotosNeedRefresh(view: FolderView, remote: RemoteAccessory | undefined): boolean {
  if (!remote) return false;
  const grouped = photosByPack(view.photos);
  const packKeys = new Set([
    ...grouped.keys(),
    ...Object.keys(remote.photoCounts ?? {}),
    ...Object.keys(remote.photoHashes ?? {}),
  ]);
  for (const packKey of packKeys) {
    const local = grouped.get(packKey) ?? [];
    const localHashes = local.map((photo) => photo.hash ?? '');
    const remoteHashes = remote.photoHashes?.[packKey]?.[''] ?? [];
    const remoteCount = remote.photoCounts?.[packKey]?.[''] ?? 0;
    if (
      remoteCount !== local.length ||
      remoteHashes.length !== localHashes.length ||
      localHashes.some((hash, index) => hash !== remoteHashes[index])
    ) {
      return true;
    }
  }
  return false;
}

async function buildFolderView(setDir: string, folderId: string): Promise<FolderViewResult> {
  const generated = (await readJsonIfExists<GeneratedMeta>(join(setDir, 'data-generated.json'))) ?? {};
  const staticMeta = await readJsonIfExists<StaticMeta>(join(setDir, 'data-static.json'));

  if (!staticMeta) return { ok: false, folderId, reason: 'no data-static.json (no product-uid)' };
  const productUid = staticMeta['product-uid'];
  if (!productUid) return { ok: false, folderId, reason: 'data-static.json has no product-uid' };

  const title = mergeTrilingual(generated.title, staticMeta.title);
  const desc = mergeTrilingual(generated.desc, staticMeta.desc);
  if (!title || !desc) return { ok: false, folderId, reason: 'missing title/desc.fr' };

  let parsed;
  try {
    parsed = parseAccessorySource({
      type: staticMeta.type,
      available: staticMeta.available,
      price: staticMeta.price,
    });
  } catch (error) {
    const message = error instanceof AccessoryPackError ? error.message : String(error);
    return { ok: false, folderId, reason: message };
  }

  const photos = await collectAccessoryPhotos(
    setDir,
    parsed.accessoryType,
    Object.keys(parsed.packs),
    generated.photos,
  );
  if (parsed.accessoryType === 'byQuantity') {
    const missing = Object.keys(parsed.packs).filter(
      (packKey) => !photos.some((photo) => photo.packKey === packKey),
    );
    if (missing.length > 0) {
      return { ok: false, folderId, reason: `missing photos for pack(s): ${missing.join(', ')}` };
    }
  }

  return {
    ok: true,
    view: {
      folderId,
      productUid,
      desired: {
        title,
        desc,
        hidden: !!staticMeta.hidden,
        featuredFrom: staticMeta.featured?.from ?? null,
        featuredFor: staticMeta.featured?.for ?? null,
        creationDate: staticMeta['creation-date'] ?? todayIso(),
        accessoryType: parsed.accessoryType,
        packs: parsed.packs,
        packPrices: parsed.packPrices,
        price: parsed.unitPrice,
        availability: parsed.max,
        inCartCarousel: parseInCartCarousel(staticMeta.inCartCarousel),
        loyaltyMultiplier: parseLoyalties(staticMeta.loyalties, folderId),
      },
      photos,
    },
  };
}

interface CreateSummary {
  created: number;
  updated: number;
  priceOnlyUpdated: number;
  stockUpdated: number;
  unchanged: number;
  invalid: number;
  rows: Array<{
    folder: string;
    id: string;
    productUid: string;
    result: string;
    changes: string;
    changedFields: string[];
    price: string;
    availability: string;
    stock: number | null;
  }>;
  deleteSync?: { deletedAccessories: string[] };
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
  const folderIds = await resolveFolderIds(sourceDir, target);
  let created = 0;
  let updated = 0;
  let priceOnlyUpdated = 0;
  let stockUpdated = 0;
  let unchanged = 0;
  let invalid = 0;
  const rows: {
    folder: string;
    id: string;
    productUid: string;
    result: string;
    changes: string;
    changedFields: string[];
    price: string;
    availability: string;
    stock: number | null;
  }[] = [];

  const prepared: { folderId: string; view: FolderView }[] = [];
  for (const folderId of folderIds) {
    const result = await buildFolderView(join(sourceDir, folderId), folderId);
    if (!result.ok) {
      console.warn(`[accessory] ${result.folderId}: ${result.reason} — skipped.`);
      invalid++;
      continue;
    }
    prepared.push({ folderId, view: result.view });
  }

  await syncRemoteQuantityVocab(
    apiBaseUrl,
    opsToken,
    await loadLocalQuantity(sourceDir),
    deleteMissing,
    json,
  );

  const remoteByUid = new Map<string, RemoteAccessory>();
  if (update && prepared.length > 0) {
    const remote = (await apiFetch(
      apiBaseUrl,
      opsToken,
      '/operation/library-import/sets?productType=accessory',
    )) as { sets: RemoteAccessory[] };
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
            const refreshPhotos = update && accessoryPhotosNeedRefresh(view, remote);
            return {
              productUid: view.productUid,
              productType: 'accessory',
              title: view.desired.title,
              desc: view.desired.desc,
              occasion: null,
              shapeKeys: [],
              colorMainKeys: [],
              colorSecondaryKeys: [],
              hidden: view.desired.hidden,
              featuredFrom: view.desired.featuredFrom,
              featuredFor: view.desired.featuredFor,
              creationDate: view.desired.creationDate,
              price: view.desired.price,
              availability: view.desired.availability,
              accessoryType: view.desired.accessoryType,
              accessoryPacks: view.desired.packs,
              accessoryPackPrices: view.desired.packPrices,
              inCartCarousel: view.desired.inCartCarousel,
              loyaltyMultiplier: view.desired.loyaltyMultiplier,
              update,
              refreshPhotos,
            };
          }),
        })) as { results: ImportResponse[] });

  for (const [index, { folderId, view }] of prepared.entries()) {
    const response = batch.results[index];
    if (!response) throw new Error(`Batch response is missing result ${index} (${view.productUid}).`);

    if (response.created || response.photosCleared) {
      if (view.photos.length === 0) {
        console.warn(`[accessory] ${folderId}: no modal photos found on disk.`);
      } else {
        await uploadPhotos(apiBaseUrl, opsToken, response.id, view.photos, json);
      }
    }

    const price =
      view.desired.accessoryType === 'byQuantity' && Object.keys(view.desired.packPrices).length > 0
        ? JSON.stringify(view.desired.packPrices)
        : (view.desired.price?.toFixed(2) ?? 'none');
    if (response.availabilityUpdated) stockUpdated++;
    const availability = String(view.desired.availability);
    const stock = view.desired.availability;
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
        changes,
        changedFields,
        price,
        availability,
        stock,
      });
    } else if (response.updated || response.photosCleared) {
      updated++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: response.updated ? 'updated' : 'photos refreshed',
        changes,
        changedFields,
        price,
        availability,
        stock,
      });
    } else if (response.priceUpdated || response.availabilityUpdated) {
      priceOnlyUpdated++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'price/availability only',
        changes,
        changedFields,
        price,
        availability,
        stock,
      });
    } else {
      unchanged++;
      rows.push({
        folder: folderId,
        id: response.id,
        productUid: view.productUid,
        result: 'unchanged',
        changes,
        changedFields,
        price,
        availability,
        stock,
      });
    }
  }

  log(
    json,
    `[accessory] seed done: ${created} created, ${updated} updated, ${priceOnlyUpdated} price/availability-only updated, ${stockUpdated} stock updated, ${unchanged} unchanged, ${invalid} invalid.`,
  );
  logTable(
    json,
    rows.map(({ folder, productUid, result, changes, price, availability }) => ({
      folder,
      productUid,
      result,
      changes,
      price,
      availability,
    })),
  );

  let deleteSync: CreateSummary['deleteSync'];
  if (deleteMissing) {
    deleteSync = {
      deletedAccessories: await deleteMissingRemoteAccessories(sourceDir, apiBaseUrl, opsToken, json),
    };
  }
  return {
    created,
    updated,
    priceOnlyUpdated,
    stockUpdated,
    unchanged,
    invalid,
    rows,
    deleteSync,
  };
}

async function deleteMissingRemoteAccessories(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<string[]> {
  const sourceUids = new Set<string>();
  for (const folderId of await listFolderIds(sourceDir)) {
    const meta = await readJsonIfExists<StaticMeta>(join(sourceDir, folderId, 'data-static.json'));
    if (meta?.['product-uid']) sourceUids.add(meta['product-uid'].toUpperCase());
  }

  const { sets } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/library-import/sets?productType=accessory',
  )) as { sets: Array<{ productUid: string }> };
  const missing = sets.filter((set) => !sourceUids.has(set.productUid.toUpperCase()));
  for (const set of missing) {
    await apiFetch(
      apiBaseUrl,
      opsToken,
      `/operation/library-import/sets/${encodeURIComponent(set.productUid)}`,
      { method: 'DELETE' },
    );
    log(json, `[accessory] deleted stale accessory ${set.productUid}.`);
  }
  log(
    json,
    `[accessory] delete sync: ${missing.length} DB-only accessor${missing.length === 1 ? 'y' : 'ies'} deleted.`,
  );
  return missing.map((set) => set.productUid);
}

async function runDelete(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  target: string,
  json: boolean,
): Promise<{ deleted: boolean; productUid: string }> {
  const productUid = await resolveProductUidForDelete(sourceDir, target);
  await apiFetch(apiBaseUrl, opsToken, `/operation/library-import/sets/${encodeURIComponent(productUid)}`, {
    method: 'DELETE',
  });
  log(json, `[accessory] deleted product-uid ${productUid}.`);
  return { deleted: true, productUid };
}

interface RemoteAccessory {
  productUid: string;
  title: RawPartial;
  desc: RawPartial;
  hidden: boolean;
  featuredFrom: string | null;
  featuredFor: number | null;
  creationDate: string;
  price: number | undefined;
  availability: Record<string, Record<string, Record<string, number>>>;
  photoCounts: Record<string, Record<string, number>>;
  photoHashes: Record<string, Record<string, string[]>>;
  accessoryType?: AccessoryType;
  accessoryPacks?: Record<string, number>;
  accessoryPackPrices?: Record<string, number>;
  inCartCarousel?: boolean;
  loyaltyMultiplier?: number;
}

function partialDiffers(left: RawPartial, right: RawPartial): boolean {
  const languages: Array<keyof RawPartial> = ['en', 'fr'];
  return languages.some((language) => (left[language] ?? '') !== (right[language] ?? ''));
}

function remoteAccessoryQuantity(accessory: RemoteAccessory): number {
  return accessory.availability?.['']?.['']?.[''] ?? 0;
}

function staticMetaFromRemote(accessory: RemoteAccessory): StaticMeta {
  const accessoryType = accessory.accessoryType ?? 'default';
  const packs = accessory.accessoryPacks ?? {};
  const packPrices = accessory.accessoryPackPrices ?? {};
  const max = remoteAccessoryQuantity(accessory);
  const meta: StaticMeta = {
    'product-uid': accessory.productUid,
    'creation-date': accessory.creationDate,
    hidden: accessory.hidden,
    available: sourceAvailable(accessoryType, max, packs),
    title: accessory.title,
    desc: accessory.desc,
  };
  if (accessoryType !== 'default') meta.type = accessoryType;
  if (accessory.featuredFrom && accessory.featuredFor !== null) {
    meta.featured = { from: accessory.featuredFrom, for: accessory.featuredFor };
  }
  const price = sourcePrice(accessoryType, accessory.price, packPrices);
  if (price !== undefined) meta.price = price;
  if (accessory.inCartCarousel) meta.inCartCarousel = true;
  if ((accessory.loyaltyMultiplier ?? 1) !== 1) meta.loyalties = accessory.loyaltyMultiplier;
  return meta;
}

interface PullSummary {
  pulled: number;
  pending: number;
  unchanged: number;
  notInDb: number;
  invalid: number;
  onlyRemote: string[];
  rows: Array<{ folder: string; productUid: string; result: string; differences: string }>;
  deleteSync?: { deletedLocalAccessories: string[] };
  quantityVocabDiffers: boolean;
  quantityVocabPulled: boolean;
}

async function deleteMissingLocalAccessories(
  sourceDir: string,
  remoteByUid: Map<string, RemoteAccessory>,
  json: boolean,
): Promise<string[]> {
  const deleted: string[] = [];
  for (const folderId of await listFolderIds(sourceDir)) {
    const meta = await readJsonIfExists<StaticMeta>(join(sourceDir, folderId, 'data-static.json'));
    const productUid = meta?.['product-uid'];
    if (!productUid || remoteByUid.has(productUid.toUpperCase())) continue;
    await rm(join(sourceDir, folderId), { recursive: true });
    deleted.push(productUid);
    log(json, `[accessory] ${folderId}/ folder removed (DB has no ${productUid}).`);
  }
  log(
    json,
    `[accessory] local delete sync: ${deleted.length} DB-missing accessory folder${deleted.length === 1 ? '' : 's'} removed.`,
  );
  return deleted;
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
  const remote = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/library-import/sets?productType=accessory',
  )) as { sets: RemoteAccessory[] };
  const remoteByUid = new Map(remote.sets.map((set) => [set.productUid.toUpperCase(), set]));
  const seen = new Set<string>();
  const rows: PullSummary['rows'] = [];
  let pulled = 0;
  let pending = 0;
  let unchanged = 0;
  let notInDb = 0;
  let invalid = 0;

  for (const folderId of await resolveFolderIds(sourceDir, target)) {
    const setDir = join(sourceDir, folderId);
    const result = await buildFolderView(setDir, folderId);
    if (!result.ok) {
      console.warn(`[accessory] ${result.folderId}: ${result.reason} — skipped.`);
      invalid++;
      continue;
    }
    const { view } = result;
    const uid = view.productUid.toUpperCase();
    const dbAccessory = remoteByUid.get(uid);
    if (!dbAccessory) {
      notInDb++;
      rows.push({ folder: folderId, productUid: view.productUid, result: 'not in DB', differences: '' });
      continue;
    }
    seen.add(uid);

    const differences: string[] = [];
    if (partialDiffers(view.desired.title, dbAccessory.title)) differences.push('title');
    if (partialDiffers(view.desired.desc, dbAccessory.desc)) differences.push('desc');
    if (view.desired.hidden !== dbAccessory.hidden) differences.push('hidden');
    if (
      view.desired.featuredFrom !== dbAccessory.featuredFrom ||
      view.desired.featuredFor !== dbAccessory.featuredFor
    ) {
      differences.push('featured');
    }
    if (view.desired.creationDate !== dbAccessory.creationDate) differences.push('creation-date');
    if (view.desired.price !== dbAccessory.price) differences.push('price');
    if (view.desired.availability !== remoteAccessoryQuantity(dbAccessory)) differences.push('availability');
    if ((dbAccessory.accessoryType ?? 'default') !== view.desired.accessoryType) differences.push('type');
    if (!jsonRecordEqual(dbAccessory.accessoryPacks ?? {}, view.desired.packs)) differences.push('packs');
    if (!jsonRecordEqual(dbAccessory.accessoryPackPrices ?? {}, view.desired.packPrices)) {
      differences.push('pack-prices');
    }
    if (!!dbAccessory.inCartCarousel !== view.desired.inCartCarousel) differences.push('in-cart-carousel');
    if ((dbAccessory.loyaltyMultiplier ?? 1) !== view.desired.loyaltyMultiplier)
      differences.push('loyalties');

    if (differences.length === 0) {
      unchanged++;
      rows.push({ folder: folderId, productUid: view.productUid, result: 'unchanged', differences: '' });
    } else if (!update) {
      pending++;
      rows.push({
        folder: folderId,
        productUid: view.productUid,
        result: 'differs (rerun with --update)',
        differences: differences.join(', '),
      });
    } else {
      await writeFile(
        join(setDir, 'data-static.json'),
        `${JSON.stringify(staticMetaFromRemote(dbAccessory), null, 2)}\n`,
      );
      pulled++;
      rows.push({
        folder: folderId,
        productUid: view.productUid,
        result: 'pulled',
        differences: differences.join(', '),
      });
    }
  }

  const onlyRemote = remote.sets
    .filter((set) => !seen.has(set.productUid.toUpperCase()))
    .map((set) => set.productUid);
  log(
    json,
    `[accessory] local seed: ${pulled} pulled, ${pending} pending, ${unchanged} unchanged, ${notInDb} not in DB, ${invalid} invalid, ${onlyRemote.length} DB-only.`,
  );
  logTable(json, rows);

  const localQuantity = await loadLocalQuantity(sourceDir);
  const remoteQuantity = await fetchRemoteQuantityVocab(apiBaseUrl, opsToken);
  const quantityVocabDiffers = quantityMapsDiffer(localQuantity, remoteQuantity);
  let quantityVocabPulled = false;
  if (!quantityVocabDiffers) {
    log(json, '[accessory] quantity vocab: match.');
  } else if (!update) {
    log(json, '[accessory] quantity vocab: differs from the DB — rerun with --update to pull.');
  } else {
    await writeLocalQuantity(sourceDir, remoteQuantity);
    quantityVocabPulled = true;
    log(json, '[accessory] quantity vocab: pulled from the DB.');
  }

  let deleteSync: PullSummary['deleteSync'];
  if (deleteMissing) {
    deleteSync = {
      deletedLocalAccessories: await deleteMissingLocalAccessories(sourceDir, remoteByUid, json),
    };
  }
  return {
    pulled,
    pending,
    unchanged,
    notInDb,
    invalid,
    onlyRemote,
    rows,
    deleteSync,
    quantityVocabDiffers,
    quantityVocabPulled,
  };
}

async function runCheck(
  sourceDir: string,
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<{
  onlyLocal: string[];
  onlyRemote: string[];
  differ: string[];
  match: number;
  quantityVocabMatch: boolean;
}> {
  const remote = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/library-import/sets?productType=accessory',
  )) as { sets: RemoteAccessory[] };
  const remoteByUid = new Map(remote.sets.map((set) => [set.productUid.toUpperCase(), set]));

  const onlyLocal: string[] = [];
  const differ: string[] = [];
  let match = 0;

  for (const folderId of await listFolderIds(sourceDir)) {
    const result = await buildFolderView(join(sourceDir, folderId), folderId);
    if (!result.ok) {
      console.warn(`[accessory] ${result.folderId}: ${result.reason} — skipped.`);
      continue;
    }
    const { view } = result;
    const remoteRow = remoteByUid.get(view.productUid.toUpperCase());
    if (!remoteRow) {
      onlyLocal.push(view.productUid);
      continue;
    }
    remoteByUid.delete(view.productUid.toUpperCase());

    const remoteQty = remoteRow.availability?.['']?.['']?.[''] ?? 0;
    const titleFr = remoteRow.title?.fr ?? '';
    const descFr = remoteRow.desc?.fr ?? '';
    const photosDiffer = accessoryPhotosNeedRefresh(view, remoteRow);
    const same =
      titleFr === view.desired.title.fr &&
      descFr === view.desired.desc.fr &&
      !!remoteRow.hidden === view.desired.hidden &&
      remoteRow.creationDate === view.desired.creationDate &&
      (remoteRow.price ?? undefined) === view.desired.price &&
      remoteQty === view.desired.availability &&
      (remoteRow.accessoryType ?? 'default') === view.desired.accessoryType &&
      jsonRecordEqual(remoteRow.accessoryPacks ?? {}, view.desired.packs) &&
      jsonRecordEqual(remoteRow.accessoryPackPrices ?? {}, view.desired.packPrices) &&
      !!remoteRow.inCartCarousel === view.desired.inCartCarousel &&
      (remoteRow.loyaltyMultiplier ?? 1) === view.desired.loyaltyMultiplier &&
      !photosDiffer;
    if (same) match++;
    else differ.push(view.productUid);
  }

  const onlyRemote = [...remoteByUid.keys()];
  const quantityVocabMatch = !quantityMapsDiffer(
    await loadLocalQuantity(sourceDir),
    await fetchRemoteQuantityVocab(apiBaseUrl, opsToken),
  );
  log(
    json,
    `[accessory] check: ${match} match, ${differ.length} differ, ${onlyLocal.length} only-local, ${onlyRemote.length} only-remote, quantity vocab ${quantityVocabMatch ? 'match' : 'differ'}.`,
  );
  return { onlyLocal, onlyRemote, differ, match, quantityVocabMatch };
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${args.mode}/.public.env`);
  const opsToken = loadOpsToken(root, args.mode);
  if (!opsToken) fail(`OPS_TOKEN not found in .env/.private.env or .env/${args.mode}/.private.env`);

  if (args.command === 'stock-report') {
    const summary = await runStockReport(
      apiBaseUrl,
      opsToken,
      args as Required<Pick<Args, 'offset'>> &
        Pick<Args, 'limit' | 'creationAfter' | 'creationBefore' | 'json'>,
    );
    if (args.json) printJson({ command: args.command, ...summary });
    return;
  }

  const sourceDir = args.source ?? join(root, '..', 'catalog source', 'product', 'accessory');
  if (!existsSync(sourceDir)) {
    throw new Error(`Source accessory directory not found: ${sourceDir} (pass --source <path> to override).`);
  }

  log(
    args.json,
    `[accessory] command=${args.command} direction=${args.direction} deleteMissing=${args.deleteMissing} mode=${args.mode} api=${apiBaseUrl}`,
  );

  const { postOperatorActivity } = await import('./postOperatorActivity.js');

  if (args.command === 'seed' && args.direction === 'local') {
    const summary = await runPullFromRemote(
      sourceDir,
      apiBaseUrl,
      opsToken,
      args.target,
      args.update,
      args.deleteMissing,
      args.json,
    );
    if (args.json) printJson({ command: args.command, direction: args.direction, ...summary });
  } else if (args.command === 'seed') {
    const summary = await runCreate(
      sourceDir,
      apiBaseUrl,
      opsToken,
      args.target,
      args.update,
      args.deleteMissing,
      args.json,
    );
    if (args.json) printJson({ command: args.command, direction: args.direction, ...summary });
    const changed =
      summary.created +
      summary.updated +
      summary.priceOnlyUpdated +
      (summary.deleteSync?.deletedAccessories.length ?? 0);
    await postOperatorActivity(root, args.mode, {
      category: 'catalogue',
      action: 'accessory.seed',
      summary:
        changed === 0
          ? 'Import catalogue (accessory): aucun changement'
          : `Import catalogue (accessory): ${summary.created} crees, ${summary.updated} mis a jour, ${summary.priceOnlyUpdated} prix/dispo, ${summary.unchanged} inchanges`,
      detail: {
        direction: 'remote',
        update: args.update,
        deleteMissing: args.deleteMissing,
        target: args.target ?? null,
        created: summary.created,
        updated: summary.updated,
        priceOnlyUpdated: summary.priceOnlyUpdated,
        stockUpdated: summary.stockUpdated,
        unchanged: summary.unchanged,
        invalid: summary.invalid,
        deletedAccessories: summary.deleteSync?.deletedAccessories.length ?? 0,
      },
      targets: summary.rows
        .filter((row) => row.result === 'created' || row.result === 'updated' || row.result === 'price/availability only')
        .map((row) => row.productUid),
    });
  } else if (args.command === 'delete') {
    const summary = await runDelete(sourceDir, apiBaseUrl, opsToken, args.target!, args.json);
    if (args.json) printJson({ command: args.command, ...summary });
    await postOperatorActivity(root, args.mode, {
      category: 'catalogue',
      action: 'accessory.delete',
      summary: `Suppression catalogue (accessory): ${summary.productUid}`,
      targetType: 'product',
      targetId: summary.productUid,
      detail: summary,
    });
  } else {
    const summary = await runCheck(sourceDir, apiBaseUrl, opsToken, args.json);
    if (args.json) printJson({ command: args.command, ...summary });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[accessory] failed', error);
    process.exitCode = 1;
  }
}

type SeedOpts = {
  mode: Mode;
  json?: boolean;
  update?: boolean;
  delete?: boolean;
  direction: 'local' | 'remote';
  source?: string;
  confirm?: boolean;
};
type DeleteOpts = { mode: Mode; json?: boolean; confirm?: boolean };
type CheckOpts = { mode: Mode; json?: boolean; source?: string };
type StockReportOpts = { mode: Mode; json?: boolean; from?: string; to?: string; limit?: string };

addConfirmOption(addCommonOptions(program.command('seed')))
  .description(
    'Push manager data to the DB (or pull DB metadata into manager data-static.json files with --direction local).',
  )
  .argument('[target]', 'a folder id (0001) or a product-uid (case-insensitive)')
  .option(
    '--update',
    'update the DB in place when a product-uid already exists (photos only re-uploaded when count/hash differs)',
  )
  .option(
    '--delete',
    'with a full seed --update, delete DB accessories absent from the manager source (remote) or local accessory folders absent from the DB (local)',
  )
  .addOption(
    new Option(
      '--direction <direction>',
      'remote pushes manager data to the DB; local pulls DB metadata into manager data-static.json files',
    )
      .choices(['local', 'remote'])
      .default('remote'),
  )
  .option('--source <path>', 'defaults to catalog import tree/product/accessory')
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
        command: 'seed',
        target,
        update,
        deleteMissing,
        direction: opts.direction,
        mode: opts.mode,
        source: opts.source,
        json: Boolean(opts.json),
      });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete')))
  .description('Delete a product-uid from the DB.')
  .argument('<target>', 'a folder id (0001) or a product-uid (case-insensitive)')
  .action((target: string, opts: DeleteOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      await runMain({
        command: 'delete',
        target,
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        json: Boolean(opts.json),
      });
    }),
  );

addCommonOptions(program.command('check'))
  .description('Compare manager source data against the DB without changing anything.')
  .option('--source <path>', 'defaults to catalog import tree/product/accessory')
  .action((opts: CheckOpts) =>
    runAction(async () => {
      await runMain({
        command: 'check',
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        source: opts.source,
        json: Boolean(opts.json),
      });
    }),
  );

addCommonOptions(program.command('stock-report'))
  .description('Read-only available-stock report for accessories, newest creation date first.')
  .option('--from <val>', 'index, relative day count ("5d"), or date (YYYY-MM-DD) — recent boundary')
  .option('--to <val>', 'index, relative day count ("5d"), or date (YYYY-MM-DD) — older boundary')
  .option('--limit <n>', 'cap displayed accessory rows')
  .action((opts: StockReportOpts) =>
    runAction(async () => {
      await runMain({
        command: 'stock-report',
        update: false,
        deleteMissing: false,
        direction: 'remote',
        mode: opts.mode,
        json: Boolean(opts.json),
        ...stockReportArgs(opts),
      });
    }),
  );

program.parse();
