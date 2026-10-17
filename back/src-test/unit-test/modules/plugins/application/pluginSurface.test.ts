import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pluginSurfaceEnabled,
  type PluginEnablement,
} from '../../../../../src/modules/plugins/application/pluginSurface.js';

function plugin(id: string, enabled: boolean, dependsOn?: string[]): PluginEnablement {
  return { id, enabled, manifest: { dependsOn } };
}

test('a complement is off when its parent is off', () => {
  const api = plugin('journal-api', false);
  const admin = plugin('journal-admin', true, ['journal-api']);
  const byId = new Map([
    [api.id, api],
    [admin.id, admin],
  ]);
  assert.equal(pluginSurfaceEnabled(admin, byId), false);
  assert.equal(pluginSurfaceEnabled(api, byId), false);
});

test('a complement is on when it and its parent are on', () => {
  const api = plugin('journal-api', true);
  const admin = plugin('journal-admin', true, ['journal-api']);
  const byId = new Map([
    [api.id, api],
    [admin.id, admin],
  ]);
  assert.equal(pluginSurfaceEnabled(admin, byId), true);
});

test('object dependsOn uses the id the same way as a string', () => {
  const api = {
    id: 'journal-api',
    enabled: true,
    manifest: { dependsOn: [] },
  };
  const admin = {
    id: 'journal-admin',
    enabled: true,
    manifest: { dependsOn: [{ id: 'journal-api', version: '>=1.0.0' }] },
  };
  const byId = new Map([
    [api.id, api],
    [admin.id, admin],
  ]);
  assert.equal(pluginSurfaceEnabled(admin, byId), true);
  api.enabled = false;
  assert.equal(pluginSurfaceEnabled(admin, byId), false);
});
