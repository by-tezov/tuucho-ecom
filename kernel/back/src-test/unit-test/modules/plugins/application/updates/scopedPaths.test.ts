import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNotUserTree,
  officialCopyPaths,
  OFFICIAL_SNAPSHOT_PATHS,
} from '../../../../../../src/modules/plugins/application/updates/scopedPaths.js';
import type { ShopReleaseManifest } from '../../../../../../src/modules/plugins/domain/releaseManifest.js';

const manifest: ShopReleaseManifest = {
  tag: '1.0.10',
  kernel: '1.0.10',
  releaseId: 10,
  kernelMigrations: ['1738000000000_init'],
  plugins: [
    {
      id: 'tuucho-theme-default',
      version: '1.0.1',
      installPath: 'plugins/tuucho/theme/default/tuucho-theme-default',
    },
  ],
};

test('official scopes never include plugins/user', () => {
  for (const scope of ['all', 'kernel', 'plugins', 'plugin'] as const) {
    const paths = officialCopyPaths(scope, manifest, 'tuucho-theme-default');
    assert.equal(
      paths.some((path) => path === 'plugins/user' || path.startsWith('plugins/user/')),
      false,
      scope,
    );
  }
  assert.deepEqual(officialCopyPaths('kernel', manifest), [
    'kernel',
    'plugin-sdk',
    'release.json',
    'package.json',
  ]);
  assert.ok(officialCopyPaths('kernel', manifest).includes('package.json'));
  assert.ok(officialCopyPaths('all', manifest).includes('package.json'));
  assert.equal(
    officialCopyPaths('kernel', manifest).includes('package-lock.json'),
    false,
  );
  assert.deepEqual(officialCopyPaths('plugins', manifest), ['plugins/tuucho']);
  assert.ok(officialCopyPaths('all', manifest).includes('plugins/tuucho'));
  assert.equal(
    officialCopyPaths('all', manifest).some((path) => path.startsWith('plugins/user')),
    false,
  );
  assert.throws(() => assertNotUserTree('plugins/user/demo/guides/demo-page-guides'), /plugins\/user/);
});

test('official snapshot includes root package.json and never plugins/user', () => {
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('package.json'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('kernel'));
  assert.equal(
    OFFICIAL_SNAPSHOT_PATHS.some((path) => path === 'plugins/user' || path.startsWith('plugins/user/')),
    false,
  );
});
