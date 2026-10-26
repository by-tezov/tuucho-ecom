import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isUsableStripeSecretKey,
  redactStripeCliOutput,
  stripeListenArgs,
} from '../../../scripts/stripeListenArgs.js';

test('local stripe listen asks for classic snapshot events', () => {
  assert.deepEqual(stripeListenArgs('127.0.0.1:3000/webhooks/stripe'), [
    'listen',
    '--all-snapshot',
    '--forward-to',
    '127.0.0.1:3000/webhooks/stripe',
  ]);
});

test('only a real project secret key counts', () => {
  assert.equal(isUsableStripeSecretKey('sk_test_abc123'), true);
  assert.equal(isUsableStripeSecretKey('  sk_live_abc123  '), true);
  assert.equal(isUsableStripeSecretKey('replace-me'), false);
  assert.equal(isUsableStripeSecretKey(''), false);
  assert.equal(isUsableStripeSecretKey(undefined), false);
});

test('a relay failure can be printed without its signing secret', () => {
  const printed = redactStripeCliOutput(
    'Ready! Your webhook signing secret is whsec_abc123XYZ (sk_test_secretkey)',
  );
  assert.equal(printed.includes('whsec_abc123XYZ'), false);
  assert.equal(printed.includes('sk_test_secretkey'), false);
  assert.match(printed, /whsec_\[redacted\]/);
  assert.match(printed, /\[redacted key\]/);
});
