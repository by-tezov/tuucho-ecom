import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginArchiveError, buildStoredZip, extractZip, flattenArchiveRoot } from '../../../../../src/modules/plugins/application/pluginArchive.js';

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
  const zip = buildStoredZip([{ path: 'plugins/theme/default/tuucho-theme-default/package.json', data: new Uint8Array([1]) }]);
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

test('flattenArchiveRoot strips a wrapper folder when package.json has tuucho', () => {
  const pkg = Buffer.from(
    JSON.stringify({
      name: 'gift-wrap',
      version: '1.2.0',
      tuucho: { id: 'gift-wrap', kind: 'generic', installPath: 'src/plugins/gift/gift-wrap' },
    }),
  );
  const flattened = flattenArchiveRoot([
    { path: 'gift-wrap/package.json', data: pkg },
    { path: 'gift-wrap/back/register.ts', data: Buffer.from('export {}') },
  ]);
  assert.deepEqual(
    flattened.map((file) => file.path).sort(),
    ['back/register.ts', 'package.json'],
  );
  const plainNpm = flattenArchiveRoot([
    { path: 'left-pad/package.json', data: Buffer.from('{"name":"left-pad","version":"1.0.0"}') },
    { path: 'left-pad/index.js', data: Buffer.from('module.exports=1') },
  ]);
  assert.equal(plainNpm[0]?.path, 'left-pad/package.json');
});
