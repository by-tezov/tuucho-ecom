import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertReleaseIdSequence,
  normalizeStoredReleaseTag,
  parseReleaseTag,
  relateLocalToLatest,
  sortReleaseTags,
  walkTagsBetween,
} from '../../../../../src/modules/plugins/domain/semverTags.js';

test('parseReleaseTag keeps MAJOR.MINOR.PATCH and drops v-prefix, master, and prerelease', () => {
  assert.equal(parseReleaseTag('1.0.9')?.tag, '1.0.9');
  assert.equal(parseReleaseTag('1.0.9')?.version, '1.0.9');
  assert.equal(parseReleaseTag('v1.0.9'), null);
  assert.equal(parseReleaseTag('master'), null);
  assert.equal(parseReleaseTag('1.0.9-rc.1'), null);
  assert.equal(parseReleaseTag('v1.0.9-rc.1'), null);
  assert.equal(normalizeStoredReleaseTag('v1.0.9'), '1.0.9');
  assert.equal(normalizeStoredReleaseTag('1.0.9'), '1.0.9');
});

test('walkTagsBetween applies every tag after current through latest', () => {
  const catalog = ['1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.0.5']
    .map((tag) => parseReleaseTag(tag)!)
    .concat(sortReleaseTags([]));
  const from = parseReleaseTag('1.0.1')!;
  const to = parseReleaseTag('1.0.5')!;
  assert.deepEqual(
    walkTagsBetween(from, to, catalog).map((entry) => entry.tag),
    ['1.0.2', '1.0.3', '1.0.4', '1.0.5'],
  );
  assert.deepEqual(walkTagsBetween(from, from, catalog), []);
});

test('relateLocalToLatest is ahead, equal, or behind', () => {
  const local = parseReleaseTag('0.0.3')!;
  const published = parseReleaseTag('0.0.2')!;
  assert.equal(relateLocalToLatest(local, published), 'ahead');
  assert.equal(relateLocalToLatest(published, published), 'equal');
  assert.equal(relateLocalToLatest(published, local), 'behind');
});

test('assertReleaseIdSequence forbids holes', () => {
  assert.doesNotThrow(() => assertReleaseIdSequence(9, [10, 11, 12]));
  assert.throws(() => assertReleaseIdSequence(9, [10, 12]), /hole/);
});
