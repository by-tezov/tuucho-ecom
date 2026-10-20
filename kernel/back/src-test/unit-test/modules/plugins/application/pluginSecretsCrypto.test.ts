import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSealedPluginSecrets,
  pluginSecretsNeedSeal,
  sealPluginSecrets,
  unsealPluginSecrets,
} from '../../../../../src/modules/plugins/application/pluginSecretsCrypto.js';

const SAMPLE = { secretKey: 'sk_test_not_a_real_key', webhookSecret: 'whsec_not_a_real_secret' };

test('seal writes v1 ciphertext that never contains the plaintext values', () => {
  const sealed = sealPluginSecrets(SAMPLE);
  assert.equal(isSealedPluginSecrets(sealed), true);
  assert.match(sealed, /^v1:/);
  assert.equal(sealed.includes('sk_test_not_a_real_key'), false);
  assert.equal(sealed.includes('whsec_not_a_real_secret'), false);
  assert.equal(pluginSecretsNeedSeal(sealed), false);
});

test('unseal of sealed column returns the original map', () => {
  assert.deepEqual(unsealPluginSecrets(sealPluginSecrets(SAMPLE)), SAMPLE);
});

test('unseal of leftover plaintext JSONB object does not require a second encrypt pass', () => {
  assert.equal(pluginSecretsNeedSeal(SAMPLE), true);
  assert.deepEqual(unsealPluginSecrets(SAMPLE), SAMPLE);
  assert.equal(pluginSecretsNeedSeal({}), false);
  assert.deepEqual(unsealPluginSecrets({}), {});
  assert.deepEqual(unsealPluginSecrets(null), {});
});

test('empty strings are dropped; non-object leftover is refused', () => {
  assert.deepEqual(unsealPluginSecrets({ secretKey: '  ', keep: 'x' }), { keep: 'x' });
  assert.throws(() => unsealPluginSecrets(['nope']), /Unsupported plugin secrets column/);
});
