/** Dev/preprod data faker — creates demo accounts, carts, and free-checkout
 * orders through the public + OPS_TOKEN APIs (never a direct DB write except
 * the ops verify-email helper). Generic commands use password Demo2026!;
 * `seed` uses its own fixed fixture (see SEED_* below) and always grants
 * that account the `admin` role.
 *
 * Usage:
 *   npm run faker -- account <email-or-prefix> [--count N] [--verified] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run faker -- order <email> [--state …] [--orderQuantity …] [--itemsQuantity …] [--itemsVariation …] [--voucher CODE] [--courier CODE] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run faker -- cart <email> [--itemsQuantity …] [--itemsVariation …] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run faker -- seed [--database-reset] [--confirm] [--json] --dev|--preprod|--prod
 *
 * Also accepts the email-first form for order/cart:
 *   npm run faker -- <email> order|cart …
 *
 * --confirm is required on every command only when targeting --prod — never
 * for --dev/--preprod.
 *
 * --orderQuantity / --itemsQuantity / --itemsVariation: a single integer, or
 * two integers (min max) / "min-max". Randomised per order when a range.
 * --state omitted = every lifecycle status (cycled across created orders).
 * Each order additionally gets a ~50/50 coin flip for one extra accessory
 * line (from GET /gallery/cart-accessories, same carousel the cart page
 * itself offers) — a realistic mix of orders with and without one, across
 * every status including received/cancelled (order history). Silently
 * skipped if no accessory is currently in_cart_carousel-visible.
 * `disponible` uses the Point Relais courier because it means ready for
 * customer collection.
 * --database-reset (seed only): wipe DB → migrate → library seed → courier
 * seed, then run the usual seed. Destructive; implies operation --confirm —
 * seed's own --confirm (required for --prod) is what gates that forwarding.
 * --throttle <ms> applies to faker's own public-API requests (account/cart/
 * checkout/etc. — everything except /operation/* calls, which go over the
 * SSH-tunneled ops server and don't need it). Default 0 in dev, 149 in
 * preprod/prod.
 */
import { Command as Program } from 'commander';
import { randomBytes, randomInt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken, loadStripeSecretKey } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';
import {
  configureRequestThrottle,
  defaultRequestThrottleMs,
  requestWithThrottle,
} from './requestThrottle.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PASSWORD = 'Demo2026!';
const FAKE_DOMAIN = 'shop.example';
const DEFAULT_VOUCHER = 'FAKER-FREE';
const DEFAULT_COURIER = 'mondial-relay-home';
const STATUSES = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received',
  'cancelled',
] as const;
const HOME_PIPELINE = ['confirmed', 'in_preparation', 'to_send', 'sent', 'received'] as const;
const POINT_PIPELINE = ['confirmed', 'in_preparation', 'to_send', 'sent', 'disponible', 'received'] as const;
const SIZES = ['XS', 'S', 'M', 'L'] as const;

const SEED_EMAIL = 'tezov.app@gmail.com';
const SEED_PASSWORD = 'Demo2016!';
/** Same test PANs as requested — Stripe forbids sending raw numbers from a
 * Node CLI (browser Stripe.js only), so seed uses the official tokens that
 * map 1:1 to those cards (see https://docs.stripe.com/testing#cards /
 * "Tokens"). */
const SEED_CARDS = [
  { last4: '0341', token: 'tok_chargeCustomerFail' },
  { last4: '4242', token: 'tok_visa' },
] as const;
const SEED_HOME_LABEL = 'Faker Home MR';
const SEED_POINT_LABEL = 'Faker Point MR';
const SEED_CART_NAMES = ['Faker Cart 1', 'Faker Cart 2'] as const;
const SEED_POINT_ID = '012345';
/** Deterministic (not the ~50/50 coin flip runOrder uses) — the fixed seed
 * fixture is what gets re-inspected/tested repeatedly, so it must reliably
 * demonstrate an accessory line rather than only sometimes landing on
 * "received" (order history) or "in_preparation"/"sent" (active) by luck. */
const SEED_ACCESSORY_STATUSES = new Set<Status>(['in_preparation', 'sent', 'received']);

type Status = (typeof STATUSES)[number];
type IntRange = { min: number; max: number };

interface GalleryItem {
  id: string;
  shape: Record<string, string>;
  lengthsByShape?: Record<string, Record<string, string>>;
  available?: Record<string, Record<string, Partial<Record<(typeof SIZES)[number], number>>>>;
}

interface StockOption {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: (typeof SIZES)[number];
  maxQty: number;
}

/** One buyable (productId, packKey) pair for a carousel-visible accessory.
 * `packKey` is '' for a 'default' accessory; `maxQty` is the ceiling for
 * POST /account/cart's own `quantity` (packs for byQuantity, units for
 * default — same unit the endpoint expects either way). */
interface AccessoryOption {
  productId: string;
  packKey: string;
  maxQty: number;
}

interface AccountArgs {
  command: 'account';
  emailOrPrefix: string;
  count: number;
  verified: boolean;
  json: boolean;
  mode: Mode;
  throttle: number;
}

interface OrderArgs {
  command: 'order';
  email: string;
  states: Status[];
  orderQuantity: IntRange;
  itemsQuantity: IntRange;
  itemsVariation: IntRange;
  voucher: string;
  courier: string;
  json: boolean;
  mode: Mode;
  throttle: number;
}

interface CartArgs {
  command: 'cart';
  email: string;
  itemsQuantity: IntRange;
  itemsVariation: IntRange;
  json: boolean;
  mode: Mode;
  throttle: number;
}

interface SeedArgs {
  command: 'seed';
  databaseReset: boolean;
  json: boolean;
  mode: Mode;
  throttle: number;
}

type Args = AccountArgs | OrderArgs | CartArgs | SeedArgs;

const program = new Program();
program
  .name('faker')
  .description('Dev/preprod data faker — creates demo accounts, carts, and free-checkout orders.');
const fail: (message: string) => never = makeFail(program, 'faker');

function addThrottleOption(command: Program): Program {
  return command.option(
    '--throttle <ms>',
    'non-negative integer number of milliseconds (default: dev 0; preprod/prod 149)',
  );
}

function parseThrottle(raw: string | undefined, mode: Mode): number {
  if (raw === undefined) return defaultRequestThrottleMs(mode);
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isSafeInteger(value) || value < 0) {
    fail('--throttle requires a non-negative integer number of milliseconds.');
  }
  return value;
}

function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value);
}

function parseRange(tokens: string[], flag: string): { range: IntRange; consumed: number } {
  if (tokens.length === 0) fail(`${flag} needs a number or a min max range.`);
  const first = tokens[0]!;
  const dashed = /^(\d+)-(\d+)$/.exec(first);
  if (dashed) {
    const min = Number(dashed[1]);
    const max = Number(dashed[2]);
    if (min < 1 || max < min) fail(`${flag} range must be min>=1 and max>=min.`);
    return { range: { min, max }, consumed: 1 };
  }
  if (!/^\d+$/.test(first)) fail(`${flag} "${first}" isn't a positive integer.`);
  const min = Number(first);
  if (min < 1) fail(`${flag} must be >= 1.`);
  if (tokens.length >= 2 && /^\d+$/.test(tokens[1]!)) {
    const max = Number(tokens[1]);
    if (max < min) fail(`${flag} max must be >= min.`);
    return { range: { min, max }, consumed: 2 };
  }
  return { range: { min, max: min }, consumed: 1 };
}

function pickInRange(range: IntRange): number {
  if (range.min === range.max) return range.min;
  return randomInt(range.min, range.max + 1);
}

function randomSuffix(): string {
  return randomBytes(3).toString('hex');
}

function resolveEmail(emailOrPrefix: string): string {
  const raw = emailOrPrefix.trim().toLowerCase();
  if (!raw) fail('email / prefix must not be empty.');
  if (raw.includes('@')) return raw;
  return `${raw}-${randomSuffix()}@${FAKE_DOMAIN}`;
}

function parseStates(rawValues: string[]): Status[] {
  const tokens = rawValues.flatMap((value) =>
    value
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  if (tokens.length === 0) return [...STATUSES];
  const states: Status[] = [];
  for (const token of tokens) {
    if (!isStatus(token)) fail(`unknown state "${token}" — expected one of ${STATUSES.join(', ')}.`);
    if (!states.includes(token)) states.push(token);
  }
  return states;
}

// commander has no notion of a single option consuming a variable number of
// following space-separated values (only variadic *positional* arguments do
// that) — so --state/--states/--orderQuantity/--itemsQuantity/--itemsVariation
// are pulled out of argv by hand before program.parse() ever sees them, same
// consumption rules as the original hand-rolled loop. The email-first form
// (`<email> order|cart …`) is normalized to command-first the same way.
const KNOWN_COMMANDS = ['account', 'order', 'cart', 'seed'];

function normalizeEmailFirst(argv: string[]): string[] {
  const [first, second, ...rest] = argv;
  if (first !== undefined && !KNOWN_COMMANDS.includes(first) && (second === 'order' || second === 'cart')) {
    return [second, first, ...rest];
  }
  return argv;
}

function takeNonFlagRun(argv: string[], start: number): string[] {
  const values: string[] = [];
  let i = start;
  while (i < argv.length && !argv[i]!.startsWith('--')) {
    values.push(argv[i]!);
    i += 1;
  }
  return values;
}

function extractStatesFlag(argv: string[]): { rest: string[]; states: Status[] | undefined; given: boolean } {
  const idx = argv.findIndex((token) => token === '--state' || token === '--states');
  if (idx === -1) return { rest: argv, states: undefined, given: false };
  const raw = takeNonFlagRun(argv, idx + 1);
  if (raw.length === 0) fail(`${argv[idx]} needs at least one value.`);
  return {
    rest: [...argv.slice(0, idx), ...argv.slice(idx + 1 + raw.length)],
    states: parseStates(raw),
    given: true,
  };
}

function extractRangeFlag(argv: string[], flag: string): { rest: string[]; range: IntRange | undefined } {
  const idx = argv.indexOf(flag);
  if (idx === -1) return { rest: argv, range: undefined };
  const grabbed = takeNonFlagRun(argv, idx + 1).slice(0, 2);
  const { range, consumed } = parseRange(grabbed, flag);
  const leftover = grabbed.slice(consumed);
  return { rest: [...argv.slice(0, idx), ...leftover, ...argv.slice(idx + 1 + grabbed.length)], range };
}

async function apiFetch(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string; opsToken?: string; checkoutSession?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  headers.set('accept-language', 'fr');
  if (init.token) headers.set('authorization', `Bearer ${init.token}`);
  if (init.opsToken) headers.set('authorization', `Bearer ${init.opsToken}`);
  if (init.checkoutSession) headers.set('X-Checkout-Session', init.checkoutSession);
  const { token: _t, opsToken: _o, checkoutSession: _c, ...rest } = init;
  const isOperationCall = path.startsWith('/operation/');
  const requestBase = isOperationCall ? (process.env.PAM_OPS_TUNNEL_URL ?? baseUrl) : baseUrl;
  // Operation calls go over the SSH-tunneled loopback ops server, not the
  // public API, so they skip the protective throttle applied to everything
  // else here. The FTP PHP gateway on this host returns 502/503 under LVE
  // pressure; retry those instead of aborting a seed that already created
  // the account.
  const maxAttempts = isOperationCall ? 12 : 1;
  let lastStatus = 0;
  let lastBody: Record<string, unknown> = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = isOperationCall
        ? await fetch(`${requestBase}${path}`, { ...rest, headers })
        : await requestWithThrottle(`${requestBase}${path}`, { ...rest, headers });
      const text = await response.text();
      let body: Record<string, unknown> = {};
      try {
        body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        body = { raw: text };
      }
      lastStatus = response.status;
      lastBody = body;
      const retryable = isOperationCall && (response.status === 502 || response.status === 503);
      if (!retryable || attempt === maxAttempts) return { status: response.status, body };
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    } catch (error) {
      if (!isOperationCall || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  return { status: lastStatus, body: lastBody };
}

function errorCode(body: Record<string, unknown>): string {
  const error = body.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return `http_error`;
}

async function registerAccount(
  apiBaseUrl: string,
  email: string,
  json: boolean,
  password: string = PASSWORD,
): Promise<{ accessToken: string; userId: string; created: boolean }> {
  const registered = await apiFetch(apiBaseUrl, '/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      gdprConsent: { accepted: true },
      language: 'fr',
    }),
  });
  if (registered.status === 201) {
    const user = registered.body.user as { id: string };
    log(json, `[faker] registered ${email}`);
    return { accessToken: String(registered.body.accessToken), userId: user.id, created: true };
  }
  if (errorCode(registered.body) !== 'email_already_used') {
    fail(`register ${email} failed (${registered.status} ${errorCode(registered.body)}).`);
  }
  const login = await apiFetch(apiBaseUrl, '/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe: false }),
  });
  if (login.status !== 200) {
    fail(
      `account ${email} exists but login with the expected password failed (${login.status} ${errorCode(login.body)}).`,
    );
  }
  const user = login.body.user as { id: string };
  log(json, `[faker] reused existing ${email}`);
  return { accessToken: String(login.body.accessToken), userId: user.id, created: false };
}

async function verifyEmail(
  apiBaseUrl: string,
  opsToken: string,
  email: string,
  json: boolean,
): Promise<void> {
  const result = await apiFetch(apiBaseUrl, `/operation/accounts/${encodeURIComponent(email)}/verify-email`, {
    method: 'POST',
    opsToken,
  });
  if (result.status !== 200)
    fail(`verify-email ${email} failed (${result.status} ${errorCode(result.body)}).`);
  log(json, `[faker] verified ${email}`);
}

async function promoteSeedAdmin(
  apiBaseUrl: string,
  opsToken: string,
  email: string,
  json: boolean,
): Promise<void> {
  const result = await apiFetch(apiBaseUrl, `/operation/accounts/${encodeURIComponent(email)}/role`, {
    method: 'PUT',
    opsToken,
    body: JSON.stringify({ role: 'super-admin' }),
  });
  if (result.status !== 200)
    fail(`set-role super-admin ${email} failed (${result.status} ${errorCode(result.body)}).`);
  log(json, `[faker] super-admin ${email}`);
}

async function startCheckoutSession(apiBaseUrl: string, token: string): Promise<string> {
  const result = await apiFetch(apiBaseUrl, '/checkout/session/start', {
    method: 'POST',
    token,
  });
  if (result.status !== 200 || typeof result.body.token !== 'string') {
    fail(`checkout/session/start failed (${result.status} ${errorCode(result.body)}).`);
  }
  return result.body.token;
}

async function ensureFakerVoucher(
  apiBaseUrl: string,
  opsToken: string,
  code: string,
  json: boolean,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const ends = new Date();
  ends.setUTCFullYear(ends.getUTCFullYear() + 1);
  const endsAt = ends.toISOString().slice(0, 10);
  const result = await apiFetch(apiBaseUrl, '/operation/voucher-import/vouchers', {
    method: 'POST',
    opsToken,
    body: JSON.stringify({
      code,
      enabled: true,
      quantity: 100_000,
      maxUsesPerUser: 0,
      startsAt: today,
      endsAt,
      offer: { type: 'amount', amount: 500 },
      update: true,
    }),
  });
  if (result.status !== 200 && result.status !== 201) {
    fail(`ensure voucher ${code} failed (${result.status} ${errorCode(result.body)}).`);
  }
  log(json, `[faker] voucher ${code} ready`);
}

async function loadStockOptions(apiBaseUrl: string): Promise<StockOption[]> {
  const options: StockOption[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const query = new URLSearchParams({ limit: '60' });
    if (cursor) query.set('cursor', cursor);
    const result = await apiFetch(apiBaseUrl, `/gallery/feed?${query}`);
    if (result.status !== 200) fail(`gallery feed failed (${result.status}).`);
    const items = (result.body.items as GalleryItem[] | undefined) ?? [];
    for (const item of items) {
      const available = item.available ?? {};
      for (const [shapeKey, lengths] of Object.entries(available)) {
        for (const [lengthKey, sizes] of Object.entries(lengths ?? {})) {
          for (const size of SIZES) {
            const qty = sizes?.[size] ?? 0;
            if (qty > 0) options.push({ productId: item.id, shapeKey, lengthKey, size, maxQty: qty });
          }
        }
      }
    }
    cursor = typeof result.body.nextCursor === 'string' ? result.body.nextCursor : undefined;
    if (!cursor) break;
  }
  if (options.length === 0) fail('no in-stock gallery lines found — import the library first.');
  return options;
}

/** Same carousel the cart page itself offers ("Ajoutez des accessoires") —
 * GET /gallery/cart-accessories, public, filtered to `in_cart_carousel`
 * accessories. Empty is a valid, non-fatal result (e.g. none flagged /
 * imported yet): callers just skip adding an accessory line rather than
 * failing the whole order/seed run over it. */
async function loadAccessoryOptions(apiBaseUrl: string): Promise<AccessoryOption[]> {
  const result = await apiFetch(apiBaseUrl, '/gallery/cart-accessories');
  if (result.status !== 200) fail(`gallery cart-accessories failed (${result.status}).`);
  const items =
    (result.body as unknown as Array<{
      id: string;
      accessoryType?: 'default' | 'byQuantity';
      available: number;
      packs?: Record<string, number>;
    }>) ?? [];
  const options: AccessoryOption[] = [];
  for (const item of items) {
    if (item.accessoryType === 'byQuantity' && item.packs) {
      for (const [packKey, multiplier] of Object.entries(item.packs)) {
        const maxQty = Math.floor(item.available / multiplier);
        if (maxQty > 0) options.push({ productId: item.id, packKey, maxQty });
      }
    } else if (item.available > 0) {
      options.push({ productId: item.id, packKey: '', maxQty: item.available });
    }
  }
  return options;
}

/** ~50/50 per call — the point is a realistic mix of orders/carts with and
 * without an accessory line, not a guaranteed one. undefined when there's
 * nothing to add (empty catalogue) or the coin flip came up "skip". */
function maybePickAccessory(options: AccessoryOption[]): AccessoryOption | undefined {
  if (options.length === 0 || randomInt(2) === 0) return undefined;
  return options[randomInt(options.length)];
}

/** Unconditional pick (no coin flip) — undefined only when the catalogue is
 * empty. Used where a specific status must reliably demonstrate an
 * accessory line rather than leaving it to chance. */
function pickAccessory(options: AccessoryOption[]): AccessoryOption | undefined {
  if (options.length === 0) return undefined;
  return options[randomInt(options.length)];
}

/** Same as pickAccessory, but prefers a 'default'-type option (packKey '')
 * when one exists — the seed fixture's `received` order uses this so
 * there's always a confirmed order with a plain-quantity accessory line to
 * check invoice/order-history rendering against, instead of leaving that to
 * the same uniform random pick as the other guaranteed-accessory statuses. */
function pickDefaultTypeAccessory(options: AccessoryOption[]): AccessoryOption | undefined {
  const defaultOptions = options.filter((option) => option.packKey === '');
  if (defaultOptions.length > 0) return defaultOptions[randomInt(defaultOptions.length)];
  return pickAccessory(options);
}

/** Adds one accessory line on top of whatever fillCart just put in the
 * active cart — call after fillCart, never before (fillCart clears the
 * cart first). Quantity is packs for byQuantity, units for default; both
 * are what POST /account/cart's own `quantity` expects. */
async function addAccessoryToCart(apiBaseUrl: string, token: string, option: AccessoryOption): Promise<void> {
  const quantity = Math.min(randomInt(1, 3), option.maxQty);
  const body: Record<string, unknown> = { productId: option.productId, quantity };
  if (option.packKey) body.packKey = option.packKey;
  const result = await apiFetch(apiBaseUrl, '/account/cart', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
  if (result.status !== 200) {
    fail(`POST /account/cart (accessory) failed (${result.status} ${errorCode(result.body)}).`);
  }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function pickLines(
  stock: StockOption[],
  variation: number,
  quantityRange: IntRange,
): { productId: string; shapeKey: string; lengthKey: string; size: string; quantity: number }[] {
  const bySet = new Map<string, StockOption[]>();
  for (const option of stock) {
    const list = bySet.get(option.productId) ?? [];
    list.push(option);
    bySet.set(option.productId, list);
  }
  const setIds = shuffle([...bySet.keys()]);
  const picked: { productId: string; shapeKey: string; lengthKey: string; size: string; quantity: number }[] =
    [];
  for (const setId of setIds) {
    if (picked.length >= variation) break;
    const options = shuffle(bySet.get(setId)!);
    const option = options[0]!;
    const quantity = Math.min(pickInRange(quantityRange), option.maxQty);
    if (quantity < 1) continue;
    picked.push({
      productId: option.productId,
      shapeKey: option.shapeKey,
      lengthKey: option.lengthKey,
      size: option.size,
      quantity,
    });
  }
  if (picked.length === 0) fail('could not pick any in-stock lines for the requested variation.');
  return picked;
}

async function clearCart(apiBaseUrl: string, token: string): Promise<void> {
  const cart = await apiFetch(apiBaseUrl, '/account/cart', { token });
  if (cart.status !== 200) fail(`GET /account/cart failed (${cart.status}).`);
  const items =
    (cart.body.items as
      { productId: string; shapeKey: string; lengthKey: string; size: string }[] | undefined) ?? [];
  for (const item of items) {
    await apiFetch(
      apiBaseUrl,
      `/account/cart/${item.productId}/${encodeURIComponent(item.shapeKey)}/${encodeURIComponent(item.lengthKey)}/${item.size}`,
      { method: 'DELETE', token },
    );
  }
}

async function fillCart(
  apiBaseUrl: string,
  token: string,
  lines: { productId: string; shapeKey: string; lengthKey: string; size: string; quantity: number }[],
): Promise<void> {
  await clearCart(apiBaseUrl, token);
  for (const line of lines) {
    const result = await apiFetch(apiBaseUrl, '/account/cart', {
      method: 'POST',
      token,
      body: JSON.stringify(line),
    });
    if (result.status !== 200) {
      fail(`POST /account/cart failed (${result.status} ${errorCode(result.body)}).`);
    }
  }
}

async function ensureAddress(apiBaseUrl: string, token: string, json: boolean): Promise<string> {
  const listed = await apiFetch(apiBaseUrl, '/account/addresses', { token });
  if (listed.status !== 200) fail(`GET /account/addresses failed (${listed.status}).`);
  const addresses =
    (listed.body.addresses as { id: string; kind: string }[] | undefined)?.filter(
      (row) => row.kind === 'livraison',
    ) ?? [];
  if (addresses[0]) return addresses[0].id;

  const created = await apiFetch(apiBaseUrl, '/account/addresses', {
    method: 'POST',
    token,
    body: JSON.stringify({
      kind: 'livraison',
      recipientName: 'Faker Demo',
      line1: '10 rue de la Paix',
      postalCode: '75002',
      city: 'Paris',
      countryCode: 'FR',
      phone: '0600000000',
      label: 'Faker',
      networkCodes: ['home'],
      isDefault: true,
    }),
  });
  if (created.status !== 201 && created.status !== 200) {
    fail(`POST /account/addresses failed (${created.status} ${errorCode(created.body)}).`);
  }
  const address = created.body.address as { id: string };
  log(json, `[faker] created livraison address ${address.id}`);
  return address.id;
}

interface SeedAddress {
  id: string;
  label: string | null;
  kind: string;
  networkCodes: string[];
}

async function listAddresses(apiBaseUrl: string, token: string): Promise<SeedAddress[]> {
  const listed = await apiFetch(apiBaseUrl, '/account/addresses', { token });
  if (listed.status !== 200) fail(`GET /account/addresses failed (${listed.status}).`);
  return (listed.body.addresses as SeedAddress[] | undefined) ?? [];
}

async function ensureSeedAddresses(
  apiBaseUrl: string,
  token: string,
  json: boolean,
): Promise<{ homeId: string; pointId: string }> {
  const existing = await listAddresses(apiBaseUrl, token);
  const livraison = existing.filter((row) => row.kind === 'livraison');

  let home = livraison.find(
    (row) =>
      row.label === SEED_HOME_LABEL ||
      (row.networkCodes.includes('home') && !row.networkCodes.includes('mondial-relay-point')),
  );
  if (!home) {
    const created = await apiFetch(apiBaseUrl, '/account/addresses', {
      method: 'POST',
      token,
      body: JSON.stringify({
        kind: 'livraison',
        recipientName: 'Tezov Seed',
        line1: '10 rue de la Paix',
        postalCode: '75002',
        city: 'Paris',
        countryCode: 'FR',
        phone: '0600000001',
        label: SEED_HOME_LABEL,
        networkCodes: ['home'],
        isDefault: true,
      }),
    });
    if (created.status !== 201 && created.status !== 200) {
      fail(`seed home address failed (${created.status} ${errorCode(created.body)}).`);
    }
    home = created.body.address as SeedAddress;
    log(json, `[faker] seed address home ${home.id}`);
  } else {
    log(json, `[faker] seed address home reused ${home.id}`);
  }

  let point = livraison.find(
    (row) => row.label === SEED_POINT_LABEL || row.networkCodes.includes('mondial-relay-point'),
  );
  if (!point) {
    const created = await apiFetch(apiBaseUrl, '/account/addresses', {
      method: 'POST',
      token,
      body: JSON.stringify({
        kind: 'livraison',
        recipientName: 'Tezov Seed',
        line1: 'Point Relais Shop',
        postalCode: '75001',
        city: 'Paris',
        countryCode: 'FR',
        phone: '0600000002',
        label: SEED_POINT_LABEL,
        networkCodes: ['mondial-relay-point'],
        pickupPoints: {
          'mondial-relay-point': { id: SEED_POINT_ID },
        },
        isDefault: false,
      }),
    });
    if (created.status !== 201 && created.status !== 200) {
      fail(`seed point address failed (${created.status} ${errorCode(created.body)}).`);
    }
    point = created.body.address as SeedAddress;
    log(json, `[faker] seed address point ${point.id}`);
  } else {
    log(json, `[faker] seed address point reused ${point.id}`);
  }

  return { homeId: home.id, pointId: point.id };
}

/** Same account endpoints as AddCardModal: SetupIntent → PaymentMethod →
 * confirm → `/account/payment-methods/register`. Tokenization uses Stripe
 * test tokens (raw PANs are browser/Stripe.js-only on this Stripe account). */
async function ensureSeedCards(
  apiBaseUrl: string,
  token: string,
  stripeSecretKey: string,
  json: boolean,
): Promise<{ last4: string; id: string; created: boolean }[]> {
  const listed = await apiFetch(apiBaseUrl, '/account/payment-methods', { token });
  if (listed.status !== 200) {
    fail(`GET /account/payment-methods failed (${listed.status} ${errorCode(listed.body)}).`);
  }
  const existing = (listed.body.paymentMethods as { id: string; last4: string }[] | undefined) ?? [];
  const stripe = new Stripe(stripeSecretKey);
  const results: { last4: string; id: string; created: boolean }[] = [];

  for (const card of SEED_CARDS) {
    const already = existing.find((row) => row.last4 === card.last4);
    if (already) {
      log(json, `[faker] seed card ****${card.last4} reused ${already.id}`);
      results.push({ last4: card.last4, id: already.id, created: false });
      continue;
    }

    const setup = await apiFetch(apiBaseUrl, '/account/payment-methods/setup-intent', {
      method: 'POST',
      token,
    });
    if (setup.status !== 200 || typeof setup.body.clientSecret !== 'string') {
      fail(`setup-intent failed (${setup.status} ${errorCode(setup.body)}).`);
    }
    const setupIntentId = setup.body.clientSecret.split('_secret_')[0];
    if (!setupIntentId?.startsWith('seti_')) {
      fail(`setup-intent returned unexpected clientSecret shape.`);
    }

    let paymentMethodId: string;
    try {
      const paymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: { token: card.token },
        billing_details: { name: 'Tezov Seed', email: SEED_EMAIL },
        allow_redisplay: 'always',
      });
      paymentMethodId = paymentMethod.id;
      await stripe.setupIntents.confirm(setupIntentId, { payment_method: paymentMethodId });
    } catch (error) {
      fail(
        `Stripe tokenize/confirm card ****${card.last4} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const registered = await apiFetch(apiBaseUrl, '/account/payment-methods/register', {
      method: 'POST',
      token,
      body: JSON.stringify({ paymentMethodId, savedForFuture: true }),
    });
    if (registered.status !== 200) {
      fail(`register card ****${card.last4} failed (${registered.status} ${errorCode(registered.body)}).`);
    }
    const saved = registered.body.paymentMethod as { id: string; last4: string };
    log(json, `[faker] seed card ****${saved.last4} registered ${saved.id}`);
    results.push({ last4: saved.last4, id: saved.id, created: true });
  }

  return results;
}

async function ensureSeedCarts(
  apiBaseUrl: string,
  token: string,
  stock: StockOption[],
  json: boolean,
): Promise<{ id: string; name: string; lines: number; created: boolean }[]> {
  const listed = await apiFetch(apiBaseUrl, '/account/carts', { token });
  if (listed.status !== 200) fail(`GET /account/carts failed (${listed.status}).`);
  const carts = (listed.body.carts as { id: string; name: string; isActive: boolean }[] | undefined) ?? [];
  const results: { id: string; name: string; lines: number; created: boolean }[] = [];

  for (const name of SEED_CART_NAMES) {
    let cart = carts.find((row) => row.name === name);
    let created = false;
    if (!cart) {
      const createdCart = await apiFetch(apiBaseUrl, '/account/carts', {
        method: 'POST',
        token,
        body: JSON.stringify({ name, activate: true }),
      });
      if (createdCart.status !== 200 && createdCart.status !== 201) {
        fail(`POST /account/carts "${name}" failed (${createdCart.status} ${errorCode(createdCart.body)}).`);
      }
      cart = createdCart.body.cart as { id: string; name: string; isActive: boolean };
      created = true;
      log(json, `[faker] seed cart created ${cart.id} (${name})`);
    } else {
      const activated = await apiFetch(apiBaseUrl, `/account/carts/${cart.id}/activate`, {
        method: 'POST',
        token,
      });
      if (activated.status !== 200) {
        fail(`activate cart ${cart.id} failed (${activated.status} ${errorCode(activated.body)}).`);
      }
      log(json, `[faker] seed cart reused ${cart.id} (${name})`);
    }

    const variation = Math.min(2, stock.length);
    const lines = pickLines(stock, variation, { min: 1, max: 3 });
    await fillCart(apiBaseUrl, token, lines);
    results.push({ id: cart.id, name, lines: lines.length, created });
  }

  return results;
}

async function listOrderStatuses(apiBaseUrl: string, token: string): Promise<Set<Status>> {
  const statuses = new Set<Status>();
  for (const scope of ['active', 'history'] as const) {
    const listed = await apiFetch(apiBaseUrl, `/account/orders?scope=${scope}`, { token });
    if (listed.status !== 200) fail(`GET /account/orders?scope=${scope} failed (${listed.status}).`);
    for (const order of (listed.body.orders as { status: Status }[] | undefined) ?? []) {
      if (isStatus(order.status)) statuses.add(order.status);
    }
  }
  return statuses;
}

async function createSeedOrders(
  apiBaseUrl: string,
  token: string,
  opsToken: string,
  addresses: { homeId: string; pointId: string },
  stock: StockOption[],
  accessoryOptions: AccessoryOption[],
  existingStatuses: Set<Status>,
  json: boolean,
): Promise<
  { orderNumber: string; orderId: string; targetStatus: Status; created: boolean; hasAccessory: boolean }[]
> {
  const results: {
    orderNumber: string;
    orderId: string;
    targetStatus: Status;
    created: boolean;
    hasAccessory: boolean;
  }[] = [];

  for (const targetStatus of STATUSES) {
    if (existingStatuses.has(targetStatus)) {
      log(json, `[faker] seed order status ${targetStatus} already present — skip`);
      results.push({
        orderNumber: '(existing)',
        orderId: '',
        targetStatus,
        created: false,
        hasAccessory: false,
      });
      continue;
    }

    const pointRelais = targetStatus === 'disponible';
    const lines = pickLines(stock, Math.min(2, stock.length), { min: 1, max: 2 });
    await fillCart(apiBaseUrl, token, lines);
    // Deterministic per status (SEED_ACCESSORY_STATUSES), not a coin flip —
    // this fixture is what gets re-inspected/tested repeatedly, so "some
    // with, some without, and reliably in history too" can't be left to
    // chance the way runOrder's own random pick is. `received` specifically
    // prefers a 'default'-type accessory so invoice/order-history for that
    // type is always checkable on a real confirmed order, not just the cart.
    const accessory = SEED_ACCESSORY_STATUSES.has(targetStatus)
      ? targetStatus === 'received'
        ? pickDefaultTypeAccessory(accessoryOptions)
        : pickAccessory(accessoryOptions)
      : undefined;
    if (accessory) await addAccessoryToCart(apiBaseUrl, token, accessory);
    const checkoutSession = await startCheckoutSession(apiBaseUrl, token);
    const checkout = await apiFetch(apiBaseUrl, '/account/checkout/free', {
      method: 'POST',
      token,
      checkoutSession,
      body: JSON.stringify({
        addressId: pointRelais ? addresses.pointId : addresses.homeId,
        courierCode: pointRelais ? 'mondial-relay-point' : DEFAULT_COURIER,
        express: false,
        voucherCode: DEFAULT_VOUCHER,
      }),
    });
    if (checkout.status !== 201) {
      fail(`seed checkout/free failed for ${targetStatus} (${checkout.status} ${errorCode(checkout.body)}).`);
    }
    const order = checkout.body.order as { id: string; orderNumber: string; status: Status };
    log(
      json,
      `[faker] seed order ${order.orderNumber} → ${targetStatus}${accessory ? ' (+ accessory)' : ''}`,
    );
    await advanceOrder(apiBaseUrl, opsToken, order.id, targetStatus, json, pointRelais);
    results.push({
      orderNumber: order.orderNumber,
      orderId: order.id,
      targetStatus,
      created: true,
      hasAccessory: !!accessory,
    });
  }

  return results;
}

/** Same idea as operation.ts's own activeTransportFlag() — faker itself was
 * launched through withOpsTunnel.ts, which stamped the transport it picked
 * onto this process's own env. */
function activeTransportFlag(): '--ssh' | '--ftp' | undefined {
  if (process.env.PAM_OPS_TRANSPORT === 'ssh') return '--ssh';
  if (process.env.PAM_OPS_TRANSPORT === 'ftp') return '--ftp';
  return undefined;
}

async function runNpm(script: string, scriptArgs: string[], json: boolean): Promise<void> {
  const transport = activeTransportFlag();
  const args = transport ? [transport, ...scriptArgs] : scriptArgs;
  const pretty = `npm run ${script} -- ${args.join(' ')}`;
  log(json, `[faker] ${pretty}`);
  const result = spawnSync('npm', ['run', script, '--', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // withOpsTunnel.ts already opened one connection for this faker
      // process (target 'faker' gets it as PAM_OPS_TUNNEL_URL, not
      // PAM_OPS_API_BASE_URL — the name every other CLI's loadApiBaseUrl
      // actually reads, see envFile.ts). Alias it across so PAM_OPS_REUSE
      // lets each child reuse this same tunnel/gateway instead of opening
      // its own.
      PAM_OPS_REUSE: '1',
      ...(process.env.PAM_OPS_TUNNEL_URL ? { PAM_OPS_API_BASE_URL: process.env.PAM_OPS_TUNNEL_URL } : {}),
    },
  });
  if (result.error) fail(`${pretty} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${pretty} failed (exit ${result.status ?? 'signal'}).`);
}

/** Wipe → migrate → library seed → courier seed. Same CLIs as a manual
 * bootstrap after `operation -- database-reset`. `--database-reset` on seed
 * is the confirmation (passes `--confirm` to operation). */
async function resetDatabaseForSeed(mode: Mode, json: boolean): Promise<void> {
  log(json, `[faker] --database-reset: wiping ${mode}, then migrate + library + courier`);
  await runNpm('operation', ['database-reset', '--confirm', `--${mode}`], json);
  await runNpm('operation', ['database-migrate', `--${mode}`], json);
  await runNpm('library', ['seed', `--${mode}`], json);
  await runNpm('courier', ['seed', `--${mode}`], json);
  log(json, `[faker] --database-reset bootstrap done`);
}

async function runSeed(
  args: SeedArgs,
  apiBaseUrl: string,
  opsToken: string,
  stripeSecretKey: string,
): Promise<void> {
  if (args.databaseReset) await resetDatabaseForSeed(args.mode, args.json);

  const session = await registerAccount(apiBaseUrl, SEED_EMAIL, args.json, SEED_PASSWORD);
  await verifyEmail(apiBaseUrl, opsToken, SEED_EMAIL, args.json);
  await promoteSeedAdmin(apiBaseUrl, opsToken, SEED_EMAIL, args.json);
  await ensureFakerVoucher(apiBaseUrl, opsToken, DEFAULT_VOUCHER, args.json);

  const addresses = await ensureSeedAddresses(apiBaseUrl, session.accessToken, args.json);
  const cards = await ensureSeedCards(apiBaseUrl, session.accessToken, stripeSecretKey, args.json);
  const stock = await loadStockOptions(apiBaseUrl);
  const accessoryOptions = await loadAccessoryOptions(apiBaseUrl);
  // Orders consume the active cart — create them before filling the seed carts.
  const existingStatuses = await listOrderStatuses(apiBaseUrl, session.accessToken);
  const orders = await createSeedOrders(
    apiBaseUrl,
    session.accessToken,
    opsToken,
    addresses,
    stock,
    accessoryOptions,
    existingStatuses,
    args.json,
  );
  const carts = await ensureSeedCarts(apiBaseUrl, session.accessToken, stock, args.json);

  const summary = {
    command: 'seed' as const,
    mode: args.mode,
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    role: 'super-admin' as const,
    userId: session.userId,
    accountCreated: session.created,
    addresses,
    cards,
    carts,
    orders: orders.filter((row) => row.created),
    skippedOrderStatuses: orders.filter((row) => !row.created).map((row) => row.targetStatus),
  };

  logTable(args.json, [
    { kind: 'account', detail: `${SEED_EMAIL} (admin)`, created: session.created },
    { kind: 'address', detail: `home ${addresses.homeId}`, created: true },
    { kind: 'address', detail: `point ${addresses.pointId}`, created: true },
    ...cards.map((card) => ({
      kind: 'card',
      detail: `****${card.last4}`,
      created: card.created,
    })),
    ...carts.map((cart) => ({
      kind: 'cart',
      detail: `${cart.name} (${cart.lines} lines)`,
      created: cart.created,
    })),
    ...orders.map((order) => ({
      kind: 'order',
      detail: order.created
        ? `${order.orderNumber} → ${order.targetStatus}${order.hasAccessory ? ' (+ accessory)' : ''}`
        : `skip ${order.targetStatus}`,
      created: order.created,
    })),
  ]);

  if (args.json) {
    printJson(summary);
  } else {
    log(args.json, `[faker] seed ready for ${SEED_EMAIL} as admin (password ${SEED_PASSWORD}).`);
  }
}

async function setOrderStatus(
  apiBaseUrl: string,
  opsToken: string,
  orderId: string,
  status: Status,
  json: boolean,
): Promise<void> {
  const body: Record<string, unknown> = { status };
  if (status === 'to_send') body.skipShippingLabel = true;
  if (status === 'in_preparation') body.noPayment = true;
  const result = await apiFetch(apiBaseUrl, `/operation/orders/${orderId}/status`, {
    method: 'PATCH',
    opsToken,
    body: JSON.stringify(body),
  });
  if (result.status !== 200) {
    fail(`set-status → ${status} failed (${result.status} ${errorCode(result.body)}).`);
  }
  log(json, `[faker] order → ${status}`);
}

async function advanceOrder(
  apiBaseUrl: string,
  opsToken: string,
  orderId: string,
  target: Status,
  json: boolean,
  pointRelais = false,
): Promise<void> {
  if (target === 'confirmed') return;
  if (target === 'cancelled') {
    await setOrderStatus(apiBaseUrl, opsToken, orderId, 'cancelled', json);
    return;
  }
  const pipeline: readonly Status[] = pointRelais ? POINT_PIPELINE : HOME_PIPELINE;
  const targetIdx = pipeline.indexOf(target);
  if (targetIdx <= 0) return;
  for (let i = 1; i <= targetIdx; i++) {
    await setOrderStatus(apiBaseUrl, opsToken, orderId, pipeline[i]!, json);
  }
}

async function runAccount(args: AccountArgs, apiBaseUrl: string, opsToken: string): Promise<void> {
  const created: { email: string; userId: string; created: boolean; verified: boolean }[] = [];
  for (let i = 0; i < args.count; i++) {
    const email = args.emailOrPrefix.includes('@')
      ? args.emailOrPrefix.trim().toLowerCase()
      : resolveEmail(args.emailOrPrefix);
    const session = await registerAccount(apiBaseUrl, email, args.json);
    if (args.verified) await verifyEmail(apiBaseUrl, opsToken, email, args.json);
    created.push({
      email,
      userId: session.userId,
      created: session.created,
      verified: args.verified,
    });
  }
  logTable(
    args.json,
    created.map((row) => ({
      email: row.email,
      userId: row.userId,
      created: row.created,
      verified: row.verified,
      password: PASSWORD,
    })),
  );
  if (args.json) {
    printJson({ command: 'account', mode: args.mode, password: PASSWORD, accounts: created });
  } else {
    log(args.json, `[faker] password for all accounts: ${PASSWORD}`);
  }
}

async function runCart(args: CartArgs, apiBaseUrl: string): Promise<void> {
  const session = await registerAccount(apiBaseUrl, args.email, args.json);
  const stock = await loadStockOptions(apiBaseUrl);
  const variation = Math.min(pickInRange(args.itemsVariation), stock.length);
  const lines = pickLines(stock, variation, args.itemsQuantity);
  await fillCart(apiBaseUrl, session.accessToken, lines);
  logTable(
    args.json,
    lines.map((line) => ({
      productId: line.productId,
      shapeKey: line.shapeKey,
      lengthKey: line.lengthKey,
      size: line.size,
      quantity: line.quantity,
    })),
  );
  if (args.json) {
    printJson({
      command: 'cart',
      mode: args.mode,
      email: args.email,
      userId: session.userId,
      lines,
    });
  } else {
    log(args.json, `[faker] cart ready for ${args.email} (${lines.length} line(s)).`);
  }
}

async function runOrder(args: OrderArgs, apiBaseUrl: string, opsToken: string): Promise<void> {
  const session = await registerAccount(apiBaseUrl, args.email, args.json);
  await ensureFakerVoucher(apiBaseUrl, opsToken, args.voucher, args.json);
  const addressId = await ensureAddress(apiBaseUrl, session.accessToken, args.json);
  const stock = await loadStockOptions(apiBaseUrl);
  const accessoryOptions = await loadAccessoryOptions(apiBaseUrl);
  const orderCount = pickInRange(args.orderQuantity);
  const orders: {
    orderNumber: string;
    orderId: string;
    targetStatus: Status;
    lines: number;
    hasAccessory: boolean;
  }[] = [];

  for (let i = 0; i < orderCount; i++) {
    const targetStatus = args.states[i % args.states.length]!;
    const variation = Math.min(pickInRange(args.itemsVariation), stock.length);
    const lines = pickLines(stock, variation, args.itemsQuantity);
    await fillCart(apiBaseUrl, session.accessToken, lines);
    // Per-order coin flip — cycling through every state (including
    // received/cancelled, which land in order history) already happens via
    // targetStatus above, so this alone gives a mix of orders with and
    // without an accessory across both active and history.
    const accessory = maybePickAccessory(accessoryOptions);
    if (accessory) await addAccessoryToCart(apiBaseUrl, session.accessToken, accessory);
    const checkoutSession = await startCheckoutSession(apiBaseUrl, session.accessToken);
    const checkout = await apiFetch(apiBaseUrl, '/account/checkout/free', {
      method: 'POST',
      token: session.accessToken,
      checkoutSession,
      body: JSON.stringify({
        addressId,
        courierCode: args.courier,
        express: false,
        voucherCode: args.voucher,
      }),
    });
    if (checkout.status !== 201) {
      fail(
        `checkout/free failed (${checkout.status} ${errorCode(checkout.body)}) — check stock/voucher/courier.`,
      );
    }
    const order = checkout.body.order as { id: string; orderNumber: string; status: Status };
    log(
      args.json,
      `[faker] created ${order.orderNumber} (${lines.length} line(s)${accessory ? ' + accessory' : ''})`,
    );
    await advanceOrder(
      apiBaseUrl,
      opsToken,
      order.id,
      targetStatus,
      args.json,
      args.courier === 'mondial-relay-point',
    );
    orders.push({
      orderNumber: order.orderNumber,
      orderId: order.id,
      targetStatus,
      lines: lines.length,
      hasAccessory: !!accessory,
    });
  }

  logTable(
    args.json,
    orders.map((row) => ({
      orderNumber: row.orderNumber,
      status: row.targetStatus,
      lines: row.lines,
      accessory: row.hasAccessory,
    })),
  );
  if (args.json) {
    printJson({
      command: 'order',
      mode: args.mode,
      email: args.email,
      userId: session.userId,
      voucher: args.voucher,
      courier: args.courier,
      orders,
    });
  } else {
    log(args.json, `[faker] ${orders.length} order(s) for ${args.email}.`);
  }
}

async function runMain(args: Args): Promise<void> {
  configureRequestThrottle(args.throttle);
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}.`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}.`);

  log(args.json, `[faker] mode=${args.mode} throttle=${args.throttle}ms api=${apiBaseUrl}`);

  if (args.command === 'account') await runAccount(args, apiBaseUrl, opsToken);
  else if (args.command === 'cart') await runCart(args, apiBaseUrl);
  else if (args.command === 'seed') {
    const stripeSecretKey = loadStripeSecretKey(root, args.mode);
    if (!stripeSecretKey) fail(`STRIPE_SECRET_KEY missing for mode ${args.mode}.`);
    await runSeed(args, apiBaseUrl, opsToken, stripeSecretKey);
  } else await runOrder(args, apiBaseUrl, opsToken);
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[faker] fatal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

const preArgv = normalizeEmailFirst(process.argv.slice(2));
const statesExtraction = extractStatesFlag(preArgv);
const orderQtyExtraction = extractRangeFlag(statesExtraction.rest, '--orderQuantity');
const itemsQtyExtraction = extractRangeFlag(orderQtyExtraction.rest, '--itemsQuantity');
const itemsVarExtraction = extractRangeFlag(itemsQtyExtraction.rest, '--itemsVariation');
const finalArgv = itemsVarExtraction.rest;

interface AccountOpts {
  mode: Mode;
  json?: boolean;
  throttle?: string;
  count?: string;
  verified?: boolean;
  confirm?: boolean;
}

addConfirmOption(addThrottleOption(addCommonOptions(program.command('account'))))
  .description('Create a demo account (or several, with a prefix and --count).')
  .argument('<email-or-prefix>')
  .option('--count <n>', 'positive integer; only valid with a prefix (no @)')
  .option('--verified', 'mark the account email as verified')
  .action((emailOrPrefixRaw: string, opts: AccountOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'account');
      if (statesExtraction.given) fail('--state/--voucher/--courier do not apply to account.');
      const emailOrPrefix = emailOrPrefixRaw.trim();
      if (!emailOrPrefix) fail('account requires <email-or-prefix>.');
      let count = 1;
      if (opts.count !== undefined) {
        if (!/^\d+$/.test(opts.count) || Number(opts.count) < 1) fail('--count must be a positive integer.');
        count = Number(opts.count);
      }
      if (emailOrPrefix.includes('@') && count !== 1) {
        fail('--count > 1 only applies to a prefix (no @), not an exact email.');
      }
      const throttle = parseThrottle(opts.throttle, opts.mode);
      await runMain({
        command: 'account',
        emailOrPrefix,
        count,
        verified: Boolean(opts.verified),
        json: Boolean(opts.json),
        mode: opts.mode,
        throttle,
      });
    }),
  );

interface OrderOpts {
  mode: Mode;
  json?: boolean;
  throttle?: string;
  voucher?: string;
  courier?: string;
  confirm?: boolean;
}

addConfirmOption(addThrottleOption(addCommonOptions(program.command('order'))))
  .description('Create a free-checkout order (or several, cycling through --state).')
  .argument('<email>')
  .option('--voucher <code>', `defaults to ${DEFAULT_VOUCHER}`)
  .option('--courier <code>', `defaults to ${DEFAULT_COURIER}`)
  .addHelpText(
    'after',
    '\nAlso accepts (consumed before normal option parsing, so not listed above):\n' +
      `  --state <status...>          space/comma-separated, e.g. --state confirmed sent (default: every status except disponible)\n` +
      '  --orderQuantity <n>|<min> <max>   default: 5\n' +
      '  --itemsQuantity <n>|<min> <max>   default: 1 5\n' +
      '  --itemsVariation <n>|<min> <max>  default: 1 3',
  )
  .action((emailRaw: string, opts: OrderOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'order');
      const email = emailRaw.trim().toLowerCase();
      if (!email || !email.includes('@')) fail('order requires an exact <email>.');
      const voucher = (opts.voucher ?? DEFAULT_VOUCHER).trim() || fail('--voucher needs a code.');
      const courier = (opts.courier ?? DEFAULT_COURIER).trim() || fail('--courier needs a code.');
      const orderStates =
        statesExtraction.states ??
        (courier === 'mondial-relay-point'
          ? [...STATUSES]
          : STATUSES.filter((status) => status !== 'disponible'));
      if (orderStates.includes('disponible') && courier !== 'mondial-relay-point') {
        fail('the disponible state requires --courier mondial-relay-point.');
      }
      const throttle = parseThrottle(opts.throttle, opts.mode);
      await runMain({
        command: 'order',
        email,
        states: orderStates,
        orderQuantity: orderQtyExtraction.range ?? { min: 5, max: 5 },
        itemsQuantity: itemsQtyExtraction.range ?? { min: 1, max: 5 },
        itemsVariation: itemsVarExtraction.range ?? { min: 1, max: 3 },
        voucher,
        courier,
        json: Boolean(opts.json),
        mode: opts.mode,
        throttle,
      });
    }),
  );

interface CartOpts {
  mode: Mode;
  json?: boolean;
  throttle?: string;
  confirm?: boolean;
}

addConfirmOption(addThrottleOption(addCommonOptions(program.command('cart'))))
  .description('Create a cart with random items (no checkout).')
  .argument('<email>')
  .addHelpText(
    'after',
    '\nAlso accepts (consumed before normal option parsing, so not listed above):\n' +
      '  --itemsQuantity <n>|<min> <max>   default: 1 5\n' +
      '  --itemsVariation <n>|<min> <max>  default: 1 3',
  )
  .action((emailRaw: string, opts: CartOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'cart');
      const email = emailRaw.trim().toLowerCase();
      if (!email || !email.includes('@')) fail('cart requires an exact <email>.');
      const throttle = parseThrottle(opts.throttle, opts.mode);
      await runMain({
        command: 'cart',
        email,
        itemsQuantity: itemsQtyExtraction.range ?? { min: 1, max: 5 },
        itemsVariation: itemsVarExtraction.range ?? { min: 1, max: 3 },
        json: Boolean(opts.json),
        mode: opts.mode,
        throttle,
      });
    }),
  );

interface SeedOpts {
  mode: Mode;
  json?: boolean;
  throttle?: string;
  databaseReset?: boolean;
  confirm?: boolean;
}

addConfirmOption(
  addThrottleOption(addCommonOptions(program.command('seed'))),
  'required when targeting --prod (plain seed writes demo data; --database-reset also wipes the DB first)',
)
  .description('Seed the fixed demo fixture (own account, carts, orders).')
  .option(
    '--database-reset',
    'wipe DB → migrate → library seed → courier seed, then the usual seed. Destructive.',
  )
  .action((opts: SeedOpts) =>
    runAction(async () => {
      // This single gate covers --database-reset too: resetDatabaseForSeed
      // below unconditionally forwards --confirm to the child `operation
      // database-reset` call, so without this check a --prod seed
      // --database-reset would silently wipe prod with no confirmation at
      // all (operation.ts's own --prod gate only protects direct
      // `npm run operation` calls, not this indirect one).
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      if (statesExtraction.given) fail('--state/--voucher/--courier do not apply to seed.');
      const throttle = parseThrottle(opts.throttle, opts.mode);
      await runMain({
        command: 'seed',
        databaseReset: Boolean(opts.databaseReset),
        json: Boolean(opts.json),
        mode: opts.mode,
        throttle,
      });
    }),
  );

program.parse(finalArgv, { from: 'user' });
