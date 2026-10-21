import type pg from 'pg';

/** Preserve the exact physical allocation before the send transition removes
 * its consumed reservation. Order-line display quantities cannot reconstruct
 * quantity-pack accessory units later. */
export async function snapshotOrderFulfillmentStock(client: pg.PoolClient, orderId: string): Promise<void> {
  await client.query(
    `insert into order_fulfillment_stock (
       order_id, product_id, product_uid, shape_key, length_key, size,
       shipped_quantity
     )
     select $1, sri.product_id, p.product_uid, sri.shape_key,
            sri.length_key, sri.size, sum(sri.quantity)::int
       from stock_reservation_items sri
       join stock_reservations sr on sr.id = sri.reservation_id
       join products p on p.id = sri.product_id
      where sr.order_id = $1 and sr.state = 'consumed'
      group by sri.product_id, p.product_uid, sri.shape_key,
               sri.length_key, sri.size
     on conflict (order_id, product_uid, shape_key, length_key, size)
     do nothing`,
    [orderId],
  );
}
