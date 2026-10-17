import { check } from 'k6';
import {
  accessTokenFrom,
  loadPassword,
  login,
  register,
  uniqueEmail,
} from '../_lib/auth.ts';
import {
  apiBaseUrl,
  deleteJson,
  getJson,
  patchJson,
  postJson,
  putJson,
  successEnvelope,
} from '../_lib/http.ts';
import { waitForOtp, waitForToken } from '../_lib/mail.ts';
import { pickFromPool, type LoadSetupData } from '../_lib/types.ts';

function accountSurface(baseUrl: string, token: string, catalog: LoadSetupData['catalog']): void {
  const profile = getJson(baseUrl, '/account/profile', 'account_profile', successEnvelope, token);
  const user = (profile.body as { user?: { firstName?: string | null; lastName?: string | null; phone?: string | null } } | null)?.user;
  const needsInitialProfile =
    !user?.firstName && !user?.lastName && (user?.phone == null || user.phone === '');
  if (needsInitialProfile) {
    patchJson(
      baseUrl,
      '/account/profile',
      'account_profile_patch',
      { firstName: 'Load', lastName: `VU${__VU}` },
      { status: 200, body: successEnvelope },
      token,
    );
  }

  putJson(
    baseUrl,
    '/account/preferences/language',
    'account_language',
    { language: 'fr' },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/notification-preferences', 'account_notif_get', successEnvelope, token);
  putJson(
    baseUrl,
    '/account/notification-preferences',
    'account_notif_put',
    { channel: 'nouveautes', enabled: true },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/recent-logins', 'account_recent_logins', successEnvelope, token);

  const address = postJson(
    baseUrl,
    '/account/addresses',
    'account_address_create',
    {
      kind: 'livraison',
      label: `Load ${Date.now()}`,
      recipientName: 'Auth Load',
      line1: '11 rue Auth',
      postalCode: '75002',
      city: 'Paris',
      countryCode: 'FR',
      networkCodes: ['home'],
      isDefault: false,
    },
    {
      status: [200, 201],
      body: (body) => Boolean((body as { address?: { id?: string } })?.address?.id),
    },
    token,
  );
  const addressId = (address.body as { address?: { id?: string } } | null)?.address?.id;
  getJson(baseUrl, '/account/addresses', 'account_addresses_list', successEnvelope, token);
  if (addressId) {
    patchJson(
      baseUrl,
      `/account/addresses/${addressId}`,
      'account_address_patch',
      { label: 'Load patched' },
      { status: 200, body: successEnvelope },
      token,
    );
    deleteJson(
      baseUrl,
      `/account/addresses/${addressId}`,
      'account_address_delete',
      { status: [200, 204], body: () => true },
      token,
    );
  }

  postJson(
    baseUrl,
    '/account/favorites',
    'account_favorite_add',
    { productId: catalog.productId, shapeKey: catalog.shapeKey, lengthKey: catalog.lengthKey },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/favorites', 'account_favorites', successEnvelope, token);
  postJson(
    baseUrl,
    '/account/cart',
    'account_cart_add',
    {
      productId: catalog.productId,
      shapeKey: catalog.shapeKey,
      lengthKey: catalog.lengthKey,
      size: catalog.size,
      quantity: 1,
    },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/cart', 'account_cart_get', successEnvelope, token);
  getJson(baseUrl, '/account/carts', 'account_carts_list', successEnvelope, token);
  getJson(baseUrl, '/account/orders', 'account_orders', successEnvelope, token);
  getJson(baseUrl, '/account/checkout/selection', 'account_checkout_selection_get', successEnvelope, token);
}

/** Password register under VU load (not only setup), then logout. */
function createAccountPassword(baseUrl: string): { email: string; token: string } {
  const email = uniqueEmail('vu-reg');
  const created = register(baseUrl, email);
  const token = accessTokenFrom(created.body);
  if (token) {
    postJson(baseUrl, '/auth/logout', 'auth_logout', {}, { status: 200, body: successEnvelope }, token);
  }
  return { email, token };
}

/**
 * Guest cart → OTP signup → import-guest (front "create account from cart" path).
 * OTP is read from disposable DEV email dumps via the load mail helper.
 */
function createAccountFromCartOtp(baseUrl: string, catalog: LoadSetupData['catalog']): void {
  const email = uniqueEmail('vu-otp-cart');
  const sinceMs = Date.now() - 5_000;
  const requested = postJson(
    baseUrl,
    '/auth/request-otp',
    'auth_otp_signup_request',
    {
      email,
      purpose: 'signup',
      gdprConsent: { accepted: true },
      language: 'fr',
    },
    { status: 200, body: successEnvelope },
  );
  if (!requested.ok) return;
  const code = waitForOtp(email, sinceMs);
  check(code, { auth_otp_signup_mail: (value) => Boolean(value) });
  if (!code) return;
  const verified = postJson(
    baseUrl,
    '/auth/verify-otp',
    'auth_otp_signup_verify',
    { email, code, purpose: 'signup', rememberMe: false },
    {
      status: [200, 201],
      body: (body) => successEnvelope(body) && Boolean((body as { accessToken?: string }).accessToken),
    },
  );
  const token = accessTokenFrom(verified.body);
  if (!token) return;

  postJson(
    baseUrl,
    '/account/carts/import-guest',
    'account_import_guest',
    {
      mode: 'new',
      name: `Load cart ${__VU}`,
      items: [
        {
          productId: catalog.productId,
          shapeKey: catalog.shapeKey,
          lengthKey: catalog.lengthKey,
          size: catalog.size,
          quantity: 1,
        },
      ],
    },
    { status: 200, body: successEnvelope },
    token,
  );
  getJson(baseUrl, '/account/cart', 'account_cart_after_import', successEnvelope, token);
  postJson(baseUrl, '/auth/logout', 'auth_logout_after_otp', {}, { status: 200, body: successEnvelope }, token);
}

/** Login OTP for an existing password account. */
function loginWithOtp(baseUrl: string, email: string): void {
  // Wide enough that a slow VU clock vs file mtime cannot miss the dump.
  const sinceMs = Date.now() - 5_000;
  const requested = postJson(
    baseUrl,
    '/auth/request-otp',
    'auth_otp_login_request',
    { email, purpose: 'login' },
    { status: 200, body: successEnvelope },
  );
  if (!requested.ok) return;
  const code = waitForOtp(email, sinceMs);
  check(code, { auth_otp_login_mail: (value) => Boolean(value) });
  if (!code) return;
  postJson(
    baseUrl,
    '/auth/verify-otp',
    'auth_otp_login_verify',
    { email, code, purpose: 'login', rememberMe: false },
    {
      status: 200,
      body: (body) => successEnvelope(body) && Boolean((body as { accessToken?: string }).accessToken),
    },
  );
}

/** Forgot-password request + confirm with token from mail, then login with new password. */
function forgotPasswordFlow(baseUrl: string, email: string): void {
  const sinceMs = Date.now() - 5_000;
  const requested = postJson(
    baseUrl,
    '/auth/request-password-reset',
    'auth_request_password_reset',
    { email },
    { status: 200, body: successEnvelope },
  );
  if (!requested.ok) return;
  const token = waitForToken(email, sinceMs);
  check(token, { auth_reset_token_mail: (value) => Boolean(value) });
  if (!token) return;
  const newPassword = `${loadPassword()}Z`;
  postJson(
    baseUrl,
    '/auth/confirm-password-reset',
    'auth_confirm_password_reset',
    { token, newPassword },
    { status: 200, body: successEnvelope },
  );
  // Restore a known password for later pooled logins by registering is done;
  // pooled users that hit this path get a rotated password — prefer fresh emails.
  postJson(
    baseUrl,
    '/auth/login',
    'auth_login_after_reset',
    { email, password: newPassword },
    {
      status: 200,
      body: (body) => successEnvelope(body) && Boolean((body as { accessToken?: string }).accessToken),
    },
  );
}

/**
 * Authenticated account surface + VU-path create/login/forgot/OTP-from-cart.
 * Setup still pre-warms a pool; each iteration also creates accounts under load.
 */
export function authAccount(data: LoadSetupData): void {
  const baseUrl = apiBaseUrl();
  const catalog = data.catalog;
  const pooled = pickFromPool(data.authUsers);

  // --- Create under load (not setup-only) ---
  if (__ITER % 2 === 0) {
    createAccountPassword(baseUrl);
  } else {
    createAccountFromCartOtp(baseUrl, catalog);
  }

  // --- Password login + account CRUD on pooled user ---
  const loggedIn = login(baseUrl, pooled.email);
  const token = accessTokenFrom(loggedIn.body) || pooled.accessToken;
  accountSurface(baseUrl, token, catalog);

  // --- Login OTP on a fresh password account (never share pooled emails across VUs) ---
  if (__ITER % 3 === 0) {
    const { email, token: registered } = createAccountPassword(baseUrl);
    // Anti-enumeration: login OTP for an unknown address returns success with
    // no mail. Only poll when register actually created the account.
    if (registered) loginWithOtp(baseUrl, email);
  }

  // --- Forgot password on a fresh password account ---
  if (__ITER % 4 === 0) {
    const { email, token: registered } = createAccountPassword(baseUrl);
    if (registered) forgotPasswordFlow(baseUrl, email);
  }

  postJson(baseUrl, '/auth/refresh', 'auth_refresh', {}, { status: [200, 401], body: () => true });
}
