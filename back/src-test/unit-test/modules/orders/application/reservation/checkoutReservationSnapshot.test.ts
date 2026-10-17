import { test } from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import { reservationMatchesPricedItems } from '../../../../../../src/modules/orders/application/reservation/checkoutReservationSnapshot.js';

const SET_ID = '00000000-0000-4000-8000-000000000001';

/** Answers the two reads reservationMatchesPricedItems makes: the reserved
 * rows, then the products' accessory data (none here). */
function stubClient(reserved: Array<Record<string, unknown>>): pg.PoolClient {
  return {
    query: async (sql: string) => ({
      rows: sql.includes('stock_reservation_items') ? reserved : [],
    }),
  } as unknown as pg.PoolClient;
}

function line(overrides: Record<string, unknown>) {
  return {
    line: {
      product_id: SET_ID,
      product_type: 'nail',
      shape_key: 'almond',
      length_key: 'medium',
      size: 'M',
      pack_key: '',
      quantity: 1,
      ...overrides,
    },
  } as never;
}

test('a composed set, which reserves no stock, does not fail the reservation match', async () => {
  const reserved = [
    { product_id: SET_ID, shape_key: 'almond', length_key: 'medium', size: 'M', quantity: 1 },
  ];
  const composition = line({ product_id: null, product_type: 'composition', shape_key: '', length_key: '' });
  assert.equal(
    await reservationMatchesPricedItems(stubClient(reserved), 'r1', [line({}), composition]),
    true,
  );
  assert.equal(await reservationMatchesPricedItems(stubClient([]), 'r1', [composition]), true);
});

test('a reserved line that no longer matches still fails', async () => {
  const reserved = [
    { product_id: SET_ID, shape_key: 'almond', length_key: 'medium', size: 'M', quantity: 2 },
  ];
  assert.equal(await reservationMatchesPricedItems(stubClient(reserved), 'r1', [line({})]), false);
});
