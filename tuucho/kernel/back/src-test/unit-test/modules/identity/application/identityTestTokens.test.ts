import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppleTestToken,
  parseFacebookTestToken,
  parseGoogleTestToken,
} from '../../../../../src/modules/identity/application/identityTestTokens.js';

test('identity test tokens stay off unless tuucho-config opts in', () => {
  const previous = process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS;
  delete process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS;
  assert.equal(parseGoogleTestToken('tuucho-test:google:a@example.com'), null);
  process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS = 'true';
  assert.deepEqual(parseGoogleTestToken('tuucho-test:google:a@example.com'), {
    sub: 'test-google:a@example.com',
    email: 'a@example.com',
    emailVerified: true,
  });
  assert.deepEqual(parseFacebookTestToken('tuucho-test:facebook:123:b@example.com'), {
    userId: '123',
    email: 'b@example.com',
  });
  assert.deepEqual(parseAppleTestToken('tuucho-test:apple:sub-1:c@example.com'), {
    sub: 'sub-1',
    email: 'c@example.com',
    emailVerified: true,
  });
  if (previous === undefined) delete process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS;
  else process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS = previous;
});
