import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_VERSION } from '../../../../../src/modules/plugins/domain/coreVersion.js';
import { satisfiesRange } from '../../../../../src/modules/plugins/domain/semverRange.js';

test('CORE_VERSION matches back/package.json', () => {
  const pkg = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../../package.json'), 'utf8'),
  ) as { version: string };
  assert.equal(CORE_VERSION, pkg.version);
});

test('satisfiesRange understands comparators, caret, tilde and star', () => {
  assert.equal(satisfiesRange('1.0.9', '>=1.0.0 <2.0.0'), true);
  assert.equal(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0'), false);
  assert.equal(satisfiesRange('1.0.9', '^1.0.0'), true);
  assert.equal(satisfiesRange('2.0.0', '^1.0.0'), false);
  assert.equal(satisfiesRange('1.0.9', '~1.0.0'), true);
  assert.equal(satisfiesRange('1.1.0', '~1.0.0'), false);
  assert.equal(satisfiesRange('1.0.9', '*'), true);
  assert.equal(satisfiesRange('1.0.9', ''), true);
  assert.equal(satisfiesRange('1.0.9', '1.0.9'), true);
  assert.equal(satisfiesRange('1.0.8', '1.0.9'), false);
  assert.equal(satisfiesRange('1.0.9', '>=2.0.0'), false);
  assert.equal(satisfiesRange('1.0.9', '>=1.0.0 oops'), false);
});
