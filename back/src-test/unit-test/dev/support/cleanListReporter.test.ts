import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatIndexSection, formatIndexedTestLine } from '../../../dev/support/cleanListReporter.js';

test('a failed index is printed with the test title', () => {
  const titles = new Map([
    ['16', 'Functional auth › password below the rules: the form refuses it'],
  ]);
  assert.equal(
    formatIndexSection('Failed tests', ['16', '32'], titles),
    [
      '  Failed tests:',
      '    16  Functional auth › password below the rules: the form refuses it',
      '    32  not collected',
      '',
    ].join('\n'),
  );
});

test('an empty index list stays one line', () => {
  assert.equal(formatIndexSection('Not executed tests', [], new Map()), '  Not executed tests: none\n');
});

test('a line without a collected title says it was not collected', () => {
  assert.equal(formatIndexedTestLine('99', undefined), '    99  not collected');
});
