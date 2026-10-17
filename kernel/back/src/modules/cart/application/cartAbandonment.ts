import type pg from 'pg';
import * as cart from './cart.js';
import type { CartItemRow } from './cart.js';
import { cartAbandonedSpyEmail, sendMail, spyTo } from '../../messaging/application/email.js';
import type { PartialTrilingual } from '../../../types.js';
import { localize } from '../../../utils/language.js';

async function fetchGallerySetLabels(pool: pg.Pool, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { nailRef: string; title: string }>();
  const { rows } = await pool.query<{
    id: string;
    product_uid: string;
    title: PartialTrilingual;
  }>(`select id, product_uid, title from products where id = any($1::uuid[])`, [productIds]);
  return new Map(rows.map((row) => [row.id, { nailRef: row.product_uid, title: localize(row.title, 'fr') }]));
}

export async function notifyCartAbandoned(
  pool: pg.Pool,
  userId: string,
  userEmail: string,
  removedItem: CartItemRow,
): Promise<void> {
  const staffTo = await spyTo('cart_abandoned');
  if (!staffTo) return;
  if ((await cart.listForUser(pool, userId)).length > 0) return;

  const label = (await fetchGallerySetLabels(pool, [removedItem.product_id])).get(removedItem.product_id);
  void sendMail({
    to: staffTo,
    ...cartAbandonedSpyEmail({
      userEmail,
      userId,
      removedItem: {
        productId: removedItem.product_id,
        nailRef: label?.nailRef ?? removedItem.product_id,
        title: label?.title ?? '(article introuvable)',
        shapeKey: removedItem.shape_key,
        size: removedItem.size,
        quantity: removedItem.quantity,
      },
    }),
  }).catch((error) => {
    console.error('[cart] abandonment spy notification failed', error);
  });
}
