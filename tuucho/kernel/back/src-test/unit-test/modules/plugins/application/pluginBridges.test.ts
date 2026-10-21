import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerPluginService, resetPluginServices } from '@tuucho/plugin-sdk';
import { peekPluginMethod } from '../../../../../src/modules/plugins/application/pluginBridges.js';

test('pluginBridges source does not name bundled plugin ids', async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = await readFile(
    join(here, '../../../../../src/modules/plugins/application/pluginBridges.ts'),
    'utf8',
  );
  assert.equal(/tuucho-commerce-/.test(source), false);
  assert.equal(/tuucho-payment-/.test(source), false);
  assert.equal(/tuucho-contact/.test(source), false);
});

test('peekPluginMethod dispatches by method name across registered services', () => {
  resetPluginServices();
  registerPluginService('alpha', { ping: () => 'a' });
  registerPluginService('beta', { holdVoucher: (code: string) => `held:${code}` });
  assert.equal(peekPluginMethod('holdVoucher')?.('SAVE10'), 'held:SAVE10');
  assert.equal(peekPluginMethod('missing'), undefined);
  resetPluginServices();
});
