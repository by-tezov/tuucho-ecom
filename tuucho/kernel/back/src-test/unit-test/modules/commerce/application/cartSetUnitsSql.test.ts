import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CART_SET_UNITS_SQL } from '../../../../../src/modules/commerce/application/cartNailUnitsSql.js';
import { syncGiftLinesForCart } from '../../../../../../../plugins/commerce/cart-rules/tuucho-commerce-cart-rules/back/src/cartGiftLines.js';

/** Records queries and answers with empty row sets (no rules, no cart lines). */
function stubClient() {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params: params ?? [] });
      return { rows: [] };
    },
  };
  return client;
}

test('the set-unit SQL excludes the cart own covering reservation via $2', () => {
  assert.match(CART_SET_UNITS_SQL, /\$2::uuid is null or sr\.id is distinct from \$2/);
});

test('syncGiftLinesForCart passes a null exclusion when no covering hold is known', async () => {
  const client = stubClient();
  await syncGiftLinesForCart(client as never, 'cart-1');
  const setUnits = client.calls.find((call) => call.sql.includes('set_units'));
  assert.ok(setUnits);
  assert.deepEqual(setUnits.params, ['cart-1', null]);
});

test('syncGiftLinesForCart forwards the covering reservation id to the set-unit SQL', async () => {
  const client = stubClient();
  await syncGiftLinesForCart(client as never, 'cart-1', 'reservation-9');
  const setUnits = client.calls.find((call) => call.sql.includes('set_units'));
  assert.ok(setUnits);
  assert.deepEqual(setUnits.params, ['cart-1', 'reservation-9']);
});
