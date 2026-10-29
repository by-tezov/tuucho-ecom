import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSchemaValues } from '../../../../../src/modules/plugins/application/pluginConfigEnvelope.js';

test('pickSchemaValues skips environments meta key without warning', () => {
  const warnings: string[] = [];
  const result = pickSchemaValues(
    {
      environments: { dev: { public: 'config.dev.json' } },
      clientId: 'x',
      stray: true,
    },
    { clientId: { type: 'string', label: 'id', description: 'id' } },
    'public',
    'page-legal',
    warnings,
  );
  assert.ok(!('error' in result));
  assert.equal(result.values.clientId, 'x');
  assert.ok(!warnings.some((line) => line.includes('environments')));
  assert.ok(warnings.some((line) => line.includes('ignored unknown public key stray')));
});
