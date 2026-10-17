import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPricedCompositionItem } from '../../../../../../src/modules/orders/application/pricing/checkoutPricingTypes.js';

test('buildPricedCompositionItem snapshots the composed set and its nails', () => {
  const item = buildPricedCompositionItem({
    id: 'comp-1',
    size: 'M',
    quantity: 2,
    unitPrice: 12.5,
    nails: [
      {
        product_id: 'n1',
        product_uid: 'NAIL-A',
        title: { fr: 'A' },
        shape_key: 'almond',
        length_key: 'medium',
        shape_label: { fr: 'Amande' },
        length_label: { fr: 'Moyen' },
        finger: 'left-thumb',
        variation_key: 'glossy',
        variation_label: { fr: 'Brillant' },
        variation_axis_label: { fr: 'Finition' },
        photo_path: 'nails/a.webp',
        unit_price: 6,
        position: 0,
      },
      {
        product_id: 'n2',
        product_uid: 'NAIL-B',
        title: { fr: 'B' },
        shape_key: 'oval',
        length_key: 'short',
        shape_label: null,
        length_label: null,
        finger: 'right-index',
        variation_key: '',
        variation_label: null,
        variation_axis_label: null,
        photo_path: 'nails/b.webp',
        unit_price: 6.5,
        position: 1,
      },
    ],
  });

  assert.equal(item.line.product_type, 'composition');
  assert.equal(item.line.product_uid, 'COMPOSE');
  assert.equal(item.line.product_id, null);
  assert.equal(item.line.composition_id, 'comp-1');
  assert.equal(item.line.size, 'M');
  assert.equal(item.line.quantity, 2);
  assert.equal(item.line.photo_path, 'nails/a.webp');
  assert.equal(item.unitPrice, 12.5);
  assert.equal(item.lineTotal, 25);
  assert.equal(item.compositionNails?.length, 2);
  assert.deepEqual(item.compositionNails?.[0], {
    product_id: 'n1',
    product_uid: 'NAIL-A',
    title: { fr: 'A' },
    shape_key: 'almond',
    length_key: 'medium',
    shape_label: { fr: 'Amande' },
    length_label: { fr: 'Moyen' },
    finger: 'left-thumb',
    variation_key: 'glossy',
    variation_label: { fr: 'Brillant' },
    variation_axis_label: { fr: 'Finition' },
    photo_path: 'nails/a.webp',
    unit_price: 6,
    position: 0,
  });
});

test('buildPricedCompositionItem leaves photo null when no nail has one', () => {
  const item = buildPricedCompositionItem({
    id: 'comp-empty-photo',
    size: 'S',
    quantity: 1,
    unitPrice: 3,
    nails: [
      {
        product_id: 'n1',
        product_uid: 'NAIL-A',
        title: { fr: 'A' },
        shape_key: 'almond',
        length_key: 'medium',
        shape_label: null,
        length_label: null,
        finger: 'left-thumb',
        variation_key: '',
        variation_label: null,
        variation_axis_label: null,
        photo_path: null,
        unit_price: 3,
        position: 0,
      },
    ],
  });
  assert.equal(item.line.photo_path, null);
});
