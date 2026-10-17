import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShareCardFormat, parseShareCardPatch } from '../../../../../src/modules/gift/application/shareCardManage.js';

test('share card patch validates the three editable fields', () => {
  assert.deepEqual(parseShareCardPatch({ receiverName: ' Julie ', giverComment: 'Hi', shareCardStyle: 'noel' }), {
    receiverName: 'Julie',
    giverComment: 'Hi',
    shareCardStyle: 'noel',
  });
  assert.equal(parseShareCardPatch({ receiverName: 'a\u0000', giverComment: 'Hi', shareCardStyle: 'noel' }), null);
  assert.equal(parseShareCardPatch({ receiverName: 'x'.repeat(81), giverComment: 'Hi', shareCardStyle: 'noel' }), null);
  assert.equal(parseShareCardPatch({ receiverName: 'Julie', giverComment: '', shareCardStyle: 'noel' }), null);
  assert.equal(parseShareCardPatch({ receiverName: 'Julie', giverComment: 'Hi', shareCardStyle: 'x' }), null);
});

test('share card format defaults to PDF', () => {
  assert.equal(parseShareCardFormat('jpg'), 'jpg');
  assert.equal(parseShareCardFormat('png'), 'pdf');
  assert.equal(parseShareCardFormat(undefined), 'pdf');
});
