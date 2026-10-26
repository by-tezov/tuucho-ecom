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

test('the test token prefix is configurable, default keeps tuucho-test:', () => {
  const previousAllow = process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS;
  const previousPrefix = process.env.IDENTITY_TEST_TOKEN_PREFIX;
  process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS = 'true';
  try {
    delete process.env.IDENTITY_TEST_TOKEN_PREFIX;
    assert.deepEqual(parseGoogleTestToken('tuucho-test:google:a@example.com')?.email, 'a@example.com');
    assert.equal(parseGoogleTestToken('shop-test-google:a@example.com'), null);

    process.env.IDENTITY_TEST_TOKEN_PREFIX = 'shop-test-';
    assert.deepEqual(parseGoogleTestToken('shop-test-google:a@example.com')?.email, 'a@example.com');
    assert.deepEqual(parseFacebookTestToken('shop-test-facebook:123:b@example.com'), {
      userId: '123',
      email: 'b@example.com',
    });
    assert.deepEqual(parseAppleTestToken('shop-test-apple:sub-1:c@example.com')?.sub, 'sub-1');
    // The default prefix no longer matches once another one is configured.
    assert.equal(parseGoogleTestToken('tuucho-test:google:a@example.com'), null);

    // Regex metacharacters in the prefix stay literal.
    process.env.IDENTITY_TEST_TOKEN_PREFIX = 'shop.test:';
    assert.equal(parseGoogleTestToken('shopXtest:google:a@example.com'), null);
    assert.deepEqual(parseGoogleTestToken('shop.test:google:a@example.com')?.email, 'a@example.com');

    // A blank value falls back to the default.
    process.env.IDENTITY_TEST_TOKEN_PREFIX = '   ';
    assert.deepEqual(parseGoogleTestToken('tuucho-test:google:a@example.com')?.email, 'a@example.com');
  } finally {
    if (previousAllow === undefined) delete process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS;
    else process.env.TUUCHO_IDENTITY_ALLOW_TEST_TOKENS = previousAllow;
    if (previousPrefix === undefined) delete process.env.IDENTITY_TEST_TOKEN_PREFIX;
    else process.env.IDENTITY_TEST_TOKEN_PREFIX = previousPrefix;
  }
});
