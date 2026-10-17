import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { config } from '../../../../src/config/env.js';
import {
  accessTokenExpiresAt,
  signAccessToken,
  verifyAccessToken,
} from '../../../../src/platform/security/token.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../../../src/platform/security/opaqueToken.js';

const USER = { sub: '11111111-1111-4111-8111-111111111111', email: 'jane@example.com' };

function forge(payload: object, options: jwt.SignOptions = {}, secret = config.jwt.secret): string {
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: config.apiBaseUrl,
    audience: 'tezov-ecommerce-api',
    subject: USER.sub,
    expiresIn: '5m',
    ...options,
  });
}

test('a signed access token verifies back to its payload', () => {
  assert.deepEqual(verifyAccessToken(signAccessToken(USER)), USER);
});

test('impersonation is carried only when present', () => {
  const acting = { ...USER, impersonatorId: '22222222-2222-4222-8222-222222222222' };
  assert.deepEqual(verifyAccessToken(signAccessToken(acting)), acting);
  assert.equal('impersonatorId' in verifyAccessToken(signAccessToken(USER))!, false);
});

test('a token with the wrong secret, audience, issuer or type is refused', () => {
  const claims = { email: USER.email, tokenType: 'access' };
  assert.ok(verifyAccessToken(forge(claims)), 'the forge helper itself is valid');
  assert.equal(verifyAccessToken(forge(claims, {}, 'not-the-secret')), undefined);
  assert.equal(verifyAccessToken(forge(claims, { audience: 'other' })), undefined);
  assert.equal(verifyAccessToken(forge(claims, { issuer: 'https://evil.example' })), undefined);
  assert.equal(verifyAccessToken(forge({ email: USER.email, tokenType: 'refresh' })), undefined);
  assert.equal(verifyAccessToken(forge({ email: USER.email })), undefined);
});

test('an expired token is refused', () => {
  const expired = forge({ email: USER.email, tokenType: 'access', iat: Math.floor(Date.now() / 1000) - 600 }, {
    expiresIn: 60,
  });
  assert.equal(verifyAccessToken(expired), undefined);
});

test('the none algorithm and malformed claims are refused', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ sub: USER.sub, email: USER.email, tokenType: 'access', aud: 'tezov-ecommerce-api', iss: config.apiBaseUrl }),
  ).toString('base64url');
  assert.equal(verifyAccessToken(`${header}.${body}.`), undefined);
  assert.equal(verifyAccessToken(forge({ email: 42, tokenType: 'access' })), undefined);
  assert.equal(verifyAccessToken(forge({ email: USER.email, tokenType: 'access', impersonatorId: 7 })), undefined);
  assert.equal(verifyAccessToken('garbage'), undefined);
});

test('accessTokenExpiresAt is in the future', () => {
  assert.ok(Date.parse(accessTokenExpiresAt()) > Date.now());
});

test('opaque tokens are random and only their hash is comparable', () => {
  const a = generateOpaqueToken();
  const b = generateOpaqueToken();
  assert.notEqual(a, b);
  assert.equal(hashOpaqueToken(a), hashOpaqueToken(a));
  assert.notEqual(hashOpaqueToken(a), a);
  assert.notEqual(hashOpaqueToken(a), hashOpaqueToken(b));
});
