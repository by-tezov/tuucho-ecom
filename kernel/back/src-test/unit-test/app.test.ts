/**
 * HTTP-surface tests that need no database and no external service.
 *
 * They mount the real composed app in process (the whole point of splitting
 * `createApp()` from `startServer()`), so they cover the guards that run
 * *before* any handler touches the database: authentication, CORS, the raw
 * webhook body, and the sanitized error envelope. The database-backed
 * behaviour stays in the isolated API suite under `src-test/`.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';

let server: Server;
let origin: string;

before(async () => {
  const app = createApp();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('healthz answers without touching the database', async () => {
  const response = await fetch(`${origin}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('an authenticated route rejects a missing bearer token before any query', async () => {
  const response = await fetch(`${origin}/account/profile`);
  assert.equal(response.status, 401);
});

test('an authenticated route rejects a malformed bearer token', async () => {
  const response = await fetch(`${origin}/account/profile`, {
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  assert.equal(response.status, 401);
});

test('an admin route is not reachable with no credentials', async () => {
  const response = await fetch(`${origin}/admin/stats`);
  assert.equal(response.status, 401);
});

test('an unknown path is a 404, not a crash', async () => {
  const response = await fetch(`${origin}/definitely-not-a-route`);
  assert.equal(response.status, 404);
});

test('robots.txt is served before the catch-all gallery mount', async () => {
  const response = await fetch(`${origin}/robots.txt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
});

test('storefront robots.txt is the assembled shop document', async () => {
  const response = await fetch(`${origin}/storefront/robots.txt`);
  assert.equal(response.status, 200);
  const text = await response.text();
  // Unit tests run APP_TARGET=dev: public indexing is off.
  assert.match(text, /User-agent: \*/);
  assert.match(text, /^Disallow: \/$/m);
  assert.doesNotMatch(text, /Sitemap:/);
  assert.doesNotMatch(text, /Allow: \//);
});

test('sitemap.xml is unpublished when APP_TARGET is not prod', async () => {
  const response = await fetch(`${origin}/sitemap.xml`);
  assert.equal(response.status, 404);
});

test('robots.txt blocks nothing, and the noindex header keeps the API out of the index', async () => {
  // Google applies this host's robots.txt to every fetch() a rendered shop
  // page makes, so a Disallow here empties the catalogue for Googlebot.
  const robots = await (await fetch(`${origin}/robots.txt`)).text();
  assert.doesNotMatch(robots, /^Disallow:[ \t]*\/\S*[ \t]*$/m);
  const health = await fetch(`${origin}/healthz`);
  assert.equal(health.headers.get('x-robots-tag'), 'noindex');
});

test('the stripe webhook refuses an unsigned payload', async () => {
  const response = await fetch(`${origin}/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'payment_intent.succeeded' }),
  });
  // 501 when Stripe is not configured locally, 400 when it is and the
  // signature is missing. Never 200: an unsigned event must not be acted on.
  assert.ok([400, 501].includes(response.status), `unsigned webhook returned ${response.status}`);
});

test('preflight from the front origin is answered with credentials allowed', async () => {
  const response = await fetch(`${origin}/account/profile`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PATCH' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.match(response.headers.get('access-control-allow-methods') ?? '', /PATCH/);
});

test('every localized response varies on Origin and Accept-Language', async () => {
  const response = await fetch(`${origin}/healthz`, { headers: { origin: 'http://localhost:5173' } });
  const vary = response.headers.get('vary') ?? '';
  assert.match(vary, /Origin/);
  assert.match(vary, /Accept-Language/);
});

test('security headers are applied to API responses', async () => {
  const response = await fetch(`${origin}/healthz`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('the ops surface is never mounted on the public app', async () => {
  for (const path of ['/operation/database-migrate', '/operation/log', '/ops-gateway']) {
    const response = await fetch(`${origin}${path}`, { method: 'POST' });
    assert.notEqual(response.status, 200, `${path} must not be reachable publicly`);
    assert.notEqual(response.status, 401, `${path} must not exist here at all, not merely be guarded`);
  }
});
