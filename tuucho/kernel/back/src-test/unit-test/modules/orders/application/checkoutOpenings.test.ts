import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFilter, CORE_OPENING_FILTERS, resetHooks } from '@tuucho/plugin-sdk';
import { runCheckoutPrepare } from '../../../../../src/modules/orders/application/checkoutOpenings.js';

test('runCheckoutPrepare passes ctx (including phase) as the filter second argument', async () => {
  resetHooks();
  const seen: unknown[] = [];
  addFilter(CORE_OPENING_FILTERS.checkoutPrepare, (state, ctx) => {
    seen.push(ctx);
    return state;
  });
  const ctx = { client: {}, userId: 'u1', phase: 'price', guest: false };
  const out = await runCheckoutPrepare(ctx);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], ctx);
  assert.equal((out as { phase?: string }).phase, 'price');
  resetHooks();
});
