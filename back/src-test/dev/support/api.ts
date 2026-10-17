import type { APIRequestContext } from 'patchright/test';
import { test } from 'patchright/test';
import { loadTestEnv, testPassword } from './env.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES, type E2eProductUid } from './catalog.js';
import { initVoucher, promoteToAdmin } from './ops.js';

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  [key: string]: unknown;
  user?: T;
  accessToken?: string;
}

const TEST_GIFT_ACCESS_PIN = '2468';
const giftPinGrants = new WeakMap<APIRequestContext, Map<string, string>>();
const checkoutSessions = new WeakMap<APIRequestContext, Map<string, string>>();

function giftPathRole(
  method: string,
  path: string,
): { role: 'giver' | 'receiver'; token: string } | null {
  if (method === 'POST' && path.endsWith('/pin')) return null;
  const giver = path.match(/^\/gift\/giver\/([A-Fa-f0-9]{64})/i);
  if (giver?.[1]) return { role: 'giver', token: giver[1] };
  const receiver = path.match(/^\/gift\/([A-Fa-f0-9]{64})/i);
  if (receiver?.[1]) return { role: 'receiver', token: receiver[1] };
  return null;
}

async function ensureGiftPinGrant(
  request: APIRequestContext,
  method: string,
  path: string,
  pinOverride?: string,
): Promise<string | undefined> {
  const parsed = giftPathRole(method, path);
  if (!parsed) return undefined;
  let grants = giftPinGrants.get(request);
  if (!grants) {
    grants = new Map();
    giftPinGrants.set(request, grants);
  }
  const key = `${parsed.role}:${parsed.token}`;
  const cached = grants.get(key);
  if (cached) return cached;
  const pinPath =
    parsed.role === 'giver' ? `/gift/giver/${parsed.token}/pin` : `/gift/${parsed.token}/pin`;
  const response = await request.fetch(pinPath, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    data: { pin: pinOverride ?? TEST_GIFT_ACCESS_PIN },
  });
  const body = (await response.json()) as { pinToken?: string };
  if (response.status() !== 200 || !body.pinToken) return undefined;
  grants.set(key, body.pinToken);
  return body.pinToken;
}

function checkoutSessionMap(request: APIRequestContext): Map<string, string> {
  let sessions = checkoutSessions.get(request);
  if (!sessions) {
    sessions = new Map();
    checkoutSessions.set(request, sessions);
  }
  return sessions;
}

function needsCheckoutSession(method: string, path: string, data: unknown): boolean {
  if (/^\/checkout\/guest\/(voucher\/validate|create-intent|free)$/.test(path)) return true;
  if (path === '/checkout/loyalty/preview') return true;
  if (/^\/account\/checkout\/(voucher\/validate|create-intent|free)$/.test(path)) return true;
  if (/^\/gift\/giver\/[^/]+\/checkout\/(voucher\/validate|create-intent|free)$/.test(path)) return true;
  if (method === 'GET' && path.startsWith('/account/loyalty/preview')) return true;
  if (method === 'POST' && path === '/account/addresses') {
    return (data as { savedForFuture?: boolean } | undefined)?.savedForFuture === false;
  }
  if (/^\/account\/(addresses|payment-methods)\/.+/.test(path) && method === 'GET') return true;
  if (path === '/account/payment-methods/attach') return true;
  if (path === '/account/payment-methods/register') {
    return (data as { savedForFuture?: boolean } | undefined)?.savedForFuture === false;
  }
  return false;
}

/** Start (or reuse) the caller's checkout privacy session up front. Parallel
 * requests for one account must share it rather than each racing to start
 * their own. */
export async function startCheckoutSession(request: APIRequestContext, accessToken?: string): Promise<string> {
  return ensureCheckoutSession(request, accessToken);
}

async function ensureCheckoutSession(request: APIRequestContext, accessToken?: string): Promise<string> {
  const audience = accessToken ?? 'guest';
  const sessions = checkoutSessionMap(request);
  const existing = sessions.get(audience);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (existing) headers['X-Checkout-Session'] = existing;
  const response = await request.fetch('/checkout/session/start', { method: 'POST', headers });
  const body = (await response.json()) as { token?: string };
  if (response.status() !== 200 || !body.token) {
    throw new Error(`checkout session start failed ${response.status()}: ${JSON.stringify(body)}`);
  }
  sessions.set(audience, body.token);
  return body.token;
}

export function uniqueEmail(prefix = 'e2e'): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}+${stamp}@pamsurin.test`;
}

const SECRET_KEY =
  /^(authorization|cookie|set-cookie|accessToken|refreshToken|password|token|vaultKey|newPassword|x-checkout-session|x-gift-pin-token|pinToken|accessPin|pin)$/i;

/** Deep-clone JSON-ish values and mask secret fields for the HTML report. */
function redactForReport(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForReport);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '***' : redactForReport(child);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 8_000) {
    return `${value.slice(0, 8_000)}…(truncated)`;
  }
  return value;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function apiJson<T = ApiEnvelope>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: {
    token?: string;
    data?: unknown;
    expectedStatus?: number | number[];
    checkoutSession?: string | false;
    giftPin?: false | string;
  } = {},
): Promise<{ status: number; body: T }> {
  return test.step(`${method} ${path}`, async (step) => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    if (opts.data !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.giftPin !== false) {
      const grant = await ensureGiftPinGrant(request, method, path, opts.giftPin);
      if (grant) headers['X-Gift-Pin-Token'] = grant;
    }
    if (typeof opts.checkoutSession === 'string') {
      headers['X-Checkout-Session'] = opts.checkoutSession;
    } else if (opts.checkoutSession !== false && needsCheckoutSession(method, path, opts.data)) {
      headers['X-Checkout-Session'] = await ensureCheckoutSession(request, opts.token);
    }

    const response = await request.fetch(path, {
      method,
      headers,
      data: opts.data as object | undefined,
      // Avoid a duplicate empty "POST …" protocol step; we attach the exchange below.
    });
    const status = response.status();
    const rawText = await response.text();
    let body: T;
    try {
      body = (rawText ? JSON.parse(rawText) : {}) as T;
    } catch {
      body = { raw: rawText } as T;
    }

    await step.attach(`http → ${status}`, {
      body: prettyJson(
        redactForReport({
          request: { method, path, headers, body: opts.data ?? null },
          response: { status, headers: response.headers(), body },
        }),
      ),
      contentType: 'application/json',
    });

    if (opts.expectedStatus !== undefined) {
      const allowed = Array.isArray(opts.expectedStatus) ? opts.expectedStatus : [opts.expectedStatus];
      if (!allowed.includes(status)) {
        throw new Error(
          `${method} ${path} expected ${allowed.join('|')}, got ${status}: ${rawText.slice(0, 2_000)}`,
        );
      }
    }
    return { status, body };
  });
}

export async function registerUser(
  request: APIRequestContext,
  opts: { email?: string; password?: string; language?: string } = {},
): Promise<{ email: string; password: string; accessToken: string; user: Record<string, unknown> }> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? testPassword;
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { status, body } = await apiJson(request, 'POST', '/auth/register', {
      data: {
        email,
        password,
        gdprConsent: { accepted: true },
        language: opts.language ?? 'fr',
      },
    });
    if (status === 201 && body.accessToken) {
      const guestSession = checkoutSessionMap(request).get('guest');
      if (guestSession) checkoutSessionMap(request).set(body.accessToken, guestSession);
      return {
        email,
        password,
        accessToken: body.accessToken,
        user: (body.user ?? {}) as Record<string, unknown>,
      };
    }
    const code = (body as { error?: { code?: string } }).error?.code;
    if (status === 429 || code === 'rate_limited') {
      await new Promise((r) => setTimeout(r, 1_000 + attempt * 500));
      lastError = new Error(`rate_limited on register (attempt ${attempt + 1})`);
      continue;
    }
    throw new Error(`register failed ${status}: ${JSON.stringify(body)}`);
  }
  throw lastError instanceof Error ? lastError : new Error('register failed after retries');
}

/** Retry once the window clears when the server returns rate_limited. */
export async function apiJsonRetryRateLimit<T = ApiEnvelope>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  opts: {
    token?: string;
    data?: unknown;
    expectedStatus?: number | number[];
    checkoutSession?: string | false;
  } = {},
): Promise<{ status: number; body: T }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = await apiJson<T>(request, method, path, {
      ...opts,
      expectedStatus: undefined,
    });
    const code = (result.body as { error?: { code?: string } }).error?.code;
    const rateLimited = result.status === 429 || code === 'rate_limited';
    if (!rateLimited) {
      if (opts.expectedStatus !== undefined) {
        const allowed = Array.isArray(opts.expectedStatus) ? opts.expectedStatus : [opts.expectedStatus];
        if (!allowed.includes(result.status)) {
          throw new Error(
            `${method} ${path} expected ${allowed.join('|')}, got ${result.status}: ${JSON.stringify(result.body)}`,
          );
        }
      }
      return result;
    }
    lastError = new Error(`${method} ${path} rate_limited (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 1_000 + attempt * 500));
  }
  throw lastError instanceof Error ? lastError : new Error('rate limited');
}

export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
  rememberMe = true,
): Promise<string> {
  const { body } = await apiJson(request, 'POST', '/auth/login', {
    data: { email, password, rememberMe },
    expectedStatus: 200,
  });
  if (!body.accessToken) throw new Error('login missing accessToken');
  return body.accessToken;
}

export async function confirmEmailWithToken(request: APIRequestContext, token: string): Promise<void> {
  await apiJson(request, 'POST', '/auth/confirm-email', {
    data: { token },
    expectedStatus: 200,
  });
}

/** Gallery feed helper — public, lang via query/header as front does. */
export async function fetchGalleryFeed(
  request: APIRequestContext,
  opts: { limit?: number; offset?: number } = {},
): Promise<unknown> {
  const env = loadTestEnv();
  const limit = opts.limit ?? 24;
  const offset = opts.offset ?? 0;
  const { body } = await apiJson(request, 'GET', `/gallery/feed?limit=${limit}&offset=${offset}`, {
    expectedStatus: 200,
  });
  void env;
  return body;
}

/** Courier used by every checkout contract test — the same home-delivery code
 * the functional suite and the load profile drive. */
export const testCourierCode = 'mondial-relay-home';

export interface FeedItem {
  id: string;
  productUid: string;
  title: string;
  available: Record<string, Record<string, Record<string, number>>>;
  lengthsByShape: Record<string, Record<string, string>>;
}

export interface PurchasableVariant {
  productId: string;
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
}

const USER_LIBRARY_UIDS = new Set<string>([E2E_PRODUCT_UIDS.USER_A, E2E_PRODUCT_UIDS.USER_B]);

function e2eProductUidFromOpts(opts: { title?: string; productUid?: string }): string {
  if (opts.productUid) return opts.productUid;
  if (opts.title) {
    const match = (Object.entries(E2E_TITLES) as Array<[E2eProductUid, string]>).find(
      ([, title]) => title === opts.title,
    );
    if (!match) throw new Error(`no E2E product uid for title "${opts.title}"`);
    return match[0];
  }
  return E2E_PRODUCT_UIDS.A1;
}

/** Resolve one in-stock nail variant from the seeded E2E catalogue. Checkout
 * contracts must buy a deterministic product, never whatever the real manager
 * import happens to leave first in the feed. */
export async function pickPurchasableVariant(
  request: APIRequestContext,
  opts: { token?: string; title?: string; productUid?: string } = {},
): Promise<PurchasableVariant> {
  const productUid = e2eProductUidFromOpts(opts);
  let item: FeedItem | undefined;
  if (USER_LIBRARY_UIDS.has(productUid)) {
    const { body } = await apiJson<{ items?: FeedItem[] }>(
      request,
      'GET',
      '/gallery/feed?limit=60&userLibraryOnly=true',
      { token: opts.token, expectedStatus: 200 },
    );
    item = (body.items ?? []).find((candidate) => candidate.productUid === productUid);
  } else {
    const { body } = await apiJson<FeedItem>(
      request,
      'GET',
      `/gallery/set/${encodeURIComponent(productUid)}`,
      { token: opts.token, expectedStatus: 200 },
    );
    item = body;
  }
  if (!item) throw new Error(`no gallery item for ${productUid}`);
  for (const [shapeKey, lengths] of Object.entries(item.available)) {
    for (const [lengthKey, sizes] of Object.entries(lengths)) {
      const size = ['M', 'S', 'L', 'XS'].find((candidate) => (sizes[candidate] ?? 0) > 0);
      if (size) return { productId: item.id, productUid: item.productUid, shapeKey, lengthKey, size };
    }
  }
  throw new Error(`seeded product ${item.productUid} has no purchasable variant`);
}

export interface CreatedAddress {
  id: string;
  kind: string;
  isDefault: boolean;
  savedForFuture: boolean;
}

export async function createAddress(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedAddress> {
  const { body } = await apiJson<{ address?: CreatedAddress }>(request, 'POST', '/account/addresses', {
    token,
    data: {
      kind: 'livraison',
      label: 'Maison E2E',
      recipientName: 'Ada Lovelace',
      line1: '10 rue de Test',
      postalCode: '75001',
      city: 'Paris',
      countryCode: 'FR',
      phone: '+33601020304',
      networkCodes: ['home'],
      ...overrides,
    },
    expectedStatus: 201,
  });
  if (!body.address?.id) throw new Error('address creation returned no id');
  return body.address;
}

export async function createBeHomeAddress(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedAddress> {
  return createAddress(request, token, {
    label: 'Belgique E2E',
    line1: '1 rue Neuve',
    postalCode: '1000',
    city: 'Bruxelles',
    countryCode: 'BE',
    phone: '+32470123456',
    networkCodes: ['home'],
    ...overrides,
  });
}

export async function createBePickupAddress(
  request: APIRequestContext,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<CreatedAddress> {
  return createAddress(request, token, {
    label: 'Point relais BE E2E',
    line1: '12 rue de la Poste',
    postalCode: '1000',
    city: 'Bruxelles',
    countryCode: 'BE',
    phone: '+32470123456',
    networkCodes: ['mondial-relay-point'],
    pickupPoints: { 'mondial-relay-point': { id: 'BE-1000-LOCK' } },
    ...overrides,
  });
}

/** An amount voucher large enough to zero any test cart, so orders can be
 * placed through `POST /account/checkout/free` without Stripe. Per-account
 * cap is disabled so one code can back every order in a spec file. */
export async function createZeroingVoucher(label: string): Promise<string> {
  const created = await initVoucher(
    `e2e-free-${label}-${Date.now().toString(36)}`,
    { kind: 'amount', amount: 99_999 },
    { quantity: 1_000, end: '365d', maxPerUser: 0 },
  );
  const code =
    (created as { voucher?: { code?: string }; code?: string }).voucher?.code ??
    (created as { code?: string }).code;
  if (!code) throw new Error(`voucher init returned no code: ${JSON.stringify(created)}`);
  return code;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  integrityToken: string | null;
  billingSameAsShipping: boolean;
  items: Array<{
    id: string;
    productId: string | null;
    quantity: number;
    origin: 'user' | 'rule';
    locked: boolean;
    lineTotal: number;
    ruleCode: string | null;
  }>;
}

/** Full zero-total checkout: cart line → free confirm. Returns the order plus
 * the address it was shipped to, which later revision tests need. */
export async function placeFreeOrder(
  request: APIRequestContext,
  token: string,
  opts: { voucherCode: string; addressId?: string; quantity?: number },
): Promise<{ order: PlacedOrder; addressId: string; variant: PurchasableVariant }> {
  const variant = await pickPurchasableVariant(request, { token });
  const addressId = opts.addressId ?? (await createAddress(request, token)).id;
  await apiJson(request, 'POST', '/account/cart', {
    token,
    data: {
      productId: variant.productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      quantity: opts.quantity ?? 1,
    },
    expectedStatus: 200,
  });
  const { body } = await apiJson<{ order?: PlacedOrder }>(request, 'POST', '/account/checkout/free', {
    token,
    data: {
      addressId,
      courierCode: testCourierCode,
      express: false,
      voucherCode: opts.voucherCode,
    },
    expectedStatus: 201,
  });
  if (!body.order?.id) throw new Error('free checkout returned no order');
  return { order: body.order, addressId, variant };
}

/** A signed-in account with the application `admin` role. requireAdmin reads
 * the live user row, so the token issued at registration is enough once the
 * operator command has run. */
export async function registerAdmin(
  request: APIRequestContext,
): Promise<{ email: string; password: string; accessToken: string }> {
  const account = await registerUser(request, { email: uniqueEmail('admin') });
  await promoteToAdmin(account.email);
  return { email: account.email, password: account.password, accessToken: account.accessToken };
}

const SHOP_PAYMENT_PATCH = {
  paymentCardEnabled: true,
  paymentPaypalEnabled: true,
  paymentBancontactEnabled: true,
  paymentGooglePayEnabled: true,
  paymentApplePayEnabled: true,
} as const;

/** Checkout / payment-method specs assume shop-wide methods are on.
 * Defaults are all off until an admin enables them — call this once per suite. */
let shopPaymentMethodsEnabled = false;

export async function enableAllShopPaymentMethods(request: APIRequestContext): Promise<void> {
  if (shopPaymentMethodsEnabled) return;
  const admin = await registerAdmin(request);
  await apiJson(request, 'PATCH', '/admin/preferences', {
    token: admin.accessToken,
    data: { ...SHOP_PAYMENT_PATCH },
    expectedStatus: 200,
  });
  shopPaymentMethodsEnabled = true;
}

/** Turn every shop payment method off (or a subset). Used by forbidden-method cases. */
export async function setShopPaymentMethods(
  request: APIRequestContext,
  flags: Partial<{
    paymentCardEnabled: boolean;
    paymentPaypalEnabled: boolean;
    paymentBancontactEnabled: boolean;
    paymentGooglePayEnabled: boolean;
    paymentApplePayEnabled: boolean;
  }>,
): Promise<void> {
  const admin = await registerAdmin(request);
  await apiJson(request, 'PATCH', '/admin/preferences', {
    token: admin.accessToken,
    data: flags,
    expectedStatus: 200,
  });
  // A selective disable invalidates the "all on" cache.
  if (
    flags.paymentCardEnabled === false ||
    flags.paymentPaypalEnabled === false ||
    flags.paymentBancontactEnabled === false ||
    flags.paymentGooglePayEnabled === false ||
    flags.paymentApplePayEnabled === false
  ) {
    shopPaymentMethodsEnabled = false;
  } else if (
    flags.paymentCardEnabled === true &&
    flags.paymentPaypalEnabled === true &&
    flags.paymentGooglePayEnabled === true &&
    flags.paymentApplePayEnabled === true
  ) {
    shopPaymentMethodsEnabled = true;
  }
}
