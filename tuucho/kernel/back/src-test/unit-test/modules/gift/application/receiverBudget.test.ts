import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, applyFilters, CORE_OPENING_FILTERS, resetHooks } from '@tuucho/plugin-sdk';
import { remainingFrom } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/application/presenters.js';
import type { GiftBudgetExtraLine } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/remaining.js';
import type { GiftOfferRow } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/infrastructure/giftOfferRepo.js';

const offer = { maxSets: 4, maxBudget: 100, maxAccessoryBudget: 10 } as GiftOfferRow;
const nailItem = { productType: 'nail', unitPrice: 30, quantity: 2 };

test('the gift.receiverBudget opening is a named core filter', () => {
  assert.equal(CORE_OPENING_FILTERS.giftReceiverBudget, 'gift.receiverBudget');
});

test('extra budget lines shrink the remaining budget and slots like real items', () => {
  const withoutExtras = remainingFrom(offer, [nailItem]);
  const extras: GiftBudgetExtraLine[] = [{ productType: 'composition', unitPrice: 20, quantity: 1 }];
  const withExtras = remainingFrom(offer, [nailItem, ...extras]);
  assert.equal(withoutExtras.quantity, 2);
  assert.equal(withExtras.quantity, 3);
  assert.equal(withoutExtras.remainingBudget, 40);
  assert.equal(withExtras.remainingBudget, 20);
  assert.equal(withExtras.remainingSlots, 1);
});

test('an accessory extra line draws on the accessory ceiling, not the nail budget', () => {
  const extras: GiftBudgetExtraLine[] = [{ productType: 'accessory', unitPrice: 6, quantity: 1 }];
  const withExtras = remainingFrom(offer, [nailItem, ...extras]);
  assert.equal(withExtras.remainingBudget, 40);
  assert.equal(withExtras.accessoryMerchandise, 6);
  // Ceiling is the dedicated 10 plus the 40 of unspent nail budget.
  assert.equal(withExtras.remainingAccessoryBudget, 44);
});

test('the receiverBudget filter receives offer and items and returns extra lines', async () => {
  resetHooks();
  const seen: unknown[] = [];
  addFilter(
    CORE_OPENING_FILTERS.giftReceiverBudget,
    (lines: GiftBudgetExtraLine[], ctx: { offer: GiftOfferRow; items: unknown[] }) => {
      seen.push(ctx.offer, ctx.items);
      return [...lines, { productType: 'composition', unitPrice: 25, quantity: 2, label: 'composed set' }];
    },
  );
  // The same call shape loadReceiverSummary uses before remainingFrom.
  const extras = await applyFilters(CORE_OPENING_FILTERS.giftReceiverBudget, [] as GiftBudgetExtraLine[], {
    offer,
    items: [nailItem],
  });
  assert.equal(seen[0], offer);
  assert.deepEqual(seen[1], [nailItem]);
  const remaining = remainingFrom(offer, [nailItem, ...extras]);
  assert.equal(remaining.quantity, 4);
  assert.equal(remaining.remainingBudget, -10);
  resetHooks();
});
