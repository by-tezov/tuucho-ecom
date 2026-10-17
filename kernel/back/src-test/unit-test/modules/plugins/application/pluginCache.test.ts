import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  flushPluginCache,
  pluginCacheNamespace,
  resetPluginCache,
} from '@tuucho/plugin-sdk';

test('plugin cache flush on uninstall drops that namespace only', () => {
  resetPluginCache();
  const keep = pluginCacheNamespace('keep-id');
  const gone = pluginCacheNamespace('gone-id');
  keep.set('n', 1, { ttl: 60_000, sensitivity: 'public' });
  gone.set('n', 2, { ttl: 60_000, sensitivity: 'public' });
  flushPluginCache('gone-id');
  assert.equal(keep.get('n'), 1);
  assert.equal(gone.get('n'), undefined);
});

test('public cache rejects secret-looking keys', () => {
  resetPluginCache();
  const cache = pluginCacheNamespace('demo');
  assert.throws(() => cache.set('stripe-token', 'x', { sensitivity: 'public' }), /plugin_cache_secret_forbidden/);
  cache.set('stripe-token', 'x', { sensitivity: 'private', ttl: 1000 });
  assert.equal(cache.get('stripe-token'), 'x');
});
