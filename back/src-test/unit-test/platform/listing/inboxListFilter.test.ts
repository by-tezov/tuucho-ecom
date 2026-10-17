import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containsPattern, parseInboxListFilter } from '../../../../src/platform/listing/inboxListFilter.js';

test('no query means every conversation, most recent activity first', () => {
  assert.deepEqual(parseInboxListFilter({}), { search: null, openedWithinDays: null, sort: 'activity' });
});

test('search is single-spaced, trimmed and bounded; blank is no search', () => {
  assert.equal(parseInboxListFilter({ q: '  jane   doe ' }).search, 'jane doe');
  assert.equal(parseInboxListFilter({ q: '   ' }).search, null);
  assert.equal(parseInboxListFilter({ q: 'x'.repeat(300) }).search?.length, 100);
  assert.equal(parseInboxListFilter({ q: ['a'] }).search, null);
});

test('only known periods and sorts are accepted', () => {
  assert.equal(parseInboxListFilter({ period: '30' }).openedWithinDays, 30);
  assert.equal(parseInboxListFilter({ period: '12' }).openedWithinDays, null);
  assert.equal(parseInboxListFilter({ sort: 'opened_asc' }).sort, 'opened_asc');
  assert.equal(parseInboxListFilter({ sort: 'drop table' }).sort, 'activity');
});

test('a search pattern matches its text literally', () => {
  assert.equal(containsPattern('50%_off\\'), '%50\\%\\_off\\\\%');
});
