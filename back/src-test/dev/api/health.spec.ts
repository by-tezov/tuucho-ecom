import { test, expect } from 'patchright/test';

test.describe('API health', () => {
  test('healthz: confirms the server remains reachable without an authenticated session', async ({ request }) => {
    const response = await request.get('/healthz', { headers: { Accept: 'application/json' } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
