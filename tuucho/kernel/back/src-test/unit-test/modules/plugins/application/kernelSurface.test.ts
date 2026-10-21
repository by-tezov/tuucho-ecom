import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS, CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { repoRoot } from '../../../../../src/modules/plugins/application/discoverPlugins.js';

const surface = JSON.parse(readFileSync(join(repoRoot(), 'tuucho/kernel-surface.json'), 'utf8')) as {
  filters: string[];
  slots: string[];
  views: string[];
};

test('kernel-surface.json lists every CORE_OPENING_FILTERS value', () => {
  for (const name of Object.values(CORE_OPENING_FILTERS)) {
    assert.ok(surface.filters.includes(name), name);
  }
});

test('kernel-surface.json lists every CORE_FRONT_SLOTS value', () => {
  for (const name of Object.values(CORE_FRONT_SLOTS)) {
    assert.ok(surface.slots.includes(name), name);
  }
});

test('kernel-surface.json lists every CORE_FRONT_VIEWS value', () => {
  for (const name of Object.values(CORE_FRONT_VIEWS)) {
    assert.ok(surface.views.includes(name), name);
  }
});
