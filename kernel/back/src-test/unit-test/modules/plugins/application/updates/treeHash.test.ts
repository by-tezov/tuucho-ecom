import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diffTreeHashes, hashTree } from '../../../../../../src/modules/plugins/application/updates/treeHash.js';

test('diffTreeHashes lists edited and extra files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tuucho-hash-'));
  await mkdir(join(root, 'a'));
  await writeFile(join(root, 'a/one.txt'), 'one');
  const expected = await hashTree(root);
  await writeFile(join(root, 'a/one.txt'), 'two');
  await writeFile(join(root, 'a/two.txt'), 'extra');
  const dirty = diffTreeHashes(expected, await hashTree(root));
  assert.ok(dirty.includes('a/one.txt'));
  assert.ok(dirty.includes('a/two.txt'));
});
