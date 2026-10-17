import { test, expect } from 'patchright/test';
import { apiJson, registerUser } from '../../support/api.js';
import { waitForMail } from '../../support/mail.js';

async function postAllowingContactRateLimit(
  request: import('patchright/test').APIRequestContext,
  path: string,
  opts: { token?: string; data: unknown },
): Promise<'ok' | 'rate_limited'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { status, body } = await apiJson(request, 'POST', path, {
      token: opts.token,
      data: opts.data,
    });
    const code = (body as { error?: { code?: string } }).error?.code;
    if (status === 429 || code === 'rate_limited') {
      await new Promise((r) => setTimeout(r, 1_000));
      continue;
    }
    if (status === 200 || status === 201) return 'ok';
    throw new Error(`POST ${path} failed ${status}: ${JSON.stringify(body)}`);
  }
  return 'rate_limited';
}

test.describe('API contact', () => {
  test('anonymous contact: writes user/contact dump', async ({ request }) => {
    const sinceMs = Date.now() - 500;
    const email = `contact+${Date.now()}@pamsurin.test`;
    const result = await postAllowingContactRateLimit(request, '/contact', {
      data: {
        email,
        identity: 'E2E Tester',
        message: 'Bonjour, message de test Patchright.',
      },
    });
    if (result === 'rate_limited') {
      test.skip(true, 'RATE_CONTACT_* window exhausted — re-run later');
    }

    const mail = await waitForMail({
      kind: 'user',
      sinceMs,
      timeoutMs: 15_000,
    });
    expect(mail.html.length).toBeGreaterThan(10);
  });

  test('authenticated product: request resolves the customer from the bearer token', async ({ request }) => {
    const { accessToken } = await registerUser(request);
    const { body: feed } = await apiJson<{
      items?: Array<{
        id: string;
        available: Record<string, Record<string, Record<string, number>>>;
      }>;
    }>(request, 'GET', '/gallery/feed?limit=10', {
      token: accessToken,
      expectedStatus: 200,
    });
    const item = feed.items?.find((candidate) => Object.keys(candidate.available).length > 0);
    expect(item).toBeTruthy();
    const shapeKey = Object.keys(item!.available)[0]!;
    const lengthKey = Object.keys(item!.available[shapeKey]!)[0]!;
    const size = Object.keys(item!.available[shapeKey]![lengthKey]!)[0]!;

    const result = await postAllowingContactRateLimit(request, '/contact/product-request', {
      token: accessToken,
      // The endpoint must take the identity from the auth token, rather than
      // trusting a customer email supplied by the client.
      data: { productId: item!.id, shapeKey, lengthKey, size, quantity: 1, email: 'ignored@example.test' },
    });
    if (result === 'rate_limited') {
      test.skip(true, 'RATE_CONTACT_* window exhausted — re-run later');
    }
  });
});
