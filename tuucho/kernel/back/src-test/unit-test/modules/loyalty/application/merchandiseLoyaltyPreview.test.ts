import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, CORE_OPENING_FILTERS, resetHooks } from '@tuucho/plugin-sdk';
import {
  collectLoyaltyPreviewCartExtras,
  quotableAvailability,
  type LoyaltyPreviewCartExtras,
} from '../../../../../../../plugins/commerce/loyalty/tuucho-commerce-loyalty/back/src/application/merchandiseLoyaltyPreview.js';

test('the loyalty.preview.cartExtras opening is a named core filter', () => {
  assert.equal(CORE_OPENING_FILTERS.loyaltyPreviewCartExtras, 'loyalty.preview.cartExtras');
});

test('units covered by the excluded reservation count as available for quoting', () => {
  // The cart's own gift/checkout hold: availability math shows 0, but the
  // hold covers the whole line, so it stays in the earn quote.
  assert.equal(quotableAvailability({ available_quantity: 0, held_by_excluded: 2 }), 2);
  assert.equal(quotableAvailability({ available_quantity: 3, held_by_excluded: 2 }), 5);
  assert.equal(quotableAvailability({ available_quantity: 0 }), 0);
});

test('with no filter registered the extras state stays empty', async () => {
  resetHooks();
  const extras = await collectLoyaltyPreviewCartExtras({ userId: 'u1', source: 'account', lines: [] });
  assert.deepEqual(extras, { lines: [], extraSets: [] });
});

test('a peer filter contributes earn lines and set units, and sees the quoted lines', async () => {
  resetHooks();
  const quoted = [{ productId: 'p1', productType: 'nail', quantity: 2, unitPrice: 30, size: 'M' }];
  let seen: unknown;
  addFilter(
    CORE_OPENING_FILTERS.loyaltyPreviewCartExtras,
    (state: LoyaltyPreviewCartExtras, ctx: unknown) => {
      seen = ctx;
      return {
        lines: [...state.lines, { productId: 'set-1', quantity: 1, unitPrice: 45 }],
        extraSets: [...state.extraSets, { quantity: 1, nailCount: 5, lineTotal: 45 }],
      };
    },
  );
  const extras = await collectLoyaltyPreviewCartExtras({ userId: null, source: 'guest', lines: quoted });
  assert.deepEqual(extras, {
    lines: [{ productId: 'set-1', quantity: 1, unitPrice: 45 }],
    extraSets: [{ quantity: 1, nailCount: 5, lineTotal: 45 }],
  });
  assert.deepEqual(seen, { userId: null, source: 'guest', lines: quoted });
  resetHooks();
});
