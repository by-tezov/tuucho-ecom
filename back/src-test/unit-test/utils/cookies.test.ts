import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import {
  clearRefreshTokenCookie,
  getRefreshTokenCookie,
  serializeRefreshTokenCookie,
} from '../../../src/utils/cookies.js';

function req(cookie: string | undefined): Request {
  return { headers: { cookie } } as unknown as Request;
}

test('the refresh cookie is found among others and URL-decoded', () => {
  assert.equal(getRefreshTokenCookie(req('a=1; refresh_token=ab%2Bc; b=2')), 'ab+c');
  assert.equal(getRefreshTokenCookie(req('refresh_token=x=y')), 'x=y');
});

test('missing, look-alike or malformed cookies give no session', () => {
  assert.equal(getRefreshTokenCookie(req(undefined)), undefined);
  assert.equal(getRefreshTokenCookie(req('other=1')), undefined);
  assert.equal(getRefreshTokenCookie(req('xrefresh_token=1')), undefined);
  assert.equal(getRefreshTokenCookie(req('refresh_token=%E0%A4%A')), undefined);
});

test('the cookie is HttpOnly, scoped to /auth, Lax, and Secure outside dev', () => {
  const prod = serializeRefreshTokenCookie('tok', '2026-12-01T00:00:00.000Z', false, false);
  assert.match(prod, /HttpOnly/);
  assert.match(prod, /Path=\/auth/);
  assert.match(prod, /SameSite=Lax/);
  assert.match(prod, /Secure/);
  assert.doesNotMatch(serializeRefreshTokenCookie('tok', '2026-12-01T00:00:00.000Z', false, true), /Secure/);
});

test('only a remembered login is persistent', () => {
  const session = serializeRefreshTokenCookie('tok', '2026-12-01T00:00:00.000Z', false, false);
  const remembered = serializeRefreshTokenCookie('tok', '2026-12-01T00:00:00.000Z', true, false);
  assert.doesNotMatch(session, /Expires=/);
  assert.match(remembered, /Expires=Tue, 01 Dec 2026 00:00:00 GMT/);
});

test('the token value is encoded and clearing expires the same cookie', () => {
  assert.match(serializeRefreshTokenCookie('a;b', '2026-12-01T00:00:00.000Z', false, false), /^refresh_token=a%3Bb;/);
  const cleared = clearRefreshTokenCookie(false);
  assert.match(cleared, /^refresh_token=;/);
  assert.match(cleared, /Path=\/auth/);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
});
