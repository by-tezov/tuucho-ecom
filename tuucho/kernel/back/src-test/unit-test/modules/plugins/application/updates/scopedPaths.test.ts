import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNotUserTree,
  officialCopyPaths,
  OFFICIAL_SNAPSHOT_PATHS,
} from '../../../../../../src/modules/plugins/application/updates/scopedPaths.js';
import type { ShopReleaseManifest } from '../../../../../../src/modules/plugins/domain/releaseManifest.js';

const manifest: ShopReleaseManifest = {
  tag: '0.0.4',
  kernel: '0.0.4',
  releaseId: 4,
  kernelMigrations: ['1738000000000_init'],
  plugins: [
    {
      id: 'tuucho-theme-default',
      version: '1.0.1',
      installPath: 'tuucho/plugins/theme/default/tuucho-theme-default',
    },
  ],
};

test('official scopes never include src/plugins or tuucho-config', () => {
  for (const scope of ['all', 'kernel', 'plugins', 'plugin'] as const) {
    const paths = officialCopyPaths(scope, manifest, 'tuucho-theme-default');
    assert.equal(
      paths.some((path) => path === 'src/plugins' || path.startsWith('src/plugins/') || path.startsWith('tuucho-config')),
      false,
      scope,
    );
  }
  assert.deepEqual(officialCopyPaths('kernel', manifest), [
    'tuucho/kernel',
    'tuucho/plugin-sdk',
    'tuucho/factory-backup',
    'tuucho/docs',
    'tuucho/tuucho-versioning.json',
    'tuucho-release.json',
    'release.json',
    'package.json',
  ]);
  assert.ok(officialCopyPaths('kernel', manifest).includes('package.json'));
  assert.ok(officialCopyPaths('all', manifest).includes('package.json'));
  assert.equal(officialCopyPaths('kernel', manifest).includes('package-lock.json'), false);
  assert.deepEqual(officialCopyPaths('plugins', manifest), ['tuucho/plugins']);
  assert.ok(officialCopyPaths('all', manifest).includes('tuucho/plugins'));
  assert.throws(() => assertNotUserTree('src/plugins/demo/guides/page-guides'), /src\/plugins/);
  assert.throws(() => assertNotUserTree('tuucho-config/config.dev.json'), /tuucho-config/);
});

test('official snapshot includes root package.json and never src/plugins', () => {
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('package.json'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho/kernel'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho/plugins'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho/tuucho-versioning.json'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho-versioning.lock.json'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho/factory-backup'));
  assert.ok(OFFICIAL_SNAPSHOT_PATHS.includes('tuucho/docs'));
  assert.equal(
    OFFICIAL_SNAPSHOT_PATHS.some((path) => path === 'src/plugins' || path.startsWith('src/plugins/')),
    false,
  );
});
