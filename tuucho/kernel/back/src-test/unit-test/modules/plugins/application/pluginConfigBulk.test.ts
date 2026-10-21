import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoredZip,
  extractZip,
  PluginArchiveError,
} from '../../../../../src/modules/plugins/application/pluginArchive.js';
import {
  applyAllPluginConfigFromDisk,
  exportAllPluginConfigZip,
  planPluginConfigImport,
} from '../../../../../src/modules/plugins/application/pluginConfigBulk.js';
import {
  buildEnvelope,
  caretRange,
  envelopeJson,
  evaluateCompat,
  parseEnvelope,
  pathPluginId,
  stripSharedConfigPrefix,
} from '../../../../../src/modules/plugins/application/pluginConfigEnvelope.js';
import type { InstalledPlugin } from '../../../../../src/modules/plugins/application/pluginStore.js';
import type { PluginManifest } from '../../../../../src/modules/plugins/domain/contracts.js';

function plugin(partial: {
  id: string;
  enabled?: boolean;
  version?: string;
  core?: string;
  settings?: Record<string, unknown>;
}): InstalledPlugin {
  const manifest: PluginManifest = {
    id: partial.id,
    name: partial.id,
    version: partial.version ?? '1.0.0',
    kind: 'generic',
    description: 'test',
    engines: { core: partial.core ?? '>=0.0.1 <1.0.0' },
    settingsSchema: {
      clientId: { type: 'string', label: 'Id', description: 'Public' },
      appSecret: { type: 'secret', label: 'Secret', description: 'Private' },
    },
  };
  return {
    id: partial.id,
    enabled: partial.enabled !== false,
    settings: partial.settings ?? { clientId: 'abc' },
    schemaVersion: null,
    missingFromDisk: false,
    manifest,
    compatibility: { ok: true, errors: [] },
    configFilesHash: null,
    configFilesAppliedAt: null,
  };
}

test('caretRange and path plugin id', () => {
  assert.equal(caretRange('1.2.3'), '^1.2.3');
  assert.equal(pathPluginId('tuucho-payment-stripe/config.json'), 'tuucho-payment-stripe');
  assert.equal(pathPluginId('config.json'), null);
});

test('strip shared prefix only when a plugin directory remains', () => {
  const nested = stripSharedConfigPrefix([
    { path: 'bundle/tuucho-signin-google/config.json', data: new Uint8Array() },
  ]);
  assert.equal(nested[0]?.path, 'tuucho-signin-google/config.json');
  const single = stripSharedConfigPrefix([
    { path: 'tuucho-signin-google/config.json', data: new Uint8Array() },
  ]);
  assert.equal(single[0]?.path, 'tuucho-signin-google/config.json');
});

test('compat blocks core and plugin range misses', () => {
  const envelope = buildEnvelope('p', 'public', { clientId: 'x' }, '>=0.0.1 <1.0.0', '1.0.0');
  assert.equal(evaluateCompat(envelope, '1.0.0', '0.0.4'), null);
  assert.equal(evaluateCompat(envelope, '1.0.0', '2.0.0'), 'compat_core');
  const tight = buildEnvelope('p', 'public', {}, '>=0.0.1 <1.0.0', '1.0.0');
  tight.compat.plugin = '^2.0.0';
  assert.equal(evaluateCompat(tight, '1.0.0', '0.0.4'), 'compat_plugin');
  const badFormat = parseEnvelope({ format: 2, pluginId: 'p' } as never);
  assert.equal('error' in badFormat && badFormat.error, 'format');
});

test('import plan skips unknown ids, blocks path mismatch and mixed public secrets', () => {
  const installed = [plugin({ id: 'tuucho-signin-google' })];
  const ok = buildEnvelope(
    'tuucho-signin-google',
    'public',
    { clientId: 'g' },
    '>=0.0.1 <1.0.0',
    '1.0.0',
  );
  const mismatch = buildEnvelope('other-id', 'public', { clientId: 'g' }, '>=0.0.1 <1.0.0', '1.0.0');
  const mixed = buildEnvelope(
    'tuucho-signin-google',
    'public',
    { clientId: 'g', appSecret: 'nope' },
    '>=0.0.1 <1.0.0',
    '1.0.0',
  );
  const planned = planPluginConfigImport(
    [
      { path: 'tuucho-signin-google/config.json', data: Buffer.from(envelopeJson(ok)) },
      { path: 'ghost-plugin/config.json', data: Buffer.from(envelopeJson(buildEnvelope('ghost-plugin', 'public', {}, '>=0.0.1 <1.0.0', '1.0.0'))) },
      { path: 'tuucho-signin-google/config.json', data: Buffer.from(envelopeJson(mismatch)) },
    ],
    installed,
  );
  assert.ok(planned.report.skipped.some((item) => item.id === 'ghost-plugin' && item.reason === 'unknown_plugin'));
  assert.ok(planned.report.blocked.some((item) => item.reason === 'path_mismatch'));
  const mixedPlan = planPluginConfigImport(
    [{ path: 'tuucho-signin-google/config.json', data: Buffer.from(envelopeJson(mixed)) }],
    installed,
  );
  assert.deepEqual(mixedPlan.report.blocked, [{ id: 'tuucho-signin-google', reason: 'mixed_public' }]);
  assert.equal(mixedPlan.bags.size, 0);
});

test('named import still writes a disabled plugin into the plan bags', () => {
  const disabled = plugin({ id: 'tuucho-signin-google', enabled: false });
  const envelope = buildEnvelope(
    'tuucho-signin-google',
    'public',
    { clientId: 'g' },
    '>=0.0.1 <1.0.0',
    '1.0.0',
  );
  const planned = planPluginConfigImport(
    [{ path: 'tuucho-signin-google/config.json', data: Buffer.from(envelopeJson(envelope)) }],
    [disabled],
  );
  assert.equal(planned.bags.has('tuucho-signin-google'), true);
  assert.equal(planned.report.blocked.length, 0);
});

test('update-all skips disabled plugins; export-all omits them', async () => {
  const disabled = plugin({ id: 'tuucho-signin-google', enabled: false });
  const report = await applyAllPluginConfigFromDisk([disabled]);
  assert.deepEqual(report.skipped, [{ id: 'tuucho-signin-google', reason: 'disabled' }]);
  assert.equal(report.applied.length, 0);
  const zip = exportAllPluginConfigZip([disabled]);
  assert.equal(zip, null);
  const enabled = plugin({ id: 'tuucho-signin-google', enabled: true });
  const out = exportAllPluginConfigZip([enabled]);
  assert.ok(out);
  const round = planPluginConfigImport(
    [
      {
        path: 'tuucho-signin-google/config.json',
        data: Buffer.from(
          envelopeJson(
            buildEnvelope('tuucho-signin-google', 'public', { clientId: 'abc' }, '>=0.0.1 <1.0.0', '1.0.0'),
          ),
        ),
      },
    ],
    [enabled],
  );
  assert.equal(round.bags.get('tuucho-signin-google')?.public?.clientId, 'abc');
});

test('zip-slip still throws before import plan', () => {
  const zip = buildStoredZip([{ path: '../kernel/evil.json', data: Buffer.from('{}') }]);
  assert.throws(
    () => extractZip(zip),
    (error: unknown) => error instanceof PluginArchiveError && error.code === 'zip_slip',
  );
});
