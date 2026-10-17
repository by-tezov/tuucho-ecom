import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, applyFilters, resetHooks } from '@tuucho/plugin-sdk';
import {
  buildOrderPluginSnapshot,
  extraLinesFromSnapshot,
  readPluginSnapshot,
  totalsFromPluginSnapshot,
} from '../../../../../src/modules/orders/application/orderPluginSnapshot.js';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';

test('orders.snapshot bag is keyed by plugin id', async () => {
  resetHooks();
  addFilter('orders.snapshot', (snapshot: { plugins: Record<string, unknown> }) => {
    snapshot.plugins['shop-notes'] = {
      note: 'demo',
      extraLines: [{ id: 'demo-line', pluginId: 'shop-notes', label: 'Demo checkout line', amount: 0 }],
    };
    return snapshot;
  });
  const snapshot = await buildOrderPluginSnapshot({ plugins: {} }, {});
  assert.equal((snapshot.plugins['shop-notes'] as { note: string }).note, 'demo');
  const lines = extraLinesFromSnapshot(snapshot);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.label, 'Demo checkout line');
});

test('readPluginSnapshot ignores junk', () => {
  assert.deepEqual(readPluginSnapshot(null).plugins, {});
  assert.deepEqual(readPluginSnapshot({ plugins: { a: { extraLines: [{ label: 'x', amount: 1 }] } } }).plugins.a, {
    extraLines: [{ label: 'x', amount: 1 }],
  });
});

test('snapshot bags fill leftover totals without kernel plugin field names on PricedCheckout', () => {
  const snapshot = readPluginSnapshot({
    plugins: {
      'tuucho-commerce-vouchers': { code: 'NOEL', discount: 5, extraLines: [{ id: 'v', pluginId: 'tuucho-commerce-vouchers', label: 'NOEL', amount: -5 }] },
      'tuucho-commerce-loyalty': { credit: 2, earn: 1.5, earnStatus: 'pending', extraLines: [{ id: 'l', pluginId: 'tuucho-commerce-loyalty', label: 'Loyalty', amount: -2 }] },
    },
  });
  const totals = totalsFromPluginSnapshot(snapshot, {
    voucherCode: null,
    voucherDiscount: null,
    loyaltyCredit: 0,
    loyaltyEarn: 0,
    loyaltyEarnStatus: 'void',
  });
  assert.equal(totals.voucherCode, 'NOEL');
  assert.equal(totals.voucherDiscount, 5);
  assert.equal(totals.loyaltyCredit, 2);
  assert.equal(totals.loyaltyEarn, 1.5);
  assert.equal(totals.loyaltyEarnStatus, 'pending');
  assert.equal(totals.extraLines.length, 2);
});

test('checkout.release is a core opening', () => {
  assert.equal(CORE_OPENING_FILTERS.checkoutRelease, 'checkout.release');
});

test('checkout.quote extra lines stay on the quote', async () => {
  resetHooks();
  addFilter('checkout.quote', (quote: { extraLines: Array<{ id: string }> }) => {
    quote.extraLines.push({ id: 'demo-line' });
    return quote;
  });
  const quote = await applyFilters('checkout.quote', { extraLines: [] as Array<{ id: string }> });
  assert.ok(quote.extraLines.some((line) => line.id === 'demo-line'));
});
