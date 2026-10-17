/** OPS_TOKEN-gated local order archive. `seed` pulls every order from the
 * selected database through /operation/orders and mirrors it into this
 * repository's order/<status>/<orderNumber>.json files. There is no
 * --direction because the only direction is DB -> local files: an order is
 * created by a customer, never by a manager source file, so there is nothing
 * to push the other way. It is named `seed` rather than `list` because it
 * rewrites the whole local archive — it is a synchronization, not a report.
 *
 * set-status/delete/delete-all keep that same local mirror in sync too, but
 * only touch the file(s) their own change actually affects — set-status
 * rewrites (and, if the status folder changed, moves) just the one order it
 * targeted; delete removes just that order's file; delete-all clears every
 * file since every order is gone. None of them re-fetch or re-diff the rest
 * of the archive the way `seed` does.
 *
 * Usage:
 *   npm run order -- seed [--status confirmed,in_preparation,to_send,sent,disponible,received,cancelled] [--language fr] [--json] --dev|--preprod|--prod
 *   npm run order -- set-status <orderNumber> <status> [--phone <phone>] [--skip-shipment-label] [--no-payment] [--bypass-lock-edit] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run order -- set-tracking <orderNumber> <trackingNumber> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run order -- delete <orderNumber> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run order -- delete-all [--confirm] [--json] --dev|--preprod|--prod
 *
 * --confirm is required on every write command (set-status/set-tracking/
 * delete/delete-all) only when targeting --prod — never for --dev/--preprod.
 * `seed` never writes to the database and so never needs it. See cliCommon.ts's
 * requireConfirmForProdWrite.
 *
 * --json (all commands): prints one JSON object to stdout instead of the
 * human-readable lines, and moves every other line (the banner, the local
 * mirror refresh's own narration) to stderr — safe to pipe into `jq`, a
 * file, or another script.
 *
 * --skip-shipment-label (set-status ... to_send only): moves the order to
 * to_send without calling the carrier's label API at all — for when the
 * automated call itself can't proceed (a real carrier-account error, e.g.
 * Mondial Relay's "no sorting plan for this product/postal code") but the
 * order still needs to ship by some other means. No packet/PDF sticker is
 * produced or downloaded in this case.
 *
 * set-tracking: records (or corrects) a carrier tracking reference by hand
 * — whatever value fits the order's own courier (e.g. a Mondial Relay
 * shipment number) — most useful after --skip-shipment-label left an order
 * with nothing to track but it has since actually shipped some other way.
 * Fails unless the order has already reached to_send or later.
 */
import { Argument, Command as Program, Option } from 'commander';
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orderRoot = join(root, '..', 'catalog source', 'order');
const packetDataPath = join(root, '..', 'catalog source', 'courier', 'data-packet.json');
const STATUSES = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received',
  'cancelled',
] as const;
const LANGUAGES = ['en', 'fr'] as const;
const ORDER_NUMBER_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const execFileAsync = promisify(execFile);

type Status = (typeof STATUSES)[number];
type Language = (typeof LANGUAGES)[number];
type Command = 'seed' | 'set-status' | 'set-tracking' | 'delete' | 'delete-all';

interface Args {
  command: Command;
  statuses: Status[];
  orderNumber: string | undefined;
  nextStatus: Status | undefined;
  trackingNumber: string | undefined;
  confirm: boolean;
  language: Language;
  json: boolean;
  mode: string;
  skipShippingLabel: boolean;
  phone: string | undefined;
  noPayment: boolean;
  bypassLockEdit: boolean;
}

interface AdminOrder {
  id: string;
  userId: string;
  user: {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
  };
  orderNumber: string;
  status: Status;
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  networkCode: string | null;
  pickupPoint: { id: string; metadata?: Record<string, string> } | null;
  courierCode: string | null;
  courierName: Record<string, string> | null;
  packetKey: string | null;
  express: boolean;
  shippingFee: number;
  total: number;
  confirmedAt: string;
  statusUpdatedAt: string;
  integrityToken: string | null;
  billingSameAsShipping: boolean;
  billingRecipientName: string | null;
  billingCompanyName: string | null;
  customerType: 'particulier' | 'entreprise';
  billingLine1: string;
  billingLine2: string | null;
  billingPostalCode: string;
  billingCity: string;
  billingCountryCode: string;
  billingPhone: string | null;
  items: {
    id: string;
    productUid: string;
    productType: 'nail' | 'accessory';
    title: Record<string, string>;
    shapeKey: string;
    size: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    origin: 'user' | 'rule';
  }[];
}

interface OrderVocabulary {
  /** A shape entry carries its own translated title plus its lengths — see
   * catalog source's data-common.json. The archived order only names the
   * shape, so only `title` is read here. */
  shapes: Record<string, { title: Record<string, string>; length?: Record<string, unknown> }>;
}

interface ShippingPacket {
  weight: number;
  size: { length: number; width: number; depth: number };
}

interface ArchivedOrder {
  order: {
    id: string;
    number: string;
    status: Status;
    confirmedAt: string;
    statusUpdatedAt: string;
    /** Integrity certificate for this order's frozen content — see
     * computeOrderContentHash/formatIntegrityToken in orders.service.ts.
     * Null only for orders confirmed before that column existed. */
    hash: string | null;
    /** Derived from whichever address served as this order's billing
     * identity (facturation address if one was used, otherwise the
     * delivery address) — see orders.service.ts's priceCheckout. Feeds a
     * later VAT/TVA feature. */
    customerType: 'particulier' | 'entreprise';
  };
  user: AdminOrder['user'] & { id: string };
  destination: {
    recipient: { name: string | null; companyName: string | null; phone: string | null };
    address: {
      line1: string;
      line2: string | null;
      postalCode: string;
      city: string;
      countryCode: string;
    };
  };
  /** Billing address — same shape as `destination`, always present (mirrors
   * the delivery address when the customer chose "same as delivery"). */
  facturation: {
    recipient: { name: string | null; companyName: string | null; phone: string | null };
    address: {
      line1: string;
      line2: string | null;
      postalCode: string;
      city: string;
      countryCode: string;
    };
  };
  delivery: {
    courier: { code: string | null; name: string | null };
    packet: { key: string | null; express: boolean };
    networkCode: string | null;
    pickupPoint: AdminOrder['pickupPoint'];
  };
  amounts: { items: number; shipping: number; total: number };
  items: {
    id: string;
    product: { productUid: string; title: string; shape: string; size: string };
    quantity: number;
    pricing: { unitPrice: number; lineTotal: number };
  }[];
}

function isStatus(value: string | undefined): value is Status {
  return !!value && (STATUSES as readonly string[]).includes(value);
}

const program = new Program();
program
  .name('order')
  .description('OPS_TOKEN-gated local order archive, mirrored into order/<status>/<orderNumber>.json.');
const fail: (message: string) => never = makeFail(program, 'order');

function parseStatusList(value: string | undefined): Status[] {
  if (value === undefined) return [...STATUSES];
  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length === 0) fail('--status must contain at least one comma-separated status.');

  const result: Status[] = [];
  for (const entry of values) {
    if (!isStatus(entry)) fail(`unknown status "${entry}" — must be one of ${STATUSES.join(', ')}.`);
    if (!result.includes(entry)) result.push(entry);
  }
  return result;
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
    const error =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    const detail =
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
        ? `: ${(body as { message: string }).message}`
        : '';
    throw new Error(`${path} -> ${res.status} ${error}${detail}`);
  }
  return body;
}

async function apiFetchPdf(apiBaseUrl: string, opsToken: string, path: string): Promise<Buffer> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}${path}`, {
    headers: opsRequestHeaders(opsToken),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  const content = Buffer.from(await res.arrayBuffer());
  if (!content.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${path} did not return a PDF.`);
  return content;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function listOrderJsonFiles(status: Status): Promise<string[]> {
  try {
    const entries = await readdir(join(orderRoot, status), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function packetForOrder(order: AdminOrder): Promise<ShippingPacket> {
  const quantity = order.items
    .filter((item) => item.origin === 'user' && item.productType === 'nail')
    .reduce((total, item) => total + item.quantity, 0);
  let source: unknown;
  try {
    source = JSON.parse(await readFile(packetDataPath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Cannot read ${packetDataPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const entry =
    source && typeof source === 'object' && !Array.isArray(source)
      ? (source as Record<string, unknown>)[String(quantity)]
      : undefined;
  const packet = entry as
    { weight?: unknown; size?: { length?: unknown; width?: unknown; depth?: unknown } } | undefined;
  const values = [packet?.weight, packet?.size?.length, packet?.size?.width, packet?.size?.depth];
  if (!values.every((value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) {
    throw new Error(`data-packet.json needs a positive-integer weight and size for quantity ${quantity}.`);
  }
  return {
    weight: packet!.weight as number,
    size: {
      length: packet!.size!.length as number,
      width: packet!.size!.width as number,
      depth: packet!.size!.depth as number,
    },
  };
}

function localizedLabel(
  labels: Record<string, string> | null | undefined,
  language: Language,
  fallback: string | null,
): string | null {
  return labels?.[language] ?? labels?.fr ?? fallback;
}

function toArchivedOrder(
  order: AdminOrder,
  shapes: OrderVocabulary['shapes'],
  language: Language,
): ArchivedOrder {
  return {
    order: {
      id: order.id,
      number: order.orderNumber,
      status: order.status,
      confirmedAt: order.confirmedAt,
      statusUpdatedAt: order.statusUpdatedAt,
      hash: order.integrityToken,
      customerType: order.customerType,
    },
    user: { id: order.userId, ...order.user },
    destination: {
      recipient: { name: order.recipientName, companyName: order.companyName, phone: order.phone },
      address: {
        line1: order.line1,
        line2: order.line2,
        postalCode: order.postalCode,
        city: order.city,
        countryCode: order.countryCode,
      },
    },
    facturation: {
      recipient: {
        name: order.billingRecipientName,
        companyName: order.billingCompanyName,
        phone: order.billingPhone,
      },
      address: {
        line1: order.billingLine1,
        line2: order.billingLine2,
        postalCode: order.billingPostalCode,
        city: order.billingCity,
        countryCode: order.billingCountryCode,
      },
    },
    delivery: {
      courier: { code: order.courierCode, name: localizedLabel(order.courierName, language, null) },
      packet: { key: order.packetKey, express: order.express },
      networkCode: order.networkCode,
      pickupPoint: order.pickupPoint,
    },
    amounts: {
      items: order.items.reduce((total, item) => total + item.lineTotal, 0),
      shipping: order.shippingFee,
      total: order.total,
    },
    items: order.items.map((item) => ({
      id: item.id,
      product: {
        productUid: item.productUid,
        title: localizedLabel(item.title, language, item.productUid)!,
        shape: localizedLabel(shapes[item.shapeKey]?.title, language, item.shapeKey)!,
        size: item.size,
      },
      quantity: item.quantity,
      pricing: { unitPrice: item.unitPrice, lineTotal: item.lineTotal },
    })),
  };
}

async function writeOrder(
  order: AdminOrder,
  shapes: OrderVocabulary['shapes'],
  language: Language,
): Promise<'created' | 'updated' | 'unchanged'> {
  if (!ORDER_NUMBER_RE.test(order.orderNumber)) {
    throw new Error(`API returned an unsafe order number "${order.orderNumber}".`);
  }
  const dir = join(orderRoot, order.status);
  const path = join(dir, `${order.orderNumber}.json`);
  const next = JSON.stringify(toArchivedOrder(order, shapes, language), null, 2) + '\n';
  const previous = await readFileIfExists(path);
  if (previous === next) return 'unchanged';
  await mkdir(dir, { recursive: true });
  await writeFile(path, next, 'utf8');
  return previous === undefined ? 'created' : 'updated';
}

/** Full local mirror by default. A status-filtered run writes only selected
 * folders but still removes JSON files whose order has been deleted or moved
 * to another status, so one order can never remain in two status folders. */
interface ListSummary {
  language: Language;
  statuses: Status[];
  created: number;
  updated: number;
  unchanged: number;
  deletedStaleFiles: number;
}

/** showTable is false for the local-mirror refresh every state-changing
 * command (set-status/delete/delete-all) runs on itself afterward — that
 * refresh isn't the user's `seed`, so it shouldn't dump every order back at
 * them on top of that command's own one-line result. Only the actual `seed`
 * command passes true. */
async function runSeed(
  apiBaseUrl: string,
  opsToken: string,
  statuses: Status[],
  language: Language,
  json: boolean,
  showTable: boolean,
): Promise<ListSummary> {
  const [ordersResponse, vocabulary] = (await Promise.all([
    apiFetch(apiBaseUrl, opsToken, '/operation/orders'),
    apiFetch(apiBaseUrl, opsToken, '/operation/library-import/vocabulary'),
  ])) as [{ orders: AdminOrder[] }, OrderVocabulary];
  const { orders } = ordersResponse;
  const byNumber = new Map<string, AdminOrder>();
  for (const order of orders) {
    if (byNumber.has(order.orderNumber))
      throw new Error(`API returned duplicate order number "${order.orderNumber}".`);
    byNumber.set(order.orderNumber, order);
  }

  const selectedStatuses = new Set(statuses);
  const selectedOrders = orders.filter((order) => selectedStatuses.has(order.status));
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  const rows: {
    orderNumber: string;
    email: string | null;
    phone: string | null;
    status: Status;
    total: string;
    confirmedAt: string;
  }[] = [];

  await Promise.all(statuses.map((status) => mkdir(join(orderRoot, status), { recursive: true })));

  for (const order of selectedOrders) {
    const result = await writeOrder(order, vocabulary.shapes, language);
    if (result === 'created') created++;
    else if (result === 'updated') updated++;
    else unchanged++;
    rows.push({
      orderNumber: order.orderNumber,
      email: order.user.email,
      phone: order.phone,
      status: order.status,
      total: order.total.toFixed(2),
      confirmedAt: order.confirmedAt.slice(0, 10),
    });
  }

  for (const folderStatus of STATUSES) {
    for (const filename of await listOrderJsonFiles(folderStatus)) {
      const extension = filename.endsWith('.json') ? '.json' : filename.endsWith('.pdf') ? '.pdf' : undefined;
      if (!extension) continue;
      const orderNumber = filename.slice(0, -extension.length);
      if (!ORDER_NUMBER_RE.test(orderNumber)) continue;
      const current = byNumber.get(orderNumber);
      if (current && current.status === folderStatus) continue;
      await unlink(join(orderRoot, folderStatus, filename));
      deleted++;
    }
  }

  log(
    json,
    `[order] list language=${language}: ${created} created, ${updated} updated, ${unchanged} unchanged, ${deleted} stale files deleted.`,
  );
  if (showTable) {
    logTable(
      json,
      rows.sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt)),
    );
  }
  return { language, statuses, created, updated, unchanged, deletedStaleFiles: deleted };
}

interface SingleOrderMirror {
  orderNumber: string;
  result: 'created' | 'updated' | 'unchanged';
  movedFrom: Status | null;
}

/** Single-order counterpart to runSeed's full local-mirror sweep — used
 * after set-status, which already knows exactly which order changed and
 * which two folders (old/new status) are involved, so there is no reason
 * to re-fetch and re-diff every other order just to keep this one file in
 * sync. `previousStatus` comes from the order this caller already fetched
 * before the status PATCH, i.e. no extra API call. */
async function mirrorSingleOrder(
  order: AdminOrder,
  previousStatus: Status,
  shapes: OrderVocabulary['shapes'],
  language: Language,
): Promise<SingleOrderMirror> {
  const result = await writeOrder(order, shapes, language);
  let movedFrom: Status | null = null;
  if (previousStatus !== order.status) {
    try {
      await unlink(join(orderRoot, previousStatus, `${order.orderNumber}.json`));
      movedFrom = previousStatus;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  return { orderNumber: order.orderNumber, result, movedFrom };
}

async function runSetStatus(
  apiBaseUrl: string,
  opsToken: string,
  orderNumber: string,
  status: Status,
  language: Language,
  json: boolean,
  skipShippingLabel: boolean,
  phone: string | undefined,
  noPayment: boolean,
  bypassLockEdit: boolean,
): Promise<{ orderNumber: string; status: Status; sticker: string | null; mirror: SingleOrderMirror }> {
  const { orders } = (await apiFetch(apiBaseUrl, opsToken, '/operation/orders')) as { orders: AdminOrder[] };
  const order = orders.find((entry) => entry.orderNumber === orderNumber);
  if (!order) fail(`no order with order number "${orderNumber}".`);
  const previousStatus = order.status;

  const packet = status === 'to_send' && !skipShippingLabel ? await packetForOrder(order) : undefined;

  let result: { order: AdminOrder };
  try {
    result = (await apiFetch(apiBaseUrl, opsToken, `/operation/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(packet ? { packet } : {}),
        ...(skipShippingLabel ? { skipShippingLabel: true } : {}),
        ...(phone ? { phone } : {}),
        ...(noPayment ? { noPayment: true } : {}),
        ...(bypassLockEdit ? { bypassLockEdit: true } : {}),
      }),
    })) as { order: AdminOrder };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('order_revision_locked') || message.includes('order_revision_lock_stale')) {
      const detailMatch = message.match(/order_revision_lock(?:ed|_stale)(?::\s*(.*))?$/);
      const detail = detailMatch?.[1]?.trim();
      fail(
        detail
          ? `[order] refused: ${detail}`
          : `[order] refused: ${orderNumber} has a customer edit lock. Retry after the customer saves/closes, or pass --bypass-lock-edit after contacting them.`,
      );
    }
    if (message.includes('payment_capture_failed')) {
      const detailMatch = message.match(/payment_capture_failed(?::\s*(.*))?$/);
      const detail = detailMatch?.[1]?.trim();
      fail(
        detail
          ? `[order] refused: ${detail}`
          : `[order] refused: ${orderNumber} payment capture failed. Status left unchanged.`,
      );
    }
    throw error;
  }
  log(
    json,
    `[order] orderNumber=${JSON.stringify(result.order.orderNumber)} status=${JSON.stringify(result.order.status)}`,
  );
  const { shapes } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    '/operation/library-import/vocabulary',
  )) as OrderVocabulary;
  const mirror = await mirrorSingleOrder(result.order, previousStatus, shapes, language);
  log(
    json,
    `[order] mirror: ${mirror.orderNumber} ${mirror.result}${mirror.movedFrom ? ` (moved out of ${mirror.movedFrom})` : ''}.`,
  );
  let sticker: string | null = null;
  if (status === 'to_send' && !skipShippingLabel) {
    const stickerContent = await apiFetchPdf(apiBaseUrl, opsToken, `/operation/orders/${order.id}/sticker`);
    const path = join(orderRoot, 'to_send', `${result.order.orderNumber}.pdf`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, stickerContent);
    await wrapStickerOnA4(path);
    sticker = path;
    log(json, `[order] sticker=${path}`);
  } else if (status === 'to_send' && skipShippingLabel) {
    log(json, `[order] sticker=null (--skip-shipment-label: no carrier label was generated)`);
  }
  return { orderNumber: result.order.orderNumber, status: result.order.status, sticker, mirror };
}

/** The carrier gives us a 10×15 cm PDF. Keep that label at its native size,
 * but wrap it in A4 locally so ordinary office-printer dialogs handle it as
 * an A4 document rather than treating the PDF page as custom paper. */
async function wrapStickerOnA4(path: string): Promise<void> {
  const outputPath = `${path}.a4.pdf`;
  try {
    await execFileAsync('gs', [
      '-q',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=pdfwrite',
      '-sPAPERSIZE=a4',
      '-dFIXEDMEDIA',
      `-sOutputFile=${outputPath}`,
      path,
    ]);
    await rename(outputPath, path);
  } catch (error) {
    try {
      await unlink(outputPath);
    } catch (cleanupError) {
      if (!isNotFound(cleanupError)) throw cleanupError;
    }
    throw new Error(
      `Saved the carrier label, but could not wrap it in A4. Install Ghostscript (the "gs" command): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runSetTracking(
  apiBaseUrl: string,
  opsToken: string,
  orderNumber: string,
  trackingNumber: string,
  json: boolean,
): Promise<{ orderNumber: string; trackingNumber: string }> {
  const { orders } = (await apiFetch(apiBaseUrl, opsToken, '/operation/orders')) as { orders: AdminOrder[] };
  const order = orders.find((entry) => entry.orderNumber === orderNumber);
  if (!order) fail(`no order with order number "${orderNumber}".`);

  await apiFetch(apiBaseUrl, opsToken, `/operation/orders/${order.id}/tracking`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ trackingNumber }),
  });
  log(
    json,
    `[order] orderNumber=${JSON.stringify(orderNumber)} trackingNumber=${JSON.stringify(trackingNumber)}`,
  );
  return { orderNumber, trackingNumber };
}

/** Removes one order's JSON wherever it currently lives — tried across
 * every status folder (a fixed, small set) rather than fetched-then-looked-
 * up, since the order is already gone from the DB by the time this runs and
 * there's nothing left to ask which folder it was in. ENOENT on the folders
 * it wasn't in is expected, not an error. */
async function removeOrderFiles(orderNumber: string): Promise<number> {
  let deleted = 0;
  for (const status of STATUSES) {
    try {
      await unlink(join(orderRoot, status, `${orderNumber}.json`));
      deleted++;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  return deleted;
}

/** delete-all counterpart to removeOrderFiles above — every order is gone,
 * so every local JSON file is stale by definition; no need to re-fetch the
 * (now empty) order list or vocabulary just to conclude that. */
async function wipeOrderMirror(): Promise<number> {
  let deleted = 0;
  for (const status of STATUSES) {
    for (const filename of await listOrderJsonFiles(status)) {
      const orderNumber = filename.slice(0, -'.json'.length);
      if (!ORDER_NUMBER_RE.test(orderNumber)) continue;
      await unlink(join(orderRoot, status, filename));
      deleted++;
    }
  }
  return deleted;
}

async function runDelete(
  apiBaseUrl: string,
  opsToken: string,
  orderNumber: string,
  json: boolean,
): Promise<{ deleted: boolean; orderNumber: string; mirror: { deletedFiles: number } }> {
  const result = (await apiFetch(
    apiBaseUrl,
    opsToken,
    `/operation/orders/${encodeURIComponent(orderNumber)}`,
    { method: 'DELETE' },
  )) as { deleted: boolean; orderNumber: string };
  log(json, `[order] deleted=${result.deleted} orderNumber=${JSON.stringify(result.orderNumber)}`);
  const deletedFiles = await removeOrderFiles(result.orderNumber);
  log(json, `[order] mirror: removed ${deletedFiles} local file(s) for ${result.orderNumber}.`);
  return { ...result, mirror: { deletedFiles } };
}

async function runDeleteAll(
  apiBaseUrl: string,
  opsToken: string,
  json: boolean,
): Promise<{ deletedCount: number; mirror: { deletedFiles: number } }> {
  const result = (await apiFetch(apiBaseUrl, opsToken, '/operation/orders', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  })) as { deletedCount: number };
  log(json, `[order] deleteAll=true deletedCount=${result.deletedCount}`);
  const deletedFiles = await wipeOrderMirror();
  log(json, `[order] mirror: removed ${deletedFiles} local file(s).`);
  return { ...result, mirror: { deletedFiles } };
}

async function runMain(args: Args): Promise<void> {
  const {
    command,
    statuses,
    orderNumber,
    nextStatus,
    trackingNumber,
    language,
    json,
    mode,
    skipShippingLabel,
    phone,
    noPayment,
    bypassLockEdit,
  } = args;
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${mode}/.public.env`);
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) fail(`OPS_TOKEN not found in .env/.private.env or .env/${mode}/.private.env`);

  log(json, `[order] command=${command} language=${language} mode=${mode} api=${apiBaseUrl}`);
  if (command === 'seed') {
    const summary = await runSeed(apiBaseUrl, opsToken, statuses, language, json, true);
    if (json) printJson({ command, ...summary });
  } else if (command === 'set-status') {
    const summary = await runSetStatus(
      apiBaseUrl,
      opsToken,
      orderNumber!,
      nextStatus!,
      language,
      json,
      skipShippingLabel,
      phone,
      noPayment,
      bypassLockEdit,
    );
    if (json) printJson({ command, ...summary });
  } else if (command === 'set-tracking') {
    const summary = await runSetTracking(apiBaseUrl, opsToken, orderNumber!, trackingNumber!, json);
    if (json) printJson({ command, ...summary });
  } else if (command === 'delete') {
    const summary = await runDelete(apiBaseUrl, opsToken, orderNumber!, json);
    if (json) printJson({ command, ...summary });
  } else {
    const summary = await runDeleteAll(apiBaseUrl, opsToken, json);
    if (json) printJson({ command, ...summary });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[order] failed', error);
    process.exitCode = 1;
  }
}

function baseArgs(command: Command, mode: Mode, json: boolean): Args {
  return {
    command,
    statuses: [...STATUSES],
    orderNumber: undefined,
    nextStatus: undefined,
    trackingNumber: undefined,
    confirm: false,
    language: 'fr',
    json,
    mode,
    skipShippingLabel: false,
    phone: undefined,
    noPayment: false,
    bypassLockEdit: false,
  };
}

interface SeedOpts {
  mode: Mode;
  json?: boolean;
  status?: string;
  language: Language;
}

addCommonOptions(program.command('seed'))
  .description('Pull every order from the DB and mirror it into order/<status>/<orderNumber>.json.')
  .option('--status <list>', `comma-separated: ${STATUSES.join(', ')} (default: all)`)
  .addOption(
    new Option('--language <language>', 'label language').choices(LANGUAGES).default('fr' satisfies Language),
  )
  .action((opts: SeedOpts) =>
    runAction(async () => {
      await runMain({
        ...baseArgs('seed', opts.mode, Boolean(opts.json)),
        statuses: parseStatusList(opts.status),
        language: opts.language,
      });
    }),
  );

interface SetStatusOpts {
  mode: Mode;
  json?: boolean;
  skipShipmentLabel?: boolean;
  phone?: string;
  payment: boolean;
  bypassLockEdit?: boolean;
  confirm?: boolean;
}

addConfirmOption(addCommonOptions(program.command('set-status')))
  .description("Change an order's status.")
  .argument('<orderNumber>')
  .addArgument(new Argument('<status>', `one of: ${STATUSES.join(', ')}`).choices(STATUSES))
  .option(
    '--skip-shipment-label',
    'move to to_send without calling the carrier label API (only when status is to_send)',
  )
  .option(
    '--phone <phone>',
    'use this recipient phone number on the generated label (only when status is to_send)',
  )
  .option('--no-payment', 'skip payment capture (only when status is in_preparation)')
  .option('--bypass-lock-edit', "bypass the customer's edit lock")
  .action((orderNumber: string, status: Status, opts: SetStatusOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'set-status');
      const skipShippingLabel = Boolean(opts.skipShipmentLabel);
      const noPayment = !opts.payment;
      if (skipShippingLabel && status !== 'to_send')
        fail('--skip-shipment-label only applies when moving to to_send.');
      if (opts.phone && status !== 'to_send') fail('--phone only applies when moving to to_send.');
      if (opts.phone !== undefined && !opts.phone.trim()) fail('--phone must not be empty.');
      if (noPayment && status !== 'in_preparation')
        fail('--no-payment only applies when moving to in_preparation.');
      await runMain({
        ...baseArgs('set-status', opts.mode, Boolean(opts.json)),
        orderNumber,
        nextStatus: status,
        skipShippingLabel,
        phone: opts.phone,
        noPayment,
        bypassLockEdit: Boolean(opts.bypassLockEdit),
      });
    }),
  );

interface TargetOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addConfirmOption(addCommonOptions(program.command('set-tracking')))
  .description('Record (or correct) a carrier tracking reference by hand.')
  .argument('<orderNumber>')
  .argument('<trackingNumber>')
  .action((orderNumber: string, trackingNumber: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'set-tracking');
      await runMain({
        ...baseArgs('set-tracking', opts.mode, Boolean(opts.json)),
        orderNumber,
        trackingNumber,
      });
    }),
  );

addConfirmOption(addCommonOptions(program.command('delete')))
  .description('Delete an order from the DB and its local mirror file.')
  .argument('<orderNumber>')
  .action((orderNumber: string, opts: TargetOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      await runMain({ ...baseArgs('delete', opts.mode, Boolean(opts.json)), orderNumber });
    }),
  );

interface DeleteAllOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addConfirmOption(
  addCommonOptions(program.command('delete-all')),
  'required when targeting --prod — destroys every order in the target database',
)
  .description('Delete every order from the DB and wipe the local mirror. Destructive.')
  .action((opts: DeleteAllOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-all');
      await runMain({ ...baseArgs('delete-all', opts.mode, Boolean(opts.json)), confirm: true });
    }),
  );

program.parse();
