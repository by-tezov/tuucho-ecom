/**
 * Home-page reviews: only chosen reviews are stored, three at most, the newest
 * choice first, and the oldest is deleted. Candidates are signed the way a
 * scrape signs them, so no call reaches Vinted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/env.js';
import { api, pool, resetDatabase } from './support/stack.js';
import { promoteToAdmin, registerUser, type TestUser } from './support/fixtures.js';

type Review = { id: string; author: string; featuredAt?: string };

let admin: TestUser;
let customer: TestUser;

/** Same claims as the scrape's own signature (vintedReviewsWorkflow.ts). */
function candidateToken(
  id: string,
  overrides: Record<string, unknown> = {},
  secret = config.jwt.secret,
): string {
  return jwt.sign(
    {
      review: {
        feedbackId: id,
        authorVintedId: `10${id}`,
        authorLogin: `buyer${id}`,
        text: 'Parfait',
        rating: 5,
        reviewedAt: '2026-09-25T13:28:17.000Z',
        city: 'Lyon',
        countryCode: 'FR',
        ...overrides,
      },
    },
    secret,
    { algorithm: 'HS256', audience: 'pamsurin-vinted-review', expiresIn: '1h' },
  );
}

async function feature(ids: string[]): Promise<Review[]> {
  const response = await api<{ featured: Review[] }>('POST', '/admin/vinted-reviews/featured', {
    token: admin.accessToken,
    body: { tokens: ids.map((id) => candidateToken(id)) },
    expectStatus: 200,
  });
  return response.body.featured;
}

async function storedIds(): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `select feedback_id::text as id from vinted_reviews order by featured_at desc`,
  );
  return rows.map((row) => row.id);
}

// Integration files share one process (--experimental-test-isolation=none),
// so a top-level hook here would also run before, and wipe, other files'
// fixtures. Each test calls this first instead.
async function setup(): Promise<void> {
  await resetDatabase();
  admin = await registerUser();
  await promoteToAdmin(admin.id);
  customer = await registerUser();
}

test('the administration is admin-only', async () => {
  await setup();
  assert.equal((await api('GET', '/admin/vinted-reviews')).status, 401);
  assert.equal((await api('GET', '/admin/vinted-reviews', { token: customer.accessToken })).status, 403);
});

test('bad input is refused before any call to Vinted', async () => {
  await setup();
  const token = admin.accessToken;
  for (const body of [
    { profileUrl: 'https://evil.example/member/1', count: 5 },
    { profileUrl: 'https://www.vinted.fr/member/1', count: 0 },
    { profileUrl: 'https://www.vinted.fr/member/1', count: 31 },
  ]) {
    const response = await api('POST', '/admin/vinted-reviews/scrape', { token, body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  for (const tokens of [[], ['a', 'b', 'c', 'd'], [42], [candidateToken('11'), candidateToken('11')]]) {
    const response = await api('POST', '/admin/vinted-reviews/featured', { token, body: { tokens } });
    assert.equal(response.status, 400, JSON.stringify(tokens).slice(0, 80));
  }
  const locate = await api('POST', '/admin/vinted-reviews/locate', {
    token,
    body: { profileUrl: 'https://www.vinted.fr/member/1', token: 'forged' },
  });
  assert.equal(locate.status, 400);
  assert.deepEqual(await storedIds(), []);
});

test('a review not signed by this server is refused', async () => {
  await setup();
  for (const forged of [
    candidateToken('11', {}, 'not-the-secret'),
    candidateToken('11', { text: '' }),
    jwt.sign({ sub: admin.id }, config.jwt.secret),
  ]) {
    const response = await api<{ error: { code: string } }>('POST', '/admin/vinted-reviews/featured', {
      token: admin.accessToken,
      body: { tokens: [forged] },
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_review_token');
  }
  assert.deepEqual(await storedIds(), []);
});

test('a new selection replaces the oldest, and only the chosen are stored', async () => {
  await setup();
  const empty = await api<{ reviews: Review[] }>('GET', '/reviews', { expectStatus: 200 });
  assert.deepEqual(empty.body.reviews, []);

  await feature(['11', '12']);
  const featured = await feature(['13', '14']);
  assert.deepEqual(
    featured.map((review) => review.id),
    ['13', '14', '11'],
  );
  assert.deepEqual(await storedIds(), ['13', '14', '11']);

  const home = await api<{ reviews: Review[] }>('GET', '/reviews', { expectStatus: 200 });
  assert.deepEqual(
    home.body.reviews.map((review) => review.id),
    ['13', '14', '11'],
  );
  assert.equal('featuredAt' in home.body.reviews[0]!, false);
  assert.equal(home.headers.get('cache-control'), 'no-cache');
});

test('removing a featured review deletes it', async () => {
  await setup();
  const token = admin.accessToken;
  await feature(['11', '12', '13']);
  await api('DELETE', '/admin/vinted-reviews/featured/12', { token, expectStatus: 200 });
  assert.equal((await api('DELETE', '/admin/vinted-reviews/featured/12', { token })).status, 404);
  assert.deepEqual(await storedIds(), ['11', '13']);
  const list = await api<{ featured: Review[] }>('GET', '/admin/vinted-reviews', {
    token,
    expectStatus: 200,
  });
  assert.deepEqual(
    list.body.featured.map((review) => review.id),
    ['11', '13'],
  );
});

test("a scraped rating is applied only from this server's signature", async () => {
  await setup();
  const token = admin.accessToken;
  const before = await api<{ rating: unknown }>('GET', '/reviews', { expectStatus: 200 });
  assert.equal(before.body.rating, null);

  const signed = jwt.sign({ rating: { rating: '4.9', reviewCount: 107 } }, config.jwt.secret, {
    algorithm: 'HS256',
    audience: 'pamsurin-vinted-rating',
    expiresIn: '1h',
  });
  // A review candidate token is not a rating token.
  const wrongKind = await api('PUT', '/admin/vinted-reviews/rating', {
    token,
    body: { token: candidateToken('11') },
  });
  assert.equal(wrongKind.status, 400);
  assert.equal((await api('PUT', '/admin/vinted-reviews/rating', { body: { token: signed } })).status, 401);

  await api('PUT', '/admin/vinted-reviews/rating', { token, body: { token: signed }, expectStatus: 200 });
  const after = await api<{ rating: unknown }>('GET', '/reviews', { expectStatus: 200 });
  assert.deepEqual(after.body.rating, { rating: '4.9', reviewCount: 107 });
  const admin_ = await api<{ rating: { rating: string } }>('GET', '/admin/vinted-reviews', {
    token,
    expectStatus: 200,
  });
  assert.equal(admin_.body.rating.rating, '4.9');
});

test('a choice is stored untranslated, and a stored translation survives a re-choice', async () => {
  await setup();
  const token = admin.accessToken;
  const first = await api<{ untranslated: string[] }>('POST', '/admin/vinted-reviews/featured', {
    token,
    body: { tokens: [candidateToken('11')] },
    expectStatus: 200,
  });
  assert.deepEqual(first.body.untranslated, ['11']);
  // Test reviews carry no source language, so translation stops before any
  // call to MyMemory.
  const noLang = await api('POST', '/admin/vinted-reviews/featured/11/translate', { token, body: {} });
  assert.equal(noLang.status, 400);
  const retry = await api<{ error: { code: string; reason: string } }>(
    'POST',
    '/admin/vinted-reviews/featured/11/translate',
    { token, body: { lang: 'en' } },
  );
  assert.equal(retry.status, 502);
  assert.equal(retry.body.error.reason, 'source_unknown');

  await pool.query(
    `update vinted_reviews set source_lang = 'fr', translations = '{"en":"Perfect"}'::jsonb where feedback_id = 11`,
  );
  await feature(['11']);
  const home = await api<{ reviews: { sourceLang: string | null; translations: Record<string, string> }[] }>(
    'GET',
    '/reviews',
    { expectStatus: 200 },
  );
  assert.equal(home.body.reviews[0]!.sourceLang, 'fr');
  assert.deepEqual(home.body.reviews[0]!.translations, { en: 'Perfect' });
});
