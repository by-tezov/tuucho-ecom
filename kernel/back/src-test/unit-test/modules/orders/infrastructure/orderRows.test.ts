/**
 * The row types in `domain/order.ts` still match the real tables.
 *
 * Those types are worth keeping by hand: their comments say *why* a column is
 * nullable, and no generator knows that. What they cannot do is notice that a
 * migration renamed the column underneath them, and nothing else did either:
 * `tsc` cannot see inside a SQL template literal, and `npm run check:sql`
 * validates the SQL, not the shape a query claims to return.
 *
 * The assertions are types, so `tsc` is what proves them; the runtime test only
 * gives them a file to live in. That file is a test deliberately, because the
 * per-feature context budget counts what a change must read, and a guard nobody
 * reads should not make a feature look more expensive.
 *
 * `AdminOrderRow` is deliberately absent: it extends the order row with columns
 * joined from `users`, so it is not the shape of any one table.
 *
 * `MatchesTable` and the table shapes come from `src/db/rows.ts`, regenerated
 * by `npm run sync:schema`.
 */
import { test } from 'node:test';
import type { MatchesTable } from '../../../../../src/db/rows.js';
import type { OrderItemRow, OrderRow } from '../../../../../src/modules/orders/domain/order.js';

const _orderRowMatchesTable: MatchesTable<OrderRow, 'orders'> = true;
const _orderItemRowMatchesTable: MatchesTable<Omit<OrderItemRow, 'nails'>, 'order_items'> = true;
test('the order row types match their tables', () => {
  // The assertions above are the test. Reaching this line means `tsc` accepted
  // every one of them, which is the whole claim.
  void [_orderRowMatchesTable, _orderItemRowMatchesTable];
});
