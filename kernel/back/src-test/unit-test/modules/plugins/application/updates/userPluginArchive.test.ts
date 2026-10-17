import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertUserPluginStaging } from '../../../../../../src/modules/plugins/application/updates/userPluginArchive.js';

test('user plugin tag root must be a package, not a nested shop tree', async () => {
  const staging = await mkdtemp(join(tmpdir(), 'tuucho-user-tag-'));
  await mkdir(join(staging, 'back'), { recursive: true });
  await writeFile(join(staging, 'plugin.json'), '{"id":"gift-wrap"}');
  await writeFile(join(staging, 'back/register.ts'), 'export {}');
  await assertUserPluginStaging(staging);

  await mkdir(join(staging, 'plugins/user/gift-wrap'), { recursive: true });
  await assert.rejects(() => assertUserPluginStaging(staging), /Kernel overwrite/);
});
