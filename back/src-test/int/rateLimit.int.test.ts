/**
 * A request the server failed to serve must not spend the caller's budget.
 *
 * Rate limits exist to stop abuse. A 500 is not abuse, it is our fault, and
 * charging it to the customer turns one bug into two: on preproduction, gift
 * creation started returning 500 and five honest retries spent the whole
 * 15-minute window, so the customer was told "trop d'essais" and the real
 * error was hidden behind a misleading one.
 *
 * These tests drive the real limiter through a real Express app against the
 * real Postgres bucket store, because the behaviour under test is the
 * decrement-on-finish contract between express-rate-limit and our store, and
 * neither half proves it alone.
 */
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { pool, resetDatabase } from './support/stack.js';
import { createRateLimiter } from '../../src/platform/http/createRateLimiter.js';

// Every limiter is switched off under APP_TARGET=dev (`DISABLE_RATE_*=true`),
// which is right for development and would make these tests pass while proving
// nothing. So they build limiters from the same shared factory the real ones
// use, with the kill switch off: the policy under test is the factory.
const counted = createRateLimiter({
  windowMs: 60_000,
  limit: 100,
  disabled: () => false,
  kind: 'rate_limit_contact_email',
});
const failuresOnly = createRateLimiter({
  windowMs: 60_000,
  limit: 100,
  disabled: () => false,
  kind: 'rate_limit_login',
  failuresOnly: true,
});

let server: Server;
let origin: string;

before(async () => {
  const app = express();
  // Two routes, one per limiter shape: `contact` counts everything but a
  // server failure, `login` counts failures only.
  app.post('/probe/:status', counted, (req, res) => {
    res.status(Number(req.params.status)).json({ ok: true });
  });
  app.post('/probe-failures-only/:status', failuresOnly, (req, res) => {
    res.status(Number(req.params.status)).json({ ok: true });
  });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  await resetDatabase();
  await pool.query(`delete from rate_limit_buckets`);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** What the shared store thinks the caller has spent.
 *
 * Giving a hit back happens on the response's `finish` event, so it lands
 * after `fetch` has already resolved. Settle on a stable reading rather than
 * asserting into that race. */
async function hits(kind: string): Promise<number> {
  const read = async (): Promise<number> => {
    const { rows } = await pool.query<{ hits: number }>(
      `select hits from rate_limit_buckets where key like $1 and reset_at > now()`,
      [`rl:${kind}:%`],
    );
    return rows.reduce((total, row) => total + row.hits, 0);
  };
  let previous = await read();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const current = await read();
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

async function call(path: string): Promise<number> {
  const response = await fetch(`${origin}${path}`, { method: 'POST' });
  return response.status;
}

test('a 500 does not count against the caller', async () => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(await call('/probe/500'), 500);
  }
  assert.equal(await hits('rate_limit_contact_email'), 0, 'server failures must be given back');
});

test('a successful request does count', async () => {
  assert.equal(await call('/probe/200'), 200);
  assert.equal(await hits('rate_limit_contact_email'), 1);
});

test('a client error still counts, because that is the abuse this guards', async () => {
  assert.equal(await call('/probe/400'), 400);
  assert.equal(await call('/probe/401'), 401);
  assert.equal(await hits('rate_limit_contact_email'), 2);
});

test('a run of server failures never exhausts the window', async () => {
  // The preproduction case exactly: more failures than the limit allows, and
  // the caller is still able to make a real request afterwards.
  // The preproduction case exactly, at a limit of 5: more failures than the
  // limit allows, and the caller is still served afterwards.
  const tight = createRateLimiter({
    windowMs: 60_000,
    limit: 5,
    disabled: () => false,
    kind: 'rate_limit_checkout',
  });
  const app = express();
  app.post('/tight/:status', tight, (req, res) => res.status(Number(req.params.status)).json({ ok: true }));
  const tightServer = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => tightServer.once('listening', resolve));
  const tightOrigin = `http://127.0.0.1:${(tightServer.address() as AddressInfo).port}`;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch(`${tightOrigin}/tight/500`, { method: 'POST' });
      assert.equal(response.status, 500, 'a server failure must never become a 429');
    }
    const after = await fetch(`${tightOrigin}/tight/200`, { method: 'POST' });
    assert.equal(after.status, 200, 'the window must still be open after the outage');
  } finally {
    tightServer.close();
  }
});

test('a failures-only limiter forgives 5xx and success, and counts 4xx', async () => {
  assert.equal(await call('/probe-failures-only/200'), 200);
  assert.equal(await call('/probe-failures-only/500'), 500);
  assert.equal(await hits('rate_limit_login'), 0);

  assert.equal(await call('/probe-failures-only/401'), 401);
  assert.equal(await hits('rate_limit_login'), 1);
});
