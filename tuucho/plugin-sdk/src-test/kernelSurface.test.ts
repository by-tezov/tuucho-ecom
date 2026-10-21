import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS, CORE_OPENING_FILTERS } from '../src/contracts.js';

const surface = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../kernel-surface.json'), 'utf8'),
) as { filters: string[]; slots: string[]; views: string[] };

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
