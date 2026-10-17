import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  headersForLog,
  redactForLog,
  responseBodyForLog,
} from '../../../../src/platform/http/apiLogSerialization.js';

test('secret-looking keys are redacted at any depth', () => {
  const logged = redactForLog({
    email: 'a@b.c',
    password: 'hunter2',
    newPassword: 'x',
    otp: '123456',
    accessPin: '1234',
    clientSecret: 'pi_secret',
    paymentIntentId: 'pi_1',
    paymentMethod: 'pm_1',
    nested: { refreshToken: 'r', card: { last4: '4242' }, list: [{ cvc: '123' }] },
  }) as Record<string, unknown>;
  assert.equal(logged.email, 'a@b.c');
  for (const key of ['password', 'newPassword', 'otp', 'accessPin', 'clientSecret', 'paymentIntentId', 'paymentMethod']) {
    assert.equal(logged[key], '[REDACTED]', key);
  }
  const nested = logged.nested as Record<string, unknown>;
  assert.equal(nested.refreshToken, '[REDACTED]');
  assert.equal(nested.card, '[REDACTED]', 'a sensitive key hides its whole subtree');
  assert.deepEqual(nested.list, [{ cvc: '[REDACTED]' }]);
});

test('plain values and arrays pass through', () => {
  assert.equal(redactForLog(null), null);
  assert.equal(redactForLog(3), 3);
  assert.equal(redactForLog(false), false);
  assert.equal(redactForLog('text'), 'text');
  assert.deepEqual(redactForLog([1, 'a', { title: 'x' }]), [1, 'a', { title: 'x' }]);
  assert.equal(redactForLog(undefined), 'undefined');
});

test('buffers are summarized, never dumped', () => {
  assert.deepEqual(redactForLog(Buffer.from('abcd')), { type: 'binary', bytes: 4 });
});

test('auth, cookie, signature and capability headers are redacted', () => {
  const logged = headersForLog({
    Authorization: 'Bearer x',
    cookie: 'refresh_token=y',
    'Set-Cookie': 'z',
    'stripe-signature': 't=1',
    'x-checkout-session': 's',
    'x-gift-pin-token': 'p',
    'x-chat-access-token': 'c',
    'x-api-key': 'k',
    'content-type': 'application/json',
    'user-agent': 'UA',
  });
  for (const name of [
    'Authorization',
    'cookie',
    'Set-Cookie',
    'stripe-signature',
    'x-checkout-session',
    'x-gift-pin-token',
    'x-chat-access-token',
    'x-api-key',
  ]) {
    assert.equal(logged[name], '[REDACTED]', name);
  }
  assert.equal(logged['content-type'], 'application/json');
  assert.equal(logged['user-agent'], 'UA');
});

test('JSON responses are parsed and redacted; others only measured', () => {
  const json = Buffer.from(JSON.stringify({ token: 't', ok: true }));
  assert.deepEqual(responseBodyForLog('application/json; charset=utf-8', json, false), {
    value: { token: '[REDACTED]', ok: true },
  });
  assert.deepEqual(responseBodyForLog('application/json', json, true), {
    value: { token: '[REDACTED]', ok: true },
    truncated: true,
  });
  assert.deepEqual(responseBodyForLog('application/pdf', Buffer.alloc(10), false), {
    type: 'application/pdf',
    bytes: 10,
    omitted: true,
  });
  assert.deepEqual(responseBodyForLog(undefined, Buffer.alloc(0), false), { type: 'empty', bytes: 0, omitted: true });
});

test('production anonymity hides personal fields and leaves catalogue text', () => {
  const logged = redactForLog(
    {
      email: 'ada@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+33 6 12 34 56 78',
      title: 'Almond court',
      line1: '12 rue des Fleurs',
      postalCode: '75002',
      city: 'Paris',
      note: 'Write to ada@example.com or +33612345678',
      onlyPhone: '06 12 34 56 78',
      password: 'hunter2',
    },
    undefined,
    'anonymous',
  ) as Record<string, unknown>;
  for (const key of ['email', 'firstName', 'lastName', 'phone', 'line1', 'postalCode', 'city', 'password']) {
    assert.equal(logged[key], '[REDACTED]', key);
  }
  assert.equal(logged.title, 'Almond court');
  assert.equal(logged.note, 'Write to [REDACTED] or [REDACTED]');
  assert.equal(logged.onlyPhone, '[REDACTED]');
});

test('dev keeps personal fields in clear and still hides secrets', () => {
  const logged = redactForLog(
    { email: 'ada@example.com', line1: '12 rue des Fleurs', password: 'hunter2', title: 'Almond court' },
    undefined,
    'secrets',
  ) as Record<string, unknown>;
  assert.equal(logged.email, 'ada@example.com');
  assert.equal(logged.line1, '12 rue des Fleurs');
  assert.equal(logged.title, 'Almond court');
  assert.equal(logged.password, '[REDACTED]');
});

test('production anonymity hides client IP headers', () => {
  const logged = headersForLog(
    { 'x-forwarded-for': '203.0.113.8', 'content-type': 'application/json' },
    'anonymous',
  );
  assert.equal(logged['x-forwarded-for'], '[REDACTED]');
  assert.equal(logged['content-type'], 'application/json');
});

test('a truncated JSON body is reported as invalid, not echoed raw', () => {
  const cut = Buffer.from('{"password":"hun');
  const logged = responseBodyForLog('application/json', cut, true);
  assert.deepEqual(logged, { type: 'invalid_json', bytes: cut.byteLength, truncated: true });
  assert.equal(JSON.stringify(logged).includes('hun'), false);
});
