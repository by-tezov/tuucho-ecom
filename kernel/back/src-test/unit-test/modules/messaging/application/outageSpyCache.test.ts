import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  outageSpyCacheFile,
  readCachedOutageSpyTo,
  rememberOutageSpyTo,
  setOutageSpyCacheRootForTests,
} from '../../../../../src/modules/messaging/application/outageSpyCache.js';

test('outage spy cache stores joined To and empty skip, never login', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'outage-spy-'));
  setOutageSpyCacheRootForTests(dir);
  try {
    await rememberOutageSpyTo('login', ['ops@shop.com']);
    assert.equal(await readCachedOutageSpyTo('login'), undefined);
    await rememberOutageSpyTo('website_down', ['Ops@Shop.com', 'owner@shop.com']);
    assert.equal(await readCachedOutageSpyTo('website_down'), 'Ops@Shop.com, owner@shop.com');
    await rememberOutageSpyTo('website_restore_failed', []);
    assert.equal(await readCachedOutageSpyTo('website_restore_failed'), undefined);
    const raw = JSON.parse(await readFile(outageSpyCacheFile(dir), 'utf8')) as Record<string, string>;
    assert.equal(raw.website_down, 'Ops@Shop.com, owner@shop.com');
    assert.equal(raw.website_restore_failed, '');
    assert.equal(raw.login, undefined);
  } finally {
    setOutageSpyCacheRootForTests(undefined);
    await rm(dir, { recursive: true, force: true });
  }
});
