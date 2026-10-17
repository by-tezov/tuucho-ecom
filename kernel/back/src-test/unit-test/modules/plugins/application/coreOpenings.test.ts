import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniqueOpeningEntries } from '../../../../../src/modules/plugins/application/coreOpenings.js';

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
