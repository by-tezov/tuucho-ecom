/** Voucher source/import command — deliberately follows `library` and
 * `courier`, while `init` is the one local authoring convenience.
 *
 *   npm run voucher -- init [--name <anything>] --quantity N --end YYYY-MM-DD|30d [--start YYYY-MM-DD] [--max-per-user N] [--min-buy euros] [--users <uuid> ...] <offer> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run voucher -- seed [<name>] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod [--source <path>]
 *   npm run voucher -- enable|disable <name> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run voucher -- delete <name> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run voucher -- delete-all [--confirm] [--json] --dev|--preprod|--prod
 *   npm run voucher -- check [--json] --dev|--preprod|--prod [--source <path>]
 *
 * --confirm is required on init/seed (unless --direction local, which only
 * reads the target DB)/enable/disable/delete/delete-all, only when targeting --prod —
 * never for --dev/--preprod. `check` is read-only and never needs it.
 *
 * `init` creates both the manager JSON and the selected target DB row. With
 * no --name it generates an ABC-123 code; a supplied name is left as-is
 * (apart from whitespace at its edges), so vouchers are not limited to that
 * generated format. --json (all commands): prints one JSON object to stdout
 * instead of the human-readable lines, moving every other line to stderr —
 * safe to pipe into `jq`, a file, or another script. */
import { Command as Program, Option } from 'commander';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultSource = join(root, '..', 'pamsurin-manager', 'voucher');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_RE = /^(\d+)d$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPE_FILE = 'data-type.json';
const OFFER_TYPES = ['percent', 'amount', 'free_shipping', 'free_item', 'free_item_nth'] as const;
const LANGUAGES = ['fr', 'en', 'th', 'es', 'it', 'nl', 'pt'] as const;

type Offer =
  | { type: 'percent'; percent: number }
  | { type: 'amount'; amount: number }
  | { type: 'free_shipping' }
  | { type: 'free_item'; maxItemPrice: number }
  | { type: 'free_item_nth'; requiredItemQuantity: number };
type VoucherOfferType = (typeof OFFER_TYPES)[number];
type VoucherTypeLabels = Record<VoucherOfferType, Record<(typeof LANGUAGES)[number], string>>;
interface VoucherUsage {
  redeemedQuantity: number;
  heldQuantity: number;
  remainingQuantity: number;
  redemptions: { userId: string | null; email: string; orderNumber: string; redeemedAt: string }[];
}
interface Voucher {
  code: string;
  enabled: boolean;
  quantity: number;
  /** Omitted in older source files defaults to 1 on import. */
  maxUsesPerUser?: number;
  /** Minimum merchandise subtotal (amount / free-shipping only). */
  minSubtotal?: number;
  startsAt: string;
  endsAt: string;
  /** Omitted/empty means the voucher is available to every customer. */
  allowedUserIds?: string[];
  offer: Offer;
  /** Generated only by `seed --direction local`; never imported as an
   * offer definition. It keeps the private operational ledger next to the
   * voucher it concerns. */
  usage?: VoucherUsage;
}
type Command = 'init' | 'seed' | 'enable' | 'disable' | 'delete' | 'delete-all' | 'check';
type Direction = 'remote' | 'local';
interface Args {
  command: Command;
  target?: string;
  source: string;
  mode?: string;
  direction: Direction;
  update: boolean;
  deleteMissing: boolean;
  confirm: boolean;
  json: boolean;
  quantity?: number;
  startsAt?: string;
  endsAt?: string;
  allowedUserIds?: string[];
  offer?: Offer;
  maxUsesPerUser?: number;
  minSubtotal?: number;
}

const program = new Program();
program.name('voucher').description('Voucher source/import command, following the library/courier pattern.');
const fail: (message: string) => never = makeFail(program, 'voucher');

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value: string | undefined): value is string {
  return !!value && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function sourceName(value: string): string {
  const name = value.trim();
  if (!name || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    fail('--name / voucher name must not be empty or contain a path separator.');
  }
  return name;
}

function positiveInteger(value: string | undefined, flag: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) fail(`${flag} must be a positive integer.`);
  return number;
}

function positiveNumber(value: string | undefined, flag: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${flag} must be a positive number.`);
  return number;
}

function nonNegativeInteger(value: string | undefined, flag: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    fail(`${flag} must be a non-negative integer (0 = unlimited).`);
  return number;
}

function normalizeUserIds(values: string[], flag: string): string[] {
  const ids = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 0) fail(`${flag} requires at least one user UUID.`);
  if (!ids.every((id) => UUID_RE.test(id))) fail(`${flag} accepts UUID user IDs only.`);
  const normalized = ids.map((id) => id.toLowerCase()).sort();
  if (new Set(normalized).size !== normalized.length)
    fail(`${flag} must not contain the same user ID twice.`);
  return normalized;
}

function resolveEnd(value: string | undefined, startsAt: string): string {
  if (!value) fail('init requires --end as YYYY-MM-DD or a duration such as 30d.');
  if (validDate(value)) return value;
  const days = DURATION_RE.exec(value)?.[1];
  if (!days) fail('--end must be YYYY-MM-DD or a duration such as 30d.');
  const end = new Date(`${startsAt}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + Number(days));
  return end.toISOString().slice(0, 10);
}

/** commander has no notion of a single option consuming multiple following
 * space-separated values (only variadic *positional* arguments support
 * that) — so --users (space- or comma-separated UUIDs, stopping at the next
 * --flag) is pulled out of argv by hand before program.parse() ever sees
 * it, same consumption rule as the original hand-rolled loop. */
function extractUsersFlag(argv: string[]): { rest: string[]; rawUsers: string[] | undefined } {
  const idx = argv.indexOf('--users');
  if (idx === -1) return { rest: argv, rawUsers: undefined };
  const rawUsers: string[] = [];
  let end = idx + 1;
  while (end < argv.length && !argv[end]!.startsWith('--')) {
    rawUsers.push(argv[end]!);
    end += 1;
  }
  return { rest: [...argv.slice(0, idx), ...argv.slice(end)], rawUsers };
}

function filePath(source: string, code: string): string {
  return join(source, `${sourceName(code)}.json`);
}

function assertVoucher(value: unknown, path: string): Voucher {
  const voucher = value as Partial<Voucher>;
  if (
    !voucher ||
    typeof voucher !== 'object' ||
    typeof voucher.code !== 'string' ||
    !voucher.code.trim() ||
    typeof voucher.quantity !== 'number' ||
    !Number.isSafeInteger(voucher.quantity) ||
    voucher.quantity <= 0 ||
    !validDate(voucher.startsAt) ||
    !validDate(voucher.endsAt) ||
    voucher.startsAt > voucher.endsAt ||
    !voucher.offer
  ) {
    fail(`${path} is not a valid voucher source file.`);
  }
  if (
    voucher.allowedUserIds !== undefined &&
    (!Array.isArray(voucher.allowedUserIds) ||
      !voucher.allowedUserIds.every((id) => typeof id === 'string' && UUID_RE.test(id)) ||
      new Set(voucher.allowedUserIds.map((id) => id.toLowerCase())).size !== voucher.allowedUserIds.length)
  ) {
    fail(`${path} has an invalid allowedUserIds list.`);
  }
  if (
    voucher.maxUsesPerUser !== undefined &&
    (!Number.isSafeInteger(voucher.maxUsesPerUser) || voucher.maxUsesPerUser < 0)
  ) {
    fail(`${path} has an invalid maxUsesPerUser value.`);
  }
  if (
    voucher.minSubtotal !== undefined &&
    (typeof voucher.minSubtotal !== 'number' ||
      !Number.isFinite(voucher.minSubtotal) ||
      voucher.minSubtotal <= 0)
  ) {
    fail(`${path} has an invalid minSubtotal value.`);
  }
  if (
    voucher.minSubtotal != null &&
    voucher.offer.type !== 'amount' &&
    voucher.offer.type !== 'free_shipping'
  ) {
    fail(`${path}: minSubtotal is allowed only for amount and free_shipping offers.`);
  }
  return {
    ...voucher,
    code: sourceName(voucher.code),
    enabled: voucher.enabled !== false,
    ...(voucher.maxUsesPerUser !== undefined ? { maxUsesPerUser: voucher.maxUsesPerUser } : {}),
    ...(voucher.minSubtotal !== undefined ? { minSubtotal: voucher.minSubtotal } : {}),
    ...(voucher.allowedUserIds !== undefined
      ? { allowedUserIds: voucher.allowedUserIds.map((id) => id.toLowerCase()).sort() }
      : {}),
  } as Voucher;
}

async function readVoucher(source: string, code: string): Promise<Voucher> {
  const path = filePath(source, code);
  if (!existsSync(path)) fail(`No local voucher file named "${code}".`);
  return assertVoucher(JSON.parse(await readFile(path, 'utf8')), path);
}

async function writeVoucher(source: string, voucher: Voucher): Promise<void> {
  await mkdir(source, { recursive: true });
  await writeFile(filePath(source, voucher.code), `${JSON.stringify(voucher, null, 2)}\n`, 'utf8');
}

async function localVouchers(source: string): Promise<Voucher[]> {
  if (!existsSync(source)) return [];
  const files = (await readdir(source)).filter(
    (file) => file.endsWith('.json') && file !== 'usage.json' && file !== TYPE_FILE,
  );
  const vouchers = await Promise.all(files.map((file) => readVoucher(source, file.slice(0, -5))));
  const names = new Set<string>();
  for (const voucher of vouchers) {
    const key = voucher.code.toLocaleLowerCase();
    if (names.has(key)) fail(`Duplicate local voucher name (case-insensitive): "${voucher.code}".`);
    names.add(key);
  }
  return vouchers;
}

function assertVoucherTypeLabels(value: unknown, path: string): VoucherTypeLabels {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${path} is not a valid voucher type map.`);
  const labels = value as Record<string, unknown>;
  if (Object.keys(labels).length !== OFFER_TYPES.length || !OFFER_TYPES.every((type) => type in labels)) {
    fail(`${path} must contain exactly: ${OFFER_TYPES.join(', ')}.`);
  }
  const result = {} as VoucherTypeLabels;
  for (const type of OFFER_TYPES) {
    const template = labels[type];
    if (!template || typeof template !== 'object' || Array.isArray(template)) {
      fail(`${path}: ${type} must be an object with every language.`);
    }
    const translations = template as Record<string, unknown>;
    if (
      !LANGUAGES.every(
        (language) => typeof translations[language] === 'string' && translations[language].trim(),
      )
    ) {
      fail(`${path}: ${type} must define a non-empty value for every language.`);
    }
    result[type] = Object.fromEntries(
      LANGUAGES.map((language) => [language, (translations[language] as string).trim()]),
    ) as VoucherTypeLabels[VoucherOfferType];
  }
  return result;
}

async function readVoucherTypeLabels(source: string): Promise<VoucherTypeLabels> {
  const path = join(source, TYPE_FILE);
  if (!existsSync(path)) fail(`Missing ${TYPE_FILE} in ${source}.`);
  return assertVoucherTypeLabels(JSON.parse(await readFile(path, 'utf8')), path);
}

function sameVoucherTypeLabels(a: VoucherTypeLabels, b: VoucherTypeLabels): boolean {
  // JSONB is allowed to return object keys in a different order from the
  // manager JSON. Compare the defined vocabulary explicitly, never its
  // serialization order.
  return OFFER_TYPES.every((type) => LANGUAGES.every((language) => a[type][language] === b[type][language]));
}

function voucherEquals(a: Voucher | undefined, b: Voucher | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.enabled === b.enabled &&
    a.quantity === b.quantity &&
    (a.maxUsesPerUser ?? 1) === (b.maxUsesPerUser ?? 1) &&
    Number(a.minSubtotal ?? 0) === Number(b.minSubtotal ?? 0) &&
    a.startsAt === b.startsAt &&
    a.endsAt === b.endsAt &&
    JSON.stringify(a.allowedUserIds ?? []) === JSON.stringify(b.allowedUserIds ?? []) &&
    JSON.stringify(a.offer) === JSON.stringify(b.offer)
  );
}

/** Operational usage is local-only metadata. Never send it to the import
 * API — voucher definitions remain the only manager data persisted there. */
function voucherDefinition(voucher: Voucher): Omit<Voucher, 'usage'> {
  const { usage: _usage, ...definition } = voucher;
  return definition;
}

function voucherDifferences(local: Voucher, remote: Voucher): string[] {
  const differences: string[] = [];
  if (local.enabled !== remote.enabled) differences.push('enabled');
  if (local.quantity !== remote.quantity) differences.push('quantity');
  if ((local.maxUsesPerUser ?? 1) !== (remote.maxUsesPerUser ?? 1)) differences.push('maxUsesPerUser');
  if (Number(local.minSubtotal ?? 0) !== Number(remote.minSubtotal ?? 0)) differences.push('minSubtotal');
  if (local.startsAt !== remote.startsAt) differences.push('startsAt');
  if (local.endsAt !== remote.endsAt) differences.push('endsAt');
  if (JSON.stringify(local.allowedUserIds ?? []) !== JSON.stringify(remote.allowedUserIds ?? [])) {
    differences.push('allowedUserIds');
  }
  if (JSON.stringify(local.offer) !== JSON.stringify(remote.offer)) differences.push('offer');
  return differences;
}

async function generatedCode(source: string, remoteNames: string[] = []): Promise<string> {
  const existing = new Set(
    [...(await localVouchers(source)).map((voucher) => voucher.code), ...remoteNames].map((name) =>
      name.toLocaleLowerCase(),
    ),
  );
  for (let tries = 0; tries < 1000; tries += 1) {
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join('');
    const name = `${letters}-${String(randomInt(1000)).padStart(3, '0')}`;
    if (!existing.has(name.toLocaleLowerCase())) return name;
  }
  fail('Unable to generate a unique voucher name.');
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...opsRequestHeaders(opsToken), ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : response.statusText;
    throw new Error(`${path} -> ${response.status} ${error}`);
  }
  return body;
}

function isRedeemedVoucherDeleteError(error: unknown): boolean {
  return error instanceof Error && /\b409\b.*redeemed voucher/i.test(error.message);
}

function remote(mode: string) {
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  const opsToken = loadOpsToken(root, mode);
  if (!apiBaseUrl || !opsToken) fail(`URL_API_BASE or OPS_TOKEN is missing for ${mode}.`);
  return { apiBaseUrl, opsToken };
}

async function remoteVouchers(apiBaseUrl: string, opsToken: string): Promise<Voucher[]> {
  const response = (await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers')) as {
    vouchers: (Voucher & { redeemedQuantity: number; heldQuantity: number; remainingQuantity: number })[];
  };
  return response.vouchers.map(
    ({ code, enabled, quantity, maxUsesPerUser, minSubtotal, startsAt, endsAt, allowedUserIds, offer }) => ({
      code,
      enabled,
      quantity,
      ...(maxUsesPerUser !== undefined ? { maxUsesPerUser } : {}),
      ...(minSubtotal != null ? { minSubtotal } : {}),
      startsAt,
      endsAt,
      ...(allowedUserIds?.length ? { allowedUserIds } : {}),
      offer,
    }),
  );
}

async function writeVoucherUsage(source: string, apiBaseUrl: string, opsToken: string): Promise<number> {
  const report = (await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers')) as {
    vouchers: (Voucher & {
      redeemedQuantity: number;
      heldQuantity: number;
      remainingQuantity: number;
    })[];
    redemptions: {
      voucher_code: string;
      user_id: string | null;
      email: string;
      order_number: string;
      redeemed_at: string;
    }[];
  };
  const redemptionsByCode = new Map<string, VoucherUsage['redemptions']>();
  for (const redemption of report.redemptions) {
    const key = redemption.voucher_code.toLocaleLowerCase();
    const entries = redemptionsByCode.get(key) ?? [];
    entries.push({
      userId: redemption.user_id,
      email: redemption.email,
      orderNumber: redemption.order_number,
      redeemedAt: redemption.redeemed_at,
    });
    redemptionsByCode.set(key, entries);
  }

  let written = 0;
  const localByCode = new Map(
    (await localVouchers(source)).map((voucher) => [voucher.code.toLocaleLowerCase(), voucher]),
  );
  for (const remoteVoucher of report.vouchers) {
    const localVoucher = localByCode.get(remoteVoucher.code.toLocaleLowerCase());
    if (!localVoucher) continue;
    await writeVoucher(source, {
      ...localVoucher,
      usage: {
        redeemedQuantity: remoteVoucher.redeemedQuantity,
        heldQuantity: remoteVoucher.heldQuantity,
        remainingQuantity: remoteVoucher.remainingQuantity,
        redemptions: redemptionsByCode.get(remoteVoucher.code.toLocaleLowerCase()) ?? [],
      },
    });
    written++;
  }
  return written;
}

async function remoteVoucherTypeLabels(
  apiBaseUrl: string,
  opsToken: string,
): Promise<VoucherTypeLabels | undefined> {
  const response = (await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/types')) as {
    types: VoucherTypeLabels;
  };
  if (!response.types || Object.keys(response.types).length === 0) return undefined;
  return assertVoucherTypeLabels(response.types, 'remote voucher type map');
}

async function pushVoucherTypeLabels(
  apiBaseUrl: string,
  opsToken: string,
  labels: VoucherTypeLabels,
): Promise<void> {
  await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/types', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ types: labels }),
  });
}

async function runMain(args: Args): Promise<void> {
  const json = args.json;
  const { apiBaseUrl, opsToken } = remote(args.mode!);
  log(json, `[voucher] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);
  if (args.command === 'init') {
    const labels = await readVoucherTypeLabels(args.source);
    const local = await localVouchers(args.source);
    const remoteList = await remoteVouchers(apiBaseUrl, opsToken);
    const remoteTypeLabels = await remoteVoucherTypeLabels(apiBaseUrl, opsToken);
    const code =
      args.target ??
      (await generatedCode(
        args.source,
        remoteList.map((voucher) => voucher.code),
      ));
    const exists = [...local, ...remoteList].some(
      (voucher) => voucher.code.localeCompare(code, undefined, { sensitivity: 'accent' }) === 0,
    );
    if (exists) fail(`A voucher named "${code}" already exists locally or in ${args.mode}.`);
    const voucher: Voucher = {
      code,
      enabled: true,
      quantity: args.quantity!,
      maxUsesPerUser: args.maxUsesPerUser ?? 1,
      ...(args.minSubtotal != null ? { minSubtotal: args.minSubtotal } : {}),
      startsAt: args.startsAt!,
      endsAt: args.endsAt!,
      ...(args.allowedUserIds ? { allowedUserIds: args.allowedUserIds } : {}),
      offer: args.offer!,
    };
    if (!remoteTypeLabels) await pushVoucherTypeLabels(apiBaseUrl, opsToken, labels);
    else if (!sameVoucherTypeLabels(labels, remoteTypeLabels)) {
      fail(`${TYPE_FILE} differs from ${args.mode}; run voucher seed --update first.`);
    }
    await writeVoucher(args.source, voucher);
    try {
      const result = (await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...voucherDefinition(voucher), update: false }),
      })) as { created?: boolean };
      // A competing init may have created this case-insensitive name between
      // our preflight check and POST. Do not silently leave a different
      // remote voucher behind while claiming this local JSON was initialized.
      if (!result.created) throw new Error(`Voucher "${code}" already exists on ${args.mode}.`);
    } catch (error) {
      await unlink(filePath(args.source, voucher.code)).catch(() => undefined);
      throw error;
    }
    log(json, `[voucher] initialized ${code} locally and on ${args.mode}.`);
    if (json) printJson({ command: 'init', code, mode: args.mode });
    return;
  }

  const { postOperatorActivity } = await import('./postOperatorActivity.js');

  if (args.command === 'delete') {
    await apiFetch(
      apiBaseUrl,
      opsToken,
      `/operation/voucher-import/vouchers/${encodeURIComponent(args.target!)}`,
      { method: 'DELETE' },
    );
    log(json, `[voucher] deleted remote voucher ${args.target}.`);
    if (json) printJson({ command: 'delete', deleted: true, code: args.target });
    await postOperatorActivity(root, args.mode as Mode, {
      category: 'promotions',
      action: 'voucher.delete',
      summary: `Suppression voucher: ${args.target}`,
      targetType: 'voucher',
      targetId: args.target!,
    });
    return;
  }
  if (args.command === 'enable' || args.command === 'disable') {
    const enabled = args.command === 'enable';
    const remoteList = await remoteVouchers(apiBaseUrl, opsToken);
    const voucher = remoteList.find(
      (entry) => entry.code.toLocaleLowerCase() === args.target!.toLocaleLowerCase(),
    );
    if (!voucher) fail(`No remote voucher named "${args.target}".`);
    const changed = voucher.enabled !== enabled;
    if (changed) {
      await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...voucherDefinition({ ...voucher, enabled }), update: true }),
      });
    }
    log(json, `[voucher] ${enabled ? 'enabled' : 'disabled'} remote voucher ${voucher.code}.`);
    if (json)
      printJson({ command: args.command, code: voucher.code, enabled, changed });
    await postOperatorActivity(root, args.mode as Mode, {
      category: 'promotions',
      action: enabled ? 'voucher.enable' : 'voucher.disable',
      summary: changed
        ? `${enabled ? 'Activation' : 'Desactivation'} voucher: ${voucher.code}`
        : `${enabled ? 'Activation' : 'Desactivation'} voucher: ${voucher.code} (aucun changement)`,
      targetType: 'voucher',
      targetId: voucher.code,
      detail: { enabled, changed },
    });
    return;
  }
  if (args.command === 'delete-all') {
    await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers', { method: 'DELETE' });
    log(json, '[voucher] deleted every remote voucher.');
    if (json) printJson({ command: 'delete-all', deleted: true });
    await postOperatorActivity(root, args.mode as Mode, {
      category: 'promotions',
      action: 'voucher.delete_all',
      summary: 'Suppression complete des vouchers',
    });
    return;
  }
  const local = await localVouchers(args.source);
  const remoteList = await remoteVouchers(apiBaseUrl, opsToken);
  const localTypeLabels = await readVoucherTypeLabels(args.source);
  const remoteTypeLabels = await remoteVoucherTypeLabels(apiBaseUrl, opsToken);
  if (args.command === 'check') {
    const byRemote = new Map(remoteList.map((voucher) => [voucher.code.toLocaleLowerCase(), voucher]));
    log(json, `[voucher] check: ${local.length} local, ${remoteList.length} in DB.`);

    let matched = 0;
    const mismatched: { code: string; differences: string[] }[] = [];
    const notImported: string[] = [];
    const orphaned: string[] = [];
    const rows: { status: string; code: string; differences: string }[] = [];
    for (const voucher of local) {
      const remoteVoucher = byRemote.get(voucher.code.toLocaleLowerCase());
      if (!remoteVoucher) {
        notImported.push(voucher.code);
        rows.push({ status: 'NOT IMPORTED', code: voucher.code, differences: '' });
        continue;
      }
      const differences = voucherDifferences(voucher, remoteVoucher);
      if (differences.length > 0) {
        mismatched.push({ code: voucher.code, differences });
        rows.push({ status: 'DIFFERS', code: voucher.code, differences: differences.join(', ') });
      } else {
        matched++;
      }
    }
    for (const voucher of remoteList) {
      if (!local.some((entry) => entry.code.toLocaleLowerCase() === voucher.code.toLocaleLowerCase())) {
        orphaned.push(voucher.code);
        rows.push({ status: 'ORPHANED', code: voucher.code, differences: '' });
      }
    }
    const typeDiffers = !remoteTypeLabels || !sameVoucherTypeLabels(localTypeLabels, remoteTypeLabels);
    log(
      json,
      `[voucher] check done: ${matched} match, ${mismatched.length} differ, ${notImported.length} not imported, ${orphaned.length} orphaned in DB.`,
    );
    logTable(json, rows);
    log(json, `[voucher] type check: ${typeDiffers ? 1 : 0} differ.`);
    if (json) {
      printJson({
        command: 'check',
        localCount: local.length,
        dbCount: remoteList.length,
        matched,
        mismatched,
        notImported,
        orphaned,
        typeLabelsDiffer: typeDiffers,
      });
    }
    return;
  }
  if (args.direction === 'remote') {
    let typeLabels: 'created' | 'unchanged' | 'updated' | 'differs';
    if (!remoteTypeLabels) {
      await pushVoucherTypeLabels(apiBaseUrl, opsToken, localTypeLabels);
      typeLabels = 'created';
      log(json, `[voucher] created ${TYPE_FILE}.`);
    } else if (sameVoucherTypeLabels(localTypeLabels, remoteTypeLabels)) {
      typeLabels = 'unchanged';
      log(json, `[voucher] ${TYPE_FILE} unchanged.`);
    } else if (args.update) {
      await pushVoucherTypeLabels(apiBaseUrl, opsToken, localTypeLabels);
      typeLabels = 'updated';
      log(json, `[voucher] updated ${TYPE_FILE}.`);
    } else {
      typeLabels = 'differs';
      log(json, `[voucher] ${TYPE_FILE} differs (rerun with --update).`);
    }
    const selected = args.target
      ? local.filter((voucher) => voucher.code.toLocaleLowerCase() === args.target!.toLocaleLowerCase())
      : local;
    if (args.target && selected.length === 0) fail(`No local voucher file named "${args.target}".`);
    const remoteByCode = new Map(remoteList.map((voucher) => [voucher.code.toLocaleLowerCase(), voucher]));
    const created: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];
    const pending: string[] = [];
    const rows: { code: string; result: string }[] = [];
    for (const voucher of selected) {
      const existing = remoteByCode.get(voucher.code.toLocaleLowerCase());
      if (existing && voucherEquals(voucher, existing)) {
        unchanged.push(voucher.code);
        rows.push({ code: voucher.code, result: 'unchanged' });
        continue;
      }
      if (existing && !args.update) {
        pending.push(voucher.code);
        rows.push({ code: voucher.code, result: 'differs (rerun with --update)' });
        continue;
      }
      await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...voucherDefinition(voucher), update: !!existing && args.update }),
      });
      (existing ? updated : created).push(voucher.code);
      rows.push({ code: voucher.code, result: existing ? 'updated' : 'created' });
    }
    const deletedRemoteOnly: string[] = [];
    const disabledRedeemedRemoteOnly: string[] = [];
    if (args.deleteMissing) {
      const localCodes = new Set(local.map((voucher) => voucher.code.toLocaleLowerCase()));
      for (const voucher of remoteList) {
        if (!localCodes.has(voucher.code.toLocaleLowerCase())) {
          try {
            await apiFetch(
              apiBaseUrl,
              opsToken,
              `/operation/voucher-import/vouchers/${encodeURIComponent(voucher.code)}`,
              { method: 'DELETE' },
            );
            deletedRemoteOnly.push(voucher.code);
            rows.push({ code: voucher.code, result: 'deleted (remote-only)' });
          } catch (error) {
            if (!isRedeemedVoucherDeleteError(error)) throw error;
            if (voucher.enabled) {
              await apiFetch(apiBaseUrl, opsToken, '/operation/voucher-import/vouchers', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ ...voucherDefinition({ ...voucher, enabled: false }), update: true }),
              });
            }
            disabledRedeemedRemoteOnly.push(voucher.code);
            rows.push({ code: voucher.code, result: 'disabled (redeemed remote-only)' });
          }
        }
      }
    }
    log(
      json,
      `[voucher] seed done: ${created.length} created, ${updated.length} updated, ${unchanged.length} unchanged, ${pending.length} pending, ${deletedRemoteOnly.length} deleted, ${disabledRedeemedRemoteOnly.length} redeemed remote-only disabled.`,
    );
    logTable(json, rows);
    if (json) {
      printJson({
        command: 'seed',
        direction: 'remote',
        typeLabels,
        created,
        updated,
        unchanged,
        pending,
        deletedRemoteOnly,
        disabledRedeemedRemoteOnly,
      });
    }
    const changed =
      created.length +
      updated.length +
      deletedRemoteOnly.length +
      disabledRedeemedRemoteOnly.length +
      (typeLabels === 'created' || typeLabels === 'updated' ? 1 : 0);
    await postOperatorActivity(root, args.mode as Mode, {
      category: 'promotions',
      action: 'voucher.seed',
      summary:
        changed === 0
          ? 'Import vouchers: aucun changement'
          : `Import vouchers: ${created.length} crees, ${updated.length} mis a jour, ${unchanged.length} inchanges`,
      detail: {
        direction: 'remote',
        update: args.update,
        deleteMissing: args.deleteMissing,
        target: args.target ?? null,
        typeLabels,
        created: created.length,
        updated: updated.length,
        unchanged: unchanged.length,
        pending: pending.length,
        deletedRemoteOnly: deletedRemoteOnly.length,
        disabledRedeemedRemoteOnly: disabledRedeemedRemoteOnly.length,
      },
      targets: [...created, ...updated, ...deletedRemoteOnly],
    });
    return;
  }
  let typeLabelsLocal: 'pulled' | 'unchanged' | 'differs' = 'unchanged';
  if (!remoteTypeLabels || !sameVoucherTypeLabels(localTypeLabels, remoteTypeLabels)) {
    if (args.update) {
      if (!remoteTypeLabels) fail(`The DB has no ${TYPE_FILE} to pull.`);
      await writeFile(join(args.source, TYPE_FILE), `${JSON.stringify(remoteTypeLabels, null, 2)}\n`, 'utf8');
      typeLabelsLocal = 'pulled';
      log(json, `[voucher] ${TYPE_FILE}: pulled from the DB.`);
    } else {
      typeLabelsLocal = 'differs';
      log(json, `[voucher] ${TYPE_FILE}: differs from the DB — rerun with --update to pull.`);
    }
  }
  const localByCode = new Map(local.map((voucher) => [voucher.code.toLocaleLowerCase(), voucher]));
  const selected = args.target
    ? remoteList.filter((voucher) => voucher.code.toLocaleLowerCase() === args.target!.toLocaleLowerCase())
    : remoteList;
  if (args.target && selected.length === 0) fail(`No remote voucher named "${args.target}".`);
  const pulled: string[] = [];
  const pending: string[] = [];
  const rows: { code: string; result: string }[] = [];
  for (const voucher of selected) {
    if (!localByCode.has(voucher.code.toLocaleLowerCase()) || args.update) {
      await writeVoucher(args.source, voucher);
      pulled.push(voucher.code);
      rows.push({ code: voucher.code, result: 'pulled' });
    } else if (!voucherEquals(localByCode.get(voucher.code.toLocaleLowerCase()), voucher)) {
      pending.push(voucher.code);
      rows.push({ code: voucher.code, result: 'differs (rerun with --update)' });
    }
  }
  const deletedLocalOnly: string[] = [];
  if (args.deleteMissing) {
    const remoteCodes = new Set(remoteList.map((voucher) => voucher.code.toLocaleLowerCase()));
    for (const voucher of local)
      if (!remoteCodes.has(voucher.code.toLocaleLowerCase())) {
        await unlink(filePath(args.source, voucher.code));
        deletedLocalOnly.push(voucher.code);
        rows.push({ code: voucher.code, result: 'deleted (local-only)' });
      }
  }
  const usageWritten = await writeVoucherUsage(args.source, apiBaseUrl, opsToken);
  log(
    json,
    `[voucher] pull done: ${pulled.length} pulled, ${pending.length} pending, ${deletedLocalOnly.length} deleted, usage written into ${usageWritten} file(s).`,
  );
  logTable(json, rows);
  if (json) {
    printJson({
      command: 'seed',
      direction: 'local',
      typeLabels: typeLabelsLocal,
      pulled,
      pending,
      deletedLocalOnly,
      usageWritten,
    });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[voucher] failed', error);
    process.exitCode = 1;
  }
}

function baseArgs(command: Command, mode: Mode, json: boolean, source: string): Args {
  return {
    command,
    target: undefined,
    source,
    mode,
    direction: 'remote',
    update: false,
    deleteMissing: false,
    confirm: false,
    json,
  };
}

function resolveTarget(name: string | undefined, positional: string | undefined): string | undefined {
  if (name !== undefined) return sourceName(name);
  if (positional !== undefined) return sourceName(positional);
  return undefined;
}

let rawUsersForInit: string[] | undefined;

interface InitOpts {
  mode: Mode;
  json?: boolean;
  name?: string;
  source?: string;
  quantity?: number;
  start?: string;
  end?: string;
  maxPerUser?: number;
  minBuy?: number;
  percent?: number;
  amount?: number;
  freeShipping?: boolean;
  freeItem?: number;
  freeItemNth?: number;
  confirm?: boolean;
}

addConfirmOption(addCommonOptions(program.command('init')))
  .description('Create both the manager JSON and the selected target DB row for a new voucher.')
  .argument('[name]', 'voucher name; omit to auto-generate an ABC-123 code')
  .option('--name <value>', 'voucher name (alternative to the positional form)')
  .option('--source <path>', `defaults to ${defaultSource}`)
  .option('--quantity <n>', 'positive integer', (v) => positiveInteger(v, '--quantity'))
  .option('--max-per-user <n>', 'per-customer cap (default 1; 0 = unlimited)', (v) =>
    nonNegativeInteger(v, '--max-per-user'),
  )
  .option('--min-buy <euros>', 'minimum merchandise subtotal (amount / free-shipping only)', (v) =>
    positiveNumber(v, '--min-buy'),
  )
  .option('--start <date>', 'YYYY-MM-DD, defaults to today')
  .option('--end <val>', 'YYYY-MM-DD (inclusive) or Nd days after --start, e.g. 30d')
  .option('--percent <n>', 'percent-off offer (0-100)', (v) => positiveNumber(v, '--percent'))
  .option('--amount <n>', 'fixed-amount-off offer', (v) => positiveNumber(v, '--amount'))
  .option('--free-shipping', 'free-shipping offer')
  .option('--free-item <euros>', 'one nail set free up to this price', (v) =>
    positiveNumber(v, '--free-item'),
  )
  .option('--free-item-nth <n>', 'buy n nail sets, get the lowest-priced extra nail set free', (v) =>
    positiveInteger(v, '--free-item-nth'),
  )
  .action((positionalName: string | undefined, opts: InitOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'init');
      const offerFlagCount = [
        opts.percent !== undefined,
        opts.amount !== undefined,
        Boolean(opts.freeShipping),
        opts.freeItem !== undefined,
        opts.freeItemNth !== undefined,
      ].filter(Boolean).length;
      if (offerFlagCount > 1) fail('Choose one offer type only.');
      let offer: Offer | undefined;
      if (opts.percent !== undefined) {
        if (opts.percent > 100) fail('--percent cannot exceed 100.');
        offer = { type: 'percent', percent: opts.percent };
      } else if (opts.amount !== undefined) offer = { type: 'amount', amount: opts.amount };
      else if (opts.freeShipping) offer = { type: 'free_shipping' };
      else if (opts.freeItem !== undefined) offer = { type: 'free_item', maxItemPrice: opts.freeItem };
      else if (opts.freeItemNth !== undefined) {
        offer = { type: 'free_item_nth', requiredItemQuantity: opts.freeItemNth };
      }

      const startsAt = opts.start ?? today();
      if (!validDate(startsAt)) fail('--start must be YYYY-MM-DD.');
      const endsAt = resolveEnd(opts.end, startsAt);
      if (endsAt < startsAt) fail('--end cannot precede --start.');
      if (!opts.quantity) fail('init requires --quantity <positive integer>.');
      if (opts.minBuy !== undefined && !opts.amount && !opts.freeShipping) {
        fail('--min-buy is allowed only with --amount or --free-shipping.');
      }
      if (!offer) {
        fail(
          'init requires exactly one offer type: --percent N, --amount euros, --free-shipping, --free-item euros, or --free-item-nth X.',
        );
      }
      const allowedUserIds =
        rawUsersForInit !== undefined ? normalizeUserIds(rawUsersForInit, '--users') : undefined;

      await runMain({
        ...baseArgs('init', opts.mode, Boolean(opts.json), opts.source ?? defaultSource),
        target: resolveTarget(opts.name, positionalName),
        quantity: opts.quantity,
        startsAt,
        endsAt,
        maxUsesPerUser: opts.maxPerUser ?? 1,
        ...(opts.minBuy !== undefined ? { minSubtotal: opts.minBuy } : {}),
        allowedUserIds,
        offer,
      });
    }),
  );

interface SeedOpts {
  mode: Mode;
  json?: boolean;
  source?: string;
  name?: string;
  update?: boolean;
  delete?: boolean;
  direction: Direction;
  confirm?: boolean;
}

addConfirmOption(addCommonOptions(program.command('seed')))
  .description(
    'Push local voucher JSON files to the DB (or pull DB vouchers into local files with --direction local).',
  )
  .argument('[name]', 'voucher name; omit to seed every local/remote voucher')
  .option('--name <value>', 'voucher name (alternative to the positional form)')
  .option('--source <path>', `defaults to ${defaultSource}`)
  .option('--update', 'update the destination in place when a voucher already exists and differs')
  .option('--delete', 'with a full seed --update, make the destination match the complete source')
  .addOption(
    new Option(
      '--direction <direction>',
      'remote pushes local files to the DB; local pulls DB vouchers into local files',
    )
      .choices(['remote', 'local'])
      .default('remote' satisfies Direction),
  )
  .action((positionalName: string | undefined, opts: SeedOpts) =>
    runAction(async () => {
      // --direction local only reads the target DB (writes local files) —
      // same "reading prod is fine" treatment as order/log's own read
      // commands. Only the DB-mutating remote direction needs --confirm.
      if (opts.direction !== 'local') requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      const target = resolveTarget(opts.name, positionalName);
      const deleteMissing = Boolean(opts.delete);
      const update = Boolean(opts.update);
      if (deleteMissing && !update) fail('--delete requires --update.');
      if (deleteMissing && target) fail('--delete requires seed without a target.');
      await runMain({
        ...baseArgs('seed', opts.mode, Boolean(opts.json), opts.source ?? defaultSource),
        target,
        update,
        deleteMissing,
        direction: opts.direction,
      });
    }),
  );

interface DeleteOpts {
  mode: Mode;
  json?: boolean;
  source?: string;
  name?: string;
  confirm?: boolean;
}

interface ToggleOpts {
  mode: Mode;
  json?: boolean;
  name?: string;
  confirm?: boolean;
}

function addToggleCommand(command: 'enable' | 'disable', enabled: boolean): void {
  addConfirmOption(addCommonOptions(program.command(command)))
    .description(`${enabled ? 'Enable' : 'Disable'} a voucher in the DB without changing its definition.`)
    .argument('[name]', 'voucher name (required unless given via --name)')
    .option('--name <value>', 'voucher name (alternative to the positional form)')
    .action((positionalName: string | undefined, opts: ToggleOpts) =>
      runAction(async () => {
        requireConfirmForProdWrite(opts.mode, opts.confirm, fail, command);
        const target = resolveTarget(opts.name, positionalName);
        if (!target) fail(`${command} requires a voucher name.`);
        await runMain({ ...baseArgs(command, opts.mode, Boolean(opts.json), defaultSource), target });
      }),
    );
}

addToggleCommand('enable', true);
addToggleCommand('disable', false);

addConfirmOption(addCommonOptions(program.command('delete')))
  .description('Delete a voucher from the DB.')
  .argument('[name]', 'voucher name (required unless given via --name)')
  .option('--name <value>', 'voucher name (alternative to the positional form)')
  .option('--source <path>', `defaults to ${defaultSource}`)
  .action((positionalName: string | undefined, opts: DeleteOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      const target = resolveTarget(opts.name, positionalName);
      if (!target) fail('delete requires a voucher name.');
      await runMain({
        ...baseArgs('delete', opts.mode, Boolean(opts.json), opts.source ?? defaultSource),
        target,
      });
    }),
  );

interface DeleteAllOpts {
  mode: Mode;
  json?: boolean;
  source?: string;
  confirm?: boolean;
}

addConfirmOption(
  addCommonOptions(program.command('delete-all')),
  'required when targeting --prod — destroys every voucher in the target database',
)
  .description('Delete every voucher from the DB. Destructive.')
  .option('--source <path>', `defaults to ${defaultSource}`)
  .action((opts: DeleteAllOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete-all');
      await runMain({
        ...baseArgs('delete-all', opts.mode, Boolean(opts.json), opts.source ?? defaultSource),
        confirm: true,
      });
    }),
  );

interface CheckOpts {
  mode: Mode;
  json?: boolean;
  source?: string;
}

addCommonOptions(program.command('check'))
  .description('Compare local voucher files against the DB without changing anything.')
  .option('--source <path>', `defaults to ${defaultSource}`)
  .action((opts: CheckOpts) =>
    runAction(async () => {
      await runMain(baseArgs('check', opts.mode, Boolean(opts.json), opts.source ?? defaultSource));
    }),
  );

const rawArgv = process.argv.slice(2);
const { rest: argvForCommander, rawUsers } = extractUsersFlag(rawArgv);
if (rawUsers !== undefined && argvForCommander[0] !== 'init') fail('--users only applies to init.');
rawUsersForInit = rawUsers;
program.parse(argvForCommander, { from: 'user' });
