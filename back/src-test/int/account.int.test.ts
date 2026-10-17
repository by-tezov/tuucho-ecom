/**
 * Registration, session and cart, at the HTTP boundary against a real
 * database.
 *
 * These are the paths `application/` and `infrastructure/` own: encrypted
 * identity columns, the blind index that makes a login lookup possible, and
 * the server-side cart. None of it is reachable from a pure domain test, and
 * until this rung existed the only proof was the browser suite.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { api, resetDatabase } from './support/stack.js';
import { createProduct, registerUser, TEST_PASSWORD, uniqueEmail } from './support/fixtures.js';

beforeEach(async () => {
  await resetDatabase();
});

test('a registration is readable back through its own access token', async () => {
  const user = await registerUser();
  const profile = await api<{ success: boolean; user: { email: string } }>('GET', '/account/profile', {
    token: user.accessToken,
    expectStatus: 200,
  });
  assert.equal(profile.body.user.email, user.email);
});

test('the same address cannot register twice', async () => {
  const email = uniqueEmail('duplicate');
  await registerUser({ email });
  const second = await api<{ error?: { code?: string } }>('POST', '/auth/register', {
    body: { email, password: TEST_PASSWORD, gdprConsent: { accepted: true }, language: 'fr' },
  });
  assert.equal(second.status >= 400, true, 'a duplicate registration must not succeed');
});

test('login finds an account whose email column is encrypted', async () => {
  const user = await registerUser();
  const login = await api<{ accessToken?: string }>('POST', '/auth/login', {
    body: { email: user.email, password: TEST_PASSWORD },
    expectStatus: 200,
  });
  assert.equal(typeof login.body.accessToken, 'string');
});

test('login refuses the wrong password without leaking whether the account exists', async () => {
  const user = await registerUser();
  const wrongPassword = await api<{ error?: { code?: string } }>('POST', '/auth/login', {
    body: { email: user.email, password: 'NotThePassword123!' },
  });
  const unknownAccount = await api<{ error?: { code?: string } }>('POST', '/auth/login', {
    body: { email: uniqueEmail('never-registered'), password: TEST_PASSWORD },
  });
  assert.equal(wrongPassword.status, unknownAccount.status);
  assert.equal(wrongPassword.body.error?.code, unknownAccount.body.error?.code);
});

test('a cart line added by a signed-in customer survives a second request', async () => {
  const user = await registerUser();
  const product = await createProduct();

  await api('POST', '/account/cart', {
    token: user.accessToken,
    body: {
      productId: product.id,
      shapeKey: product.shapeKey,
      lengthKey: product.lengthKey,
      size: product.size,
      quantity: 2,
    },
    expectStatus: 200,
  });

  const cart = await api<{ items: { productId: string; quantity: number }[] }>('GET', '/account/cart', {
    token: user.accessToken,
    expectStatus: 200,
  });
  assert.equal(cart.body.items.length, 1);
  assert.equal(cart.body.items[0].productId, product.id);
  assert.equal(cart.body.items[0].quantity, 2);
});

test('a cart line cannot be edited past the configured quantity ceiling', async () => {
  const user = await registerUser();
  const product = await createProduct({ quantity: 1 });
  const line = `/account/cart/${product.id}/${product.shapeKey}/${product.lengthKey}/${product.size}`;

  // Adding is deliberately not stock-gated: availability gates the edit below
  // and the checkout, never the initial add. The ceiling is a field limit.
  await api('POST', '/account/cart', {
    token: user.accessToken,
    body: {
      productId: product.id,
      shapeKey: product.shapeKey,
      lengthKey: product.lengthKey,
      size: product.size,
    },
    expectStatus: 200,
  });

  const refused = await api<{ error?: { code?: string } }>('PATCH', line, {
    token: user.accessToken,
    body: { quantity: 100_000 },
  });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error?.code, 'invalid_request');
});

test('a cart line belongs to its owner and nobody else', async () => {
  const owner = await registerUser();
  const stranger = await registerUser();
  const product = await createProduct();

  await api('POST', '/account/cart', {
    token: owner.accessToken,
    body: { productId: product.id, shapeKey: product.shapeKey, lengthKey: product.lengthKey, size: product.size },
    expectStatus: 200,
  });

  const strangerCart = await api<{ items: unknown[] }>('GET', '/account/cart', {
    token: stranger.accessToken,
    expectStatus: 200,
  });
  assert.equal(strangerCart.body.items.length, 0);
});
