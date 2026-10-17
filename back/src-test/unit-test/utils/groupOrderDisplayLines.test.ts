import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupOrderDisplayLines,
  type OrderDisplayLineInput,
} from '../../../src/utils/groupOrderDisplayLines.js';

function line(overrides: Partial<OrderDisplayLineInput>): OrderDisplayLineInput {
  return {
    productId: 'p1',
    productUid: 'PS-0001',
    productType: 'nail',
    title: { fr: 'Rose' },
    shapeKey: 'almond',
    shapeLabel: 'Amande',
    lengthKey: 'medium',
    lengthLabel: 'Moyen',
    size: 'M',
    quantity: 1,
    unitPrice: 20,
    lineTotal: 20,
    origin: 'user',
    locked: false,
    ...overrides,
  };
}

test('sizes of one product, shape and length merge into one block', () => {
  const groups = groupOrderDisplayLines([
    line({ size: 'S', quantity: 1, lineTotal: 20 }),
    line({ size: 'M', quantity: 2, lineTotal: 40 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]!.title, 'Rose');
  assert.deepEqual(
    groups[0]!.sizes.map((s) => [s.size, s.quantity]),
    [
      ['S', 1],
      ['M', 2],
    ],
  );
  assert.equal(groups[0]!.groupTotal, 60);
});

test('a different shape, length or pack stays a separate block', () => {
  const groups = groupOrderDisplayLines([
    line({}),
    line({ shapeKey: 'square', shapeLabel: 'Carré' }),
    line({ lengthKey: 'long', lengthLabel: 'Long' }),
  ]);
  assert.equal(groups.length, 3);

  const packs = groupOrderDisplayLines([
    line({ productId: 'a1', productType: 'accessory', shapeKey: '', packKey: 'x2', packLabel: 'x2', size: '' }),
    line({ productId: 'a1', productType: 'accessory', shapeKey: '', packKey: 'x4', packLabel: 'x4', size: '' }),
  ]);
  assert.deepEqual(
    packs.map((g) => g.packLabel),
    ['x2', 'x4'],
  );
});

test('orphan lines group by productUid, then by id', () => {
  const byUid = groupOrderDisplayLines([
    line({ productId: null, size: 'S' }),
    line({ productId: null, size: 'M' }),
  ]);
  assert.equal(byUid.length, 1);
  const byId = groupOrderDisplayLines([
    line({ productId: null, productUid: null, id: 'l1' }),
    line({ productId: null, productUid: null, id: 'l2' }),
  ]);
  assert.equal(byId.length, 2);
});

test('composed sets never merge, even with the same id fields', () => {
  const composition = line({
    productType: 'composition',
    id: undefined,
    productUid: undefined,
    shapeKey: '',
    nails: [{ title: 'A', finger: 'left-thumb', variationLabel: 'Rose', variationAxisLabel: 'Couleur' }],
  });
  const groups = groupOrderDisplayLines([composition, composition]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.section, 'composition');
  assert.equal(groups[0]!.productUid, null);
  assert.equal(groups[0]!.nails[0]!.variationLabel, 'Couleur : Rose');
});

test('sections are ordered nail, composition, accessory, gift with one header each', () => {
  const groups = groupOrderDisplayLines([
    line({ productId: 'gift', origin: 'rule', locked: true, unitPrice: 0, lineTotal: 0 }),
    line({ productId: 'acc', productType: 'accessory', shapeKey: '' }),
    line({ productType: 'composition', id: 'c1', shapeKey: '', nails: [{ title: 'A', finger: 'left-thumb' }] }),
    line({ productId: 'n1' }),
    line({ productId: 'n2' }),
  ]);
  assert.deepEqual(
    groups.map((g) => g.section),
    ['nail', 'nail', 'composition', 'accessory', 'gift'],
  );
  assert.deepEqual(
    groups.map((g) => g.sectionStart),
    [true, false, true, true, true],
  );
});

test('a locked paid line is a normal product, not a free gift', () => {
  const [group] = groupOrderDisplayLines([line({ locked: true, unitPrice: 24, lineTotal: 24 })]);
  assert.equal(group!.isGift, false);
  assert.equal(group!.section, 'nail');
});

test('a block is a gift only when every merged line is a gift', () => {
  const mixed = groupOrderDisplayLines([
    line({ origin: 'rule', locked: true, size: 'S' }),
    line({ origin: 'user', size: 'M' }),
  ]);
  assert.equal(mixed[0]!.isGift, false);
  assert.equal(mixed[0]!.section, 'nail');
});

test('the first non-empty note of a block is kept', () => {
  const groups = groupOrderDisplayLines([
    line({ size: 'S', comment: '' }),
    line({ size: 'M', comment: 'Pour ma soeur' }),
    line({ size: 'L', comment: 'autre' }),
  ]);
  assert.equal(groups[0]!.comment, 'Pour ma soeur');
});

test('labels fall back to keys when not resolved', () => {
  const [group] = groupOrderDisplayLines([
    line({ shapeLabel: undefined, lengthLabel: undefined, title: 'Plain' }),
  ]);
  assert.equal(group!.shapeLabel, 'almond');
  assert.equal(group!.lengthLabel, 'medium');
  assert.equal(group!.title, 'Plain');
});
