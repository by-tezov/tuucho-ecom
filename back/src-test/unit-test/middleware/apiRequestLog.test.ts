import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isApiLogSelfRequest, requestHeadersForLog } from '../../../src/middleware/apiRequestLog.js';
import { signAccessToken } from '../../../src/platform/security/token.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

test('the API journal does not log its own read or clear', () => {
  assert.equal(isApiLogSelfRequest('/admin/api-log'), true);
  assert.equal(isApiLogSelfRequest('/admin/api-log/clear'), true);
  assert.equal(isApiLogSelfRequest('/operation/log/api'), true);
  assert.equal(isApiLogSelfRequest('/operation/log/api/clear'), true);
  assert.equal(isApiLogSelfRequest('/admin/email-log'), true);
  assert.equal(isApiLogSelfRequest('/admin/email-log/clear'), true);
  assert.equal(isApiLogSelfRequest('/operation/log/email'), true);
  assert.equal(isApiLogSelfRequest('/operation/log/email/clear'), true);
  assert.equal(isApiLogSelfRequest('/checkout'), false);
  assert.equal(isApiLogSelfRequest('/admin/orders'), false);
});

test('a signed-in call keeps the user id after the token is redacted', () => {
  const token = signAccessToken({ sub: USER_ID, email: 'ada@example.com' });
  const logged = requestHeadersForLog(
    { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.8' },
    'anonymous',
  );
  assert.equal(logged.authorization, '[REDACTED]');
  assert.equal(logged['x-user-id'], USER_ID);
  assert.equal(logged['x-forwarded-for'], '[REDACTED]');
  assert.equal('x-impersonator-id' in logged, false);
});

test('an impersonated call keeps both account ids', () => {
  const token = signAccessToken({ sub: USER_ID, email: 'ada@example.com', impersonatorId: ADMIN_ID });
  const logged = requestHeadersForLog({ authorization: `Bearer ${token}` }, 'secrets');
  assert.equal(logged['x-user-id'], USER_ID);
  assert.equal(logged['x-impersonator-id'], ADMIN_ID);
});

test('a guest call has no user id', () => {
  const logged = requestHeadersForLog({ authorization: 'Bearer not-a-token' }, 'secrets');
  assert.equal('x-user-id' in logged, false);
});
