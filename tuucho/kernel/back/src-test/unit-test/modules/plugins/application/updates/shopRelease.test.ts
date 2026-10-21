import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inferredShopRelease, readShopRelease } from '../../../../../../src/modules/plugins/application/updates/shopRelease.js';

test('missing lock infers catalog as never applied, not a boot error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tuucho-lock-'));
  await mkdir(join(root, 'tuucho'), { recursive: true });
  await writeFile(
    join(root, 'tuucho/tuucho-versioning.json'),
    `${JSON.stringify({ tag: '0.0.4', kernel: '0.0.4', releaseId: 4 }, null, 2)}\n`,
  );
  assert.equal(await readShopRelease(root), null);
  const inferred = await inferredShopRelease(root);
  assert.equal(inferred.tag, '0.0.4');
  assert.equal(inferred.kernel, '0.0.4');
  assert.equal(inferred.releaseId, 4);
  assert.equal(inferred.tuuchoTreeHash, null);
  assert.deepEqual(inferred.tuuchoFiles, []);
});
