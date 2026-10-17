import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessPluginCompatibility } from '../../../../../src/modules/plugins/application/pluginCompatibility.js';

test('enable is rejected when engines.core does not match the kernel', () => {
  const plugin = {
    id: 'future-pay',
    manifest: { version: '1.0.0', engines: { core: '>=2.0.0 <3.0.0' }, dependsOn: [] },
  };
  const result = assessPluginCompatibility(plugin, [plugin], '1.0.9');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, 'core_engine_mismatch');
});

test('enable is rejected when a dependsOn plugin is missing', () => {
  const plugin = {
    id: 'tuucho-journal-admin',
    manifest: {
      version: '1.0.0',
      engines: { core: '>=1.0.0 <2.0.0' },
      dependsOn: [{ id: 'tuucho-journal-api', version: '>=1.0.0' }],
    },
  };
  const result = assessPluginCompatibility(plugin, [plugin], '1.0.9');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, 'dependency_missing');
});

test('enable is rejected when a dependsOn version range does not match', () => {
  const api = { id: 'tuucho-journal-api', manifest: { version: '0.9.0', engines: { core: '>=1.0.0 <2.0.0' } } };
  const admin = {
    id: 'tuucho-journal-admin',
    manifest: {
      version: '1.0.0',
      engines: { core: '>=1.0.0 <2.0.0' },
      dependsOn: [{ id: 'tuucho-journal-api', version: '>=1.0.0' }],
    },
  };
  const result = assessPluginCompatibility(admin, [api, admin], '1.0.9');
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, 'dependency_version_mismatch');
});

test('a complement in range on this kernel is compatible', () => {
  const api = { id: 'tuucho-journal-api', manifest: { version: '1.0.0', engines: { core: '>=1.0.0 <2.0.0' } } };
  const admin = {
    id: 'tuucho-journal-admin',
    manifest: {
      version: '1.0.0',
      engines: { core: '>=1.0.0 <2.0.0' },
      dependsOn: [{ id: 'tuucho-journal-api', version: '>=1.0.0' }],
    },
  };
  const result = assessPluginCompatibility(admin, [api, admin], '1.0.9');
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
