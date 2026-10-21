import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { invalidateFilterOptionsCache } from './filterOptionsCache.js';

type Queryable = Pick<pg.Pool, 'query'>;

async function getLatestPrice(client: Queryable, productId: string): Promise<number | undefined> {
  const { rows } = await client.query<{ price: string }>(
    `select price from product_prices where product_id = $1 and effective_at <= now() order by effective_at desc limit 1`,
    [productId],
  );
  return rows[0] ? Number(rows[0].price) : undefined;
}

/** Batch form of getLatestPrice for feed/featured listings — one query
 * instead of N. `distinct on` picks each set's most recent effective_at
 * row, same "latest wins" rule as the single-set version. */
export async function getLatestPricesForSets(
  client: Queryable,
  productIds: string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const { rows } = await client.query<{ product_id: string; price: string }>(
    `select distinct on (product_id) product_id, price
     from product_prices
     where product_id = any($1::uuid[]) and effective_at <= now()
     order by product_id, effective_at desc`,
    [productIds],
  );
  return new Map(rows.map((row) => [row.product_id, Number(row.price)]));
}

/** Inserts a new price-history row only if it actually differs from the
 * latest one on file — same "no-op if unchanged" idempotency the rest of
 * library-import already follows, so re-running `npm run library` with the
 * same data-static.json price never piles up duplicate rows. */
export async function setPriceIfChanged(
  client: Queryable,
  productId: string,
  price: number,
): Promise<boolean> {
  const current = await getLatestPrice(client, productId);
  if (current === price) return false;
  await client.query(`insert into product_prices (id, product_id, price) values ($1, $2, $3)`, [
    randomUUID(),
    productId,
    price,
  ]);
  invalidateFilterOptionsCache();
  return true;
}
