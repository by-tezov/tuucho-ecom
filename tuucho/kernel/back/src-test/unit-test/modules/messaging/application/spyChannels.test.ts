import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, CORE_OPENING_FILTERS, resetHooks } from '@tuucho/plugin-sdk';
import {
  readCachedOutageSpyTo,
  setOutageSpyCacheRootForTests,
} from '../../../../../src/modules/messaging/application/outageSpyCache.js';
import {
  KERNEL_SPY_CHANNELS,
  listSpyChannels,
  resolveSpyRecipients,
  spyTo,
  uniqueSpyEmails,
} from '../../../../../src/modules/messaging/application/spyChannels.js';

test('uniqueSpyEmails lowercases and keeps one copy', () => {
  assert.deepEqual(uniqueSpyEmails(['A@Shop.com', ' a@shop.com ', '', 'ops@shop.com']), [
    'a@shop.com',
    'ops@shop.com',
  ]);
});

test('kernel spy catalogue excludes plugin-owned gift and product-request', () => {
  const ids = KERNEL_SPY_CHANNELS.map((channel) => channel.id);
  assert.ok(ids.includes('login'));
  assert.ok(ids.includes('order_confirmation'));
  assert.ok(ids.includes('website_down'));
  assert.ok(ids.includes('website_restore_failed'));
  assert.ok(!ids.includes('gift_created'));
  assert.ok(!ids.includes('product_request'));
  assert.ok(!ids.includes('contact.inbound'));
  assert.ok(!ids.includes('contact.chat'));
  assert.equal(
    KERNEL_SPY_CHANNELS.every((channel) => channel.pluginId === 'kernel'),
    true,
  );
});

test('resolveSpyRecipients skips unknown channels and dedupes plugin output', async () => {
  resetHooks();
  addFilter(CORE_OPENING_FILTERS.mailSpyResolve, (state: { channelId: string; to: string[] }) => ({
    ...state,
    to: ['Owner@Shop.com', 'owner@shop.com', 'ops@shop.com'],
  }));
  assert.deepEqual(await resolveSpyRecipients('not_a_channel'), []);
  assert.deepEqual(await resolveSpyRecipients('login'), ['owner@shop.com', 'ops@shop.com']);
  assert.equal(await spyTo('login'), 'owner@shop.com, ops@shop.com');
  assert.equal(await spyTo('missing'), undefined);
});

test('resolveSpyRecipients caches website_down To including empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'outage-spy-resolve-'));
  setOutageSpyCacheRootForTests(dir);
  try {
    resetHooks();
    addFilter(CORE_OPENING_FILTERS.mailSpyResolve, (state: { channelId: string; to: string[] }) => ({
      ...state,
      to: state.channelId === 'website_down' ? ['Ops@Shop.com', 'ops@shop.com'] : [],
    }));
    assert.equal(await spyTo('website_down'), 'ops@shop.com');
    assert.equal(await readCachedOutageSpyTo('website_down'), 'ops@shop.com');
    resetHooks();
    addFilter(CORE_OPENING_FILTERS.mailSpyResolve, (state: { channelId: string; to: string[] }) => ({
      ...state,
      to: [],
    }));
    assert.equal(await spyTo('website_down'), undefined);
    assert.equal(await readCachedOutageSpyTo('website_down'), undefined);
  } finally {
    setOutageSpyCacheRootForTests(undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

test('listSpyChannels always keeps kernel channels after resetHooks', async () => {
  resetHooks();
  const listed = await listSpyChannels();
  const ids = listed.map((channel) => channel.id);
  assert.ok(ids.includes('login'));
  assert.ok(ids.includes('order_confirmation'));
  assert.ok(ids.includes('website_down'));
  assert.ok(!ids.includes('contact.inbound'));
  assert.ok(!ids.includes('gift_created'));
});

test('listSpyChannels lets plugins append', async () => {
  resetHooks();
  addFilter(CORE_OPENING_FILTERS.mailSpyChannels, (channels: typeof KERNEL_SPY_CHANNELS) => [
    ...channels,
    {
      id: 'gift_created',
      pluginId: 'tuucho-commerce-gift',
      title: 'Gift created',
      description: 'Staff copy when a giver creates a gift offer.',
      filters: ['role', 'email', 'kind'],
    },
  ]);
  const listed = await listSpyChannels();
  assert.ok(listed.some((channel) => channel.id === 'login' && channel.pluginId === 'kernel'));
  assert.ok(listed.some((channel) => channel.id === 'gift_created' && channel.pluginId === 'tuucho-commerce-gift'));
});
