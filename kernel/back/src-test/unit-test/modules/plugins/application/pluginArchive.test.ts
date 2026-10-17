import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginArchiveError, buildStoredZip, extractZip } from '../../../../../src/modules/plugins/application/pluginArchive.js';

test('zip extract rejects zip-slip paths', () => {
  const zip = buildStoredZip([{ path: '../kernel/evil.js', data: new Uint8Array([1]) }]);
  assert.throws(() => extractZip(zip), (error: unknown) => {
    assert.ok(error instanceof PluginArchiveError);
    assert.equal(error.code, 'zip_slip');
    return true;
  });
});

test('zip extract rejects absolute paths', () => {
  const zip = buildStoredZip([{ path: '/tmp/evil.js', data: new Uint8Array([1]) }]);
  assert.throws(() => extractZip(zip), (error: unknown) => {
    assert.ok(error instanceof PluginArchiveError);
    assert.equal(error.code, 'absolute_path');
    return true;
  });
});

test('zip extract rejects kernel overwrite paths', () => {
  const zip = buildStoredZip([{ path: 'plugins/tuucho/theme/default/tuucho-theme-default/plugin.json', data: new Uint8Array([1]) }]);
  assert.throws(() => extractZip(zip), (error: unknown) => {
    assert.ok(error instanceof PluginArchiveError);
    assert.equal(error.code, 'kernel_overwrite');
    return true;
  });
});

test('zip extract keeps a nested plugin file', () => {
  const zip = buildStoredZip([{ path: 'back/register.ts', data: Buffer.from('export default 1') }]);
  const files = extractZip(zip);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, 'back/register.ts');
});
