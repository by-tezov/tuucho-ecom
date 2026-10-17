import type pg from 'pg';

export interface GiftItemRow {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  packKey: string;
  quantity: number;
  unitPrice: number;
  productUid: string;
  productType: string;
}

const GIFT_LINE_UNIT_PRICE_SQL = `case
  when gs.accessory_type = 'byQuantity' and gi.pack_key <> '' and (gs.accessory_pack_prices ? gi.pack_key)
    then coalesce((gs.accessory_pack_prices ->> gi.pack_key)::numeric, 0)
  when gs.accessory_type = 'byQuantity' and gi.pack_key <> ''
    then coalesce((
      select gsp.price from product_prices gsp
      where gsp.product_id = gi.product_id and gsp.effective_at <= now()
      order by gsp.effective_at desc limit 1
    ), 0) * coalesce((gs.accessory_packs ->> gi.pack_key)::numeric, 0)
  else coalesce((
    select gsp.price from product_prices gsp
    where gsp.product_id = gi.product_id and gsp.effective_at <= now()
    order by gsp.effective_at desc limit 1
  ), 0)
end`;

export async function listGiftItems(db: pg.Pool | pg.PoolClient, offerId: string): Promise<GiftItemRow[]> {
  const { rows } = await db.query<{
    product_id: string;
    shape_key: string;
    length_key: string;
    size: string;
    pack_key: string;
    quantity: number;
    unit_price: string;
    product_uid: string;
    product_type: string;
  }>(
    `select gi.product_id, gi.shape_key, gi.length_key, gi.size, gi.pack_key, gi.quantity,
            ${GIFT_LINE_UNIT_PRICE_SQL} as unit_price, gs.product_uid, gs.product_type
     from gift_items gi
     join products gs on gs.id = gi.product_id
     where gi.offer_id = $1
     order by gi.created_at, gi.product_id`,
    [offerId],
  );
  return rows.map((row) => ({
    productId: row.product_id,
    shapeKey: row.shape_key,
    lengthKey: row.length_key,
    size: row.size,
    packKey: row.pack_key ?? '',
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    productUid: row.product_uid,
    productType: row.product_type,
  }));
}

export async function upsertGiftItem(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  item: {
    productId: string;
    shapeKey: string;
    lengthKey: string;
    size: string;
    packKey: string;
    quantity: number;
  },
): Promise<void> {
  if (item.quantity <= 0) {
    await db.query(
      `delete from gift_items
       where offer_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5`,
      [offerId, item.productId, item.shapeKey, item.lengthKey, item.size],
    );
    return;
  }
  await db.query(
    `insert into gift_items (offer_id, product_id, shape_key, length_key, size, pack_key, quantity)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (offer_id, product_id, shape_key, length_key, size)
     do update set quantity = excluded.quantity, pack_key = excluded.pack_key, updated_at = now()`,
    [offerId, item.productId, item.shapeKey, item.lengthKey, item.size, item.packKey, item.quantity],
  );
}

export async function deleteGiftItem(
  db: pg.Pool | pg.PoolClient,
  offerId: string,
  item: { productId: string; shapeKey: string; lengthKey: string; size: string },
): Promise<void> {
  await db.query(
    `delete from gift_items
     where offer_id = $1 and product_id = $2 and shape_key = $3 and length_key = $4 and size = $5`,
    [offerId, item.productId, item.shapeKey, item.lengthKey, item.size],
  );
}
