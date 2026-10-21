import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShopReleaseManifest } from '../../../../../../src/modules/plugins/domain/releaseManifest.js';
import { parseReleaseTag, walkTagsBetween } from '../../../../../../src/modules/plugins/domain/semverTags.js';

test('release.json kernel must match tag', () => {
  const parsed = parseShopReleaseManifest({
    tag: '1.0.9',
    kernel: '1.0.9',
    releaseId: 9,
    kernelMigrations: ['1738000000000_init'],
    plugins: [
      {
        id: 'tuucho-theme-default',
        version: '1.0.0',
        installPath: 'tuucho/plugins/theme/default/tuucho-theme-default',
      },
    ],
  });
  assert.equal(parsed.tag, '1.0.9');
  assert.throws(
    () =>
      parseShopReleaseManifest({
        tag: 'v1.0.9',
        kernel: '1.0.9',
        releaseId: 9,
        kernelMigrations: [],
        plugins: [],
      }),
    /no v prefix/,
  );
  assert.throws(
    () =>
      parseShopReleaseManifest({
        tag: '1.0.9',
        kernel: '1.0.10',
        releaseId: 9,
        kernelMigrations: [],
        plugins: [],
      }),
    /does not match kernel/,
  );
});

test('jump from tag 1 to 5 lists 2, 3, 4, 5', () => {
  const names = ['1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5'].map((tag) => parseReleaseTag(tag)!);
  const walked = walkTagsBetween(names[0]!, names[4]!, names);
  assert.deepEqual(
    walked.map((entry) => entry.tag),
    ['1.0.2', '1.0.3', '1.0.4', '1.0.5'],
  );
});
