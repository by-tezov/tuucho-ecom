import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PluginArchiveError } from '../../../../../src/modules/plugins/application/pluginArchive.js';
import {
  TUUCHO_PLUGIN_TREE,
  USER_PLUGIN_TREE,
  assertInstallPathAvailable,
  normalizePreferredInstallPath,
  preferredTreeForPluginId,
  resolveInstallDestination,
} from '../../../../../src/modules/plugins/application/pluginInstallPath.js';

function throwsCode(fn: () => unknown, code: PluginArchiveError['code']) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof PluginArchiveError);
    assert.equal(error.code, code);
    return true;
  });
}

test('id prefix chooses the Tuucho vs user tree', () => {
  assert.equal(preferredTreeForPluginId('tuucho-seo-robots'), TUUCHO_PLUGIN_TREE);
  assert.equal(preferredTreeForPluginId('demo-page-guides'), USER_PLUGIN_TREE);
});

test('normalizePreferredInstallPath accepts nested Tuucho and user paths', () => {
  assert.equal(
    normalizePreferredInstallPath(
      'tuucho-seo-robots',
      'tuucho/plugins/seo/robots/tuucho-seo-robots',
    ),
    'tuucho/plugins/seo/robots/tuucho-seo-robots',
  );
  assert.equal(
    normalizePreferredInstallPath(
      'demo-page-guides',
      'src/plugins/demo/guides/demo-page-guides',
    ),
    'src/plugins/demo/guides/demo-page-guides',
  );
});

test('path guard rejects missing, escaped, mismatched, and overlapping paths', () => {
  throwsCode(() => normalizePreferredInstallPath('shop-notes', undefined), 'invalid_manifest');
  throwsCode(() => normalizePreferredInstallPath('shop-notes', '../src/plugins/shop-notes'), 'unsafe_path');
  throwsCode(() => normalizePreferredInstallPath('shop-notes', '/tmp/shop-notes'), 'unsafe_path');
  throwsCode(
    () => normalizePreferredInstallPath('shop-notes', 'plugins/seo/shop-notes'),
    'unsafe_path',
  );
  throwsCode(
    () =>
      normalizePreferredInstallPath(
        'tuucho-seo-robots',
        'src/plugins/seo/robots/tuucho-seo-robots',
      ),
    'unsafe_path',
  );
  throwsCode(
    () =>
      normalizePreferredInstallPath(
        'demo-page-guides',
        'extensions/demo/guides/demo-page-guides',
      ),
    'unsafe_path',
  );
  throwsCode(
    () =>
      normalizePreferredInstallPath(
        'tuucho-seo-robots',
        'tuucho/plugins/tuucho/seo/robots/tuucho-seo-robots',
      ),
    'unsafe_path',
  );
  throwsCode(
    () => normalizePreferredInstallPath('tuucho-seo-robots', 'tuucho/plugins/seo/robots/other-id'),
    'unsafe_path',
  );
  throwsCode(
    () => normalizePreferredInstallPath('shop-notes', 'src/plugins/demo/guides'),
    'unsafe_path',
  );

  const dest = resolveInstallDestination(
    'shop-notes',
    'src/plugins/notes/shop-notes',
    '/repo',
  );
  assert.equal(dest, '/repo/src/plugins/notes/shop-notes');

  throwsCode(
    () =>
      assertInstallPathAvailable({
        id: 'shop-notes',
        dest,
        destExists: false,
        existing: [{ id: 'shop-notes', sourceDir: dest, missingFromDisk: false }],
      }),
    'already_installed',
  );
  throwsCode(
    () =>
      assertInstallPathAvailable({
        id: 'shop-notes',
        dest,
        destExists: true,
        existing: [],
      }),
    'path_conflict',
  );
  throwsCode(
    () =>
      assertInstallPathAvailable({
        id: 'shop-notes',
        dest,
        destExists: false,
        existing: [
          {
            id: 'other-notes',
            sourceDir: '/repo/src/plugins/notes',
            missingFromDisk: false,
          },
        ],
      }),
    'path_conflict',
  );
});
