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
      'plugins/tuucho/seo/robots/tuucho-seo-robots',
    ),
    'plugins/tuucho/seo/robots/tuucho-seo-robots',
  );
  assert.equal(
    normalizePreferredInstallPath(
      'demo-page-guides',
      'plugins/user/demo/guides/demo-page-guides',
    ),
    'plugins/user/demo/guides/demo-page-guides',
  );
});

test('path guard rejects missing, escaped, mismatched, and overlapping paths', () => {
  throwsCode(() => normalizePreferredInstallPath('shop-notes', undefined), 'invalid_manifest');
  throwsCode(() => normalizePreferredInstallPath('shop-notes', '../plugins/user/shop-notes'), 'unsafe_path');
  throwsCode(() => normalizePreferredInstallPath('shop-notes', '/tmp/shop-notes'), 'unsafe_path');
  throwsCode(
    () => normalizePreferredInstallPath('shop-notes', 'plugins/tuucho/seo/shop-notes'),
    'unsafe_path',
  );
  throwsCode(
    () =>
      normalizePreferredInstallPath(
        'tuucho-seo-robots',
        'plugins/user/seo/robots/tuucho-seo-robots',
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
    () => normalizePreferredInstallPath('tuucho-seo-robots', 'plugins/tuucho/seo/robots/other-id'),
    'unsafe_path',
  );
  throwsCode(
    () => normalizePreferredInstallPath('shop-notes', 'plugins/user/demo/guides'),
    'unsafe_path',
  );

  const dest = resolveInstallDestination(
    'shop-notes',
    'plugins/user/notes/shop-notes',
    '/repo',
  );
  assert.equal(dest, '/repo/plugins/user/notes/shop-notes');

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
            sourceDir: '/repo/plugins/user/notes',
            missingFromDisk: false,
          },
        ],
      }),
    'path_conflict',
  );
});
