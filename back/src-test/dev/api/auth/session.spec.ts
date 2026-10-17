import { test, expect, request as apiRequest } from 'patchright/test';
import {
  apiJson,
  apiJsonRetryRateLimit,
  loginUser,
  registerUser,
  uniqueEmail,
} from '../../support/api.js';
import { loadTestEnv, testPassword } from '../../support/env.js';
import { extractTokenFromMail, waitForMail } from '../../support/mail.js';

/** Session lifecycle around the refresh cookie, plus the auth entry points the
 * existing suite never exercised: the OTP-skip signup, the single-call cart
 * sign-in, and email confirmation resend/replay. */
test.describe('API auth session', () => {
  test('refresh: rejects an explicit cross-site browser request before rotating the cookie', async ({ request }) => {
    await registerUser(request);
    const response = await request.post('/auth/refresh', {
      headers: { 'sec-fetch-site': 'cross-site' },
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { code: 'csrf_rejected' },
    });
    // Rejection happens before rotation: the same cookie must still work in
    // the legitimate same-site flow.
    await apiJson(request, 'POST', '/auth/refresh', { expectedStatus: 200 });
  });

  test('refresh: treats malformed cookie encoding as an invalid session instead of a server error', async () => {
    const env = loadTestEnv();
    const malformed = await apiRequest.newContext({
      baseURL: env.apiBaseUrl,
      extraHTTPHeaders: { Cookie: 'refresh_token=%E0%A4%A' },
    });
    try {
      const { body } = await apiJson<{ error?: { code?: string } }>(malformed, 'POST', '/auth/refresh', {
        expectedStatus: 401,
      });
      expect(body.error?.code).toBe('no_session');
    } finally {
      await malformed.dispose();
    }
  });

  test('refresh: rotates the cookie, a replayed token kills the family, logout ends the session', async ({ request }) => {
    const env = loadTestEnv();
    await registerUser(request);

    // The refresh token is an httpOnly cookie, so the rotation contract is
    // only observable by keeping the pre-rotation jar aside.
    const beforeRotation = await request.storageState();
    const { body: rotated } = await apiJsonRetryRateLimit<{
      user?: { email?: string; hasPassword?: boolean };
      accessToken?: string;
      accessTokenExpiresAt?: string;
    }>(request, 'POST', '/auth/refresh', { expectedStatus: 200 });
    expect(rotated.accessToken).toBeTruthy();
    expect(rotated.accessTokenExpiresAt).toBeTruthy();
    // The front finishes silent session restore from this body alone.
    expect(rotated.user?.email).toBeTruthy();
    expect(rotated.user?.hasPassword).toBe(true);

    const replay = await apiRequest.newContext({
      baseURL: env.apiBaseUrl,
      storageState: beforeRotation,
    });
    try {
      const { body: reused } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
        replay,
        'POST',
        '/auth/refresh',
        { expectedStatus: 401 },
      );
      expect(reused.error?.code).toBe('session_reused');
    } finally {
      await replay.dispose();
    }

    // Replay is treated as theft: the whole rotation family is revoked, so
    // even the legitimately rotated cookie stops working — it is now part of
    // a family that was already replayed.
    const { body: afterTheft } = await apiJsonRetryRateLimit<{
      error?: { code?: string };
      accessToken?: string;
    }>(request, 'POST', '/auth/refresh', { expectedStatus: 401 });
    expect(afterTheft.accessToken).toBeUndefined();
    expect(['session_reused', 'invalid_session']).toContain(afterTheft.error?.code);

    const anonymous = await apiRequest.newContext({ baseURL: env.apiBaseUrl });
    try {
      const { body: noCookie } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
        anonymous,
        'POST',
        '/auth/refresh',
        { expectedStatus: 401 },
      );
      expect(noCookie.error?.code).toBe('no_session');
    } finally {
      await anonymous.dispose();
    }
  });

  test('logout: revokes the refresh cookie it was sent with', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    await apiJson(request, 'POST', '/auth/logout', { token: accessToken, expectedStatus: 200 });
    const { body } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/refresh',
      { expectedStatus: 401 },
    );
    // The cookie was cleared client-side and revoked server-side; either
    // outcome is a dead session, never a fresh access token.
    expect(['no_session', 'invalid_session']).toContain(body.error?.code);
  });

  test('register-otp-skip: creates a usable passwordless account and refuses a taken address', async ({ request }) => {
    const email = uniqueEmail('otp-skip');
    const sinceMs = Date.now() - 500;
    const { body: created } = await apiJsonRetryRateLimit<{
      created?: boolean;
      accessToken?: string;
      user?: { email?: string; hasPassword?: boolean; emailVerified?: boolean };
    }>(request, 'POST', '/auth/register-otp-skip', {
      data: { email, gdprConsent: { accepted: true }, language: 'fr' },
      expectedStatus: 201,
    });
    expect(created.created).toBe(true);
    expect(created.accessToken).toBeTruthy();
    expect(created.user?.email).toBe(email);
    // "Confirm my email later" — the account exists and works right away, but
    // it is unverified and has no password.
    expect(created.user?.hasPassword).toBe(false);
    expect(created.user?.emailVerified).toBe(false);

    await apiJson(request, 'GET', '/account/profile', {
      token: created.accessToken,
      expectedStatus: 200,
    });

    // A real confirmation link still goes out, and confirming it flips the
    // account to verified without changing the address.
    const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    const token = extractTokenFromMail(mail);
    const { body: confirmed } = await apiJsonRetryRateLimit<{
      emailChanged?: boolean;
      alreadyVerified?: boolean;
    }>(request, 'POST', '/auth/confirm-email', { data: { token }, expectedStatus: 200 });
    expect(confirmed.emailChanged).toBe(false);
    expect(confirmed.alreadyVerified).toBe(false);

    // Re-clicking the same link (mail prefetch, a second tap) must stay a
    // success and say so, not look like a broken token.
    const { body: replayed } = await apiJsonRetryRateLimit<{ alreadyVerified?: boolean }>(
      request,
      'POST',
      '/auth/confirm-email',
      { data: { token }, expectedStatus: 200 },
    );
    expect(replayed.alreadyVerified).toBe(true);

    const { body: profile } = await apiJson<{ user?: { emailVerified?: boolean } }>(
      request,
      'GET',
      '/account/profile',
      { token: created.accessToken, expectedStatus: 200 },
    );
    expect(profile.user?.emailVerified).toBe(true);

    // An existing account can never be entered through this escape hatch.
    const { body: duplicate } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/register-otp-skip',
      {
        data: { email, gdprConsent: { accepted: true }, language: 'fr' },
        expectedStatus: 409,
      },
    );
    expect(duplicate.error?.code).toBe('email_already_used');
  });

  test('confirm-email: rejects a token it cannot resolve', async ({ request }) => {
    const { body: missing } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/confirm-email',
      { data: {}, expectedStatus: 400 },
    );
    expect(missing.error?.code).toBe('invalid_request');

    const { body: unknown } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/confirm-email',
      { data: { token: 'not-a-real-confirmation-token' }, expectedStatus: 400 },
    );
    expect(unknown.error?.code).toBe('invalid_or_expired_token');
  });

  test('resend-email-confirmation: it re-sends to the account address', async ({ request }) => {
    const { email, accessToken } = await registerUser(request);
    const sinceMs = Date.now() + 100;
    // Wait past the registration mail so the assertion cannot pass on it.
    await new Promise((resolve) => setTimeout(resolve, 250));
    await apiJsonRetryRateLimit(request, 'POST', '/auth/resend-email-confirmation', {
      token: accessToken,
      expectedStatus: 200,
    });
    const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    expect(extractTokenFromMail(mail)).toBeTruthy();

    await apiJsonRetryRateLimit(request, 'POST', '/auth/resend-email-confirmation', {
      expectedStatus: 401,
    });
  });

  test('login-or-register: creates on a new address and signs in on a known one', async ({ request }) => {
    const email = uniqueEmail('cart-auth');

    // Create branch: this is the in-cart sign-in step, so it must not force
    // the client to probe whether the address exists first.
    const { body: created } = await apiJsonRetryRateLimit<{
      created?: boolean;
      accessToken?: string;
      user?: { email?: string; hasPassword?: boolean };
    }>(request, 'POST', '/auth/login-or-register', {
      data: {
        email,
        password: testPassword,
        gdprConsent: { accepted: true },
        rememberMe: false,
        language: 'fr',
      },
      expectedStatus: 201,
    });
    expect(created.created).toBe(true);
    expect(created.user?.email).toBe(email);
    expect(created.user?.hasPassword).toBe(true);
    expect(created.accessToken).toBeTruthy();

    // Login branch: the same call, without GDPR consent, now signs in.
    const { body: signedIn } = await apiJsonRetryRateLimit<{
      created?: boolean;
      accessToken?: string;
      reactivated?: boolean;
    }>(request, 'POST', '/auth/login-or-register', {
      data: { email, password: testPassword, rememberMe: true },
      expectedStatus: 200,
    });
    expect(signedIn.created).toBe(false);
    expect(signedIn.reactivated).toBe(false);
    expect(signedIn.accessToken).toBeTruthy();

    // A wrong password on a known address must not fall through to the
    // create branch (which would silently reset the account's password).
    const { body: wrongPassword } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/login-or-register',
      {
        data: { email, password: 'E2eWrong9!', gdprConsent: { accepted: true }, rememberMe: false },
        expectedStatus: 401,
      },
    );
    expect(wrongPassword.error?.code).toBe('invalid_credentials');
    expect(await loginUser(request, email, testPassword)).toBeTruthy();

    // The create branch still enforces consent and password complexity.
    const { body: noConsent } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/login-or-register',
      {
        data: { email: uniqueEmail('cart-auth-noconsent'), password: testPassword, rememberMe: false },
        expectedStatus: 400,
      },
    );
    expect(noConsent.error?.code).toBe('invalid_request');

    const { body: weak } = await apiJsonRetryRateLimit<{
      error?: { code?: string; violations?: string[] };
    }>(request, 'POST', '/auth/login-or-register', {
      data: {
        email: uniqueEmail('cart-auth-weak'),
        password: 'short',
        gdprConsent: { accepted: true },
        rememberMe: false,
      },
      expectedStatus: 400,
    });
    expect(weak.error?.code).toBe('weak_password');
    expect(Array.isArray(weak.error?.violations)).toBe(true);
  });

  test('a temporary lockout: refuses every password like an unknown email', async ({ request }) => {
    const configuredMaxAttempts = Number(process.env.LOGIN_LOCKOUT?.split(':')[1]);
    expect(Number.isSafeInteger(configuredMaxAttempts)).toBe(true);
    expect(configuredMaxAttempts).toBeGreaterThan(0);

    const { email } = await registerUser(request);
    for (let attempt = 0; attempt < configuredMaxAttempts; attempt += 1) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/auth/login', {
        data: { email, password: 'E2eWrong9!', rememberMe: false },
        expectedStatus: 401,
      });
      expect(body.error?.code).toBe('invalid_credentials');
    }

    // During the window every password, the right one included, gets the
    // same 401 as an unknown address: a 423 would confirm the account exists
    // and a hit would let a guesser through. The owner recovers through OTP
    // or social sign-in, which this window does not block.
    for (const password of ['E2eWrong9!', testPassword]) {
      const { body } = await apiJson<{ error?: { code?: string } }>(request, 'POST', '/auth/login', {
        data: { email, password, rememberMe: false },
        expectedStatus: 401,
      });
      expect(body.error?.code).toBe('invalid_credentials');
    }
  });

  test('manage-guest-order: refuses a token it cannot resolve', async ({ request }) => {
    const { body: missing } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/manage-guest-order',
      { data: {}, expectedStatus: 400 },
    );
    expect(missing.error?.code).toBe('invalid_request');

    const { body: unknown } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/manage-guest-order',
      { data: { token: 'not-a-real-manage-order-token' }, expectedStatus: 400 },
    );
    expect(unknown.error?.code).toBe('invalid_or_expired_token');
  });

  test('lock-account: refuses a token it cannot resolve', async ({ request }) => {
    const { body: missing } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/lock-account',
      { data: {}, expectedStatus: 400 },
    );
    expect(missing.error?.code).toBe('invalid_request');

    const { body: unknown } = await apiJsonRetryRateLimit<{ error?: { code?: string } }>(
      request,
      'POST',
      '/auth/lock-account',
      { data: { token: 'not-a-real-lock-token' }, expectedStatus: 400 },
    );
    expect(unknown.error?.code).toBe('invalid_or_expired_token');
  });
});
