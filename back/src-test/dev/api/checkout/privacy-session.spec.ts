import { expect, test } from 'patchright/test';
import { pool } from '../../../../src/db/pool.js';
import { hashOpaqueToken } from '../../../../src/platform/security/opaqueToken.js';
import { apiJson, registerUser } from '../../support/api.js';

interface SessionBody {
  token?: string;
  vaultKey?: string;
  expiresAt?: string;
  idleTimeoutMs?: number;
  resumed?: boolean;
  expired?: boolean;
  error?: { code?: string };
}

const addressInput = {
  kind: 'livraison',
  label: 'Session E2E',
  recipientName: 'Ada Lovelace',
  line1: '10 rue de Test',
  postalCode: '75001',
  city: 'Paris',
  countryCode: 'FR',
  phone: '+33601020304',
  networkCodes: ['home'],
};

test.describe('checkout privacy sessions', () => {
  test('guest session: resumes across refresh and reports authoritative expiry', async ({ request }) => {
    const { body: first } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      checkoutSession: false,
      expectedStatus: 200,
    });
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(first.vaultKey!, 'base64')).toHaveLength(32);
    expect(first.idleTimeoutMs).toBe(45 * 60 * 1000);
    expect(first.resumed).toBe(false);

    const { body: resumed } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      checkoutSession: first.token!,
      expectedStatus: 200,
    });
    expect(resumed.token).toBe(first.token);
    expect(resumed.vaultKey).toBe(first.vaultKey);
    expect(resumed.resumed).toBe(true);

    for (let index = 0; index < 10; index += 1) {
      await apiJson(request, 'POST', '/checkout/session/payment-methods', {
        checkoutSession: first.token!,
        data: { paymentMethodId: `pm_capacity_${index}` },
        expectedStatus: 201,
      });
    }
    const { body: capped } = await apiJson<SessionBody>(
      request,
      'POST',
      '/checkout/session/payment-methods',
      {
        checkoutSession: first.token!,
        data: { paymentMethodId: 'pm_capacity_10' },
        expectedStatus: 409,
      },
    );
    expect(capped.error?.code).toBe('checkout_session_payment_method_limit');

    await pool.query(
      `update checkout_privacy_sessions
          set expires_at = now() - interval '1 second'
        where token_hash = $1`,
      [hashOpaqueToken(first.token!)],
    );
    const { body: expired } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/touch', {
      checkoutSession: first.token!,
      expectedStatus: 401,
    });
    expect(expired.error?.code).toBe('checkout_session_expired');

    const { body: replacement } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      checkoutSession: first.token!,
      expectedStatus: 200,
    });
    expect(replacement.token).not.toBe(first.token);
    expect(replacement.expired).toBe(true);
  });

  test('a new authenticated session: drops one-time data but keeps remembered data', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { body: first } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      token: accessToken,
      checkoutSession: false,
      expectedStatus: 200,
    });

    const { body: oneTime } = await apiJson<{ address?: { id?: string } }>(
      request,
      'POST',
      '/account/addresses',
      {
        token: accessToken,
        checkoutSession: first.token!,
        data: { ...addressInput, savedForFuture: false },
        expectedStatus: 201,
      },
    );
    const { body: remembered } = await apiJson<{ address?: { id?: string } }>(
      request,
      'POST',
      '/account/addresses',
      {
        token: accessToken,
        data: { ...addressInput, label: 'Saved E2E', line1: '11 rue de Test', savedForFuture: true },
        expectedStatus: 201,
      },
    );
    expect(oneTime.address?.id).toBeTruthy();
    expect(remembered.address?.id).toBeTruthy();

    const { body: fresh } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      token: accessToken,
      checkoutSession: false,
      expectedStatus: 200,
    });
    expect(fresh.token).not.toBe(first.token);

    await apiJson(request, 'GET', `/account/addresses/${oneTime.address!.id}`, {
      token: accessToken,
      checkoutSession: fresh.token!,
      expectedStatus: 404,
    });
    await apiJson(request, 'GET', `/account/addresses/${remembered.address!.id}`, {
      token: accessToken,
      checkoutSession: fresh.token!,
      expectedStatus: 200,
    });
  });

  test('guest session bearer: becomes account-only when the tab signs in', async ({ request }) => {
    const { body: guest } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      checkoutSession: false,
      expectedStatus: 200,
    });
    const { accessToken } = await registerUser(request);

    const { body: bound } = await apiJson<SessionBody>(request, 'POST', '/checkout/session/start', {
      token: accessToken,
      checkoutSession: guest.token!,
      expectedStatus: 200,
    });
    expect(bound.resumed).toBe(true);
    expect(bound.token).toBe(guest.token);

    const { body: anonymousReuse } = await apiJson<SessionBody>(
      request,
      'POST',
      '/checkout/session/payment-methods',
      {
        checkoutSession: guest.token!,
        data: { paymentMethodId: 'pm_cannot_cross_audience' },
        expectedStatus: 409,
      },
    );
    expect(anonymousReuse.error?.code).toBe('checkout_session_audience_mismatch');
  });
});
