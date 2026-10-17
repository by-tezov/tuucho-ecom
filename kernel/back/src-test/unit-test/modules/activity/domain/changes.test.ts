import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildChanges, summarizeChanges } from '../../../../../src/modules/activity/domain/changes.js';

describe('buildChanges', () => {
  it('emits only sizes that differ (XS 2 -> 3)', () => {
    const changes = buildChanges(
      { price: 29, sizes: { XS: 2, S: 1, M: 0, L: 0 } },
      { price: 29, sizes: { XS: 3, S: 1, M: 0, L: 0 } },
    );
    assert.deepEqual(changes, [{ field: 'sizes.XS', before: 2, after: 3 }]);
  });

  it('returns an empty list when nothing changed', () => {
    assert.deepEqual(
      buildChanges({ hidden: true, enabled: false }, { hidden: true, enabled: false }),
      [],
    );
  });

  it('diffs top-level scalars and nested pack prices', () => {
    const changes = buildChanges(
      { available: 4, unitPrice: 10, packPrices: { '2': 18, '4': 32 } },
      { available: 5, unitPrice: 10, packPrices: { '2': 18, '4': 30 } },
    );
    assert.deepEqual(changes, [
      { field: 'available', before: 4, after: 5 },
      { field: 'packPrices.4', before: 32, after: 30 },
    ]);
  });
});

describe('summarizeChanges', () => {
  it('names one or two changes and falls back for many', () => {
    assert.equal(
      summarizeChanges([{ field: 'sizes.XS', before: 2, after: 3 }], { 'sizes.XS': 'Taille XS' }),
      'Taille XS 2 -> 3',
    );
    assert.equal(summarizeChanges([]), 'aucun changement');
    assert.equal(
      summarizeChanges([
        { field: 'a', before: 1, after: 2 },
        { field: 'b', before: 1, after: 2 },
        { field: 'c', before: 1, after: 2 },
      ]),
      '3 champs modifies',
    );
  });
});
