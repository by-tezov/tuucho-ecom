import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enabledOpeningEntries,
  uniqueOpeningEntries,
} from '../../../../../src/modules/plugins/application/coreOpenings.js';
import { setRuntimeEnabledPluginIds } from '../../../../../src/modules/plugins/application/runtimeEnabledPlugins.js';

test('uniqueOpeningEntries keeps the first id and drops later copies', () => {
  const out = uniqueOpeningEntries([
    { id: 'loyalty-wallet', pluginId: 'a', title: 'first' },
    { id: 'other', pluginId: 'b', title: 'other' },
    { id: 'loyalty-wallet', pluginId: 'a', title: 'copy' },
    { id: '  ', pluginId: 'c', title: 'blank' },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.title, 'first');
  assert.equal(out[1]?.id, 'other');
});

test('enabledOpeningEntries keeps only runtime-enabled plugin ids', () => {
  setRuntimeEnabledPluginIds(['tuucho-journal-admin']);
  const out = enabledOpeningEntries([
    { id: 'api-log', pluginId: 'tuucho-journal-admin', title: 'API log' },
    { id: 'email-log', pluginId: 'tuucho-journal-email', title: 'Email log' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, 'api-log');
  setRuntimeEnabledPluginIds([]);
});
