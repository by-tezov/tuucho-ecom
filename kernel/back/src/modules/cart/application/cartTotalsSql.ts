/**
 * SQL fragments for a cart's headline numbers, shared by the cart list and
 * the single-cart summary returned after every mutation. They live here so
 * the two can never disagree about what a cart holds — a composed nail set
 * has to count in both, or adding one would leave the switcher showing the
 * cart as it was before.
 *
 * Every fragment is correlated on `c.id`, so the caller only has to select
 * from `carts c`.
 */

/** Paid-line unit price only — rule/gift lines never contribute to cart totals.
 * byQuantity lines use explicit pack prices when present, otherwise unit × multiplier. */
const CART_LINE_UNIT_PRICE_SQL = `case
  when ci.origin = 'rule' then 0
  when gs.accessory_type = 'byQuantity' and ci.pack_key <> '' and (gs.accessory_pack_prices ? ci.pack_key)
    then coalesce((gs.accessory_pack_prices ->> ci.pack_key)::numeric, 0)
  when gs.accessory_type = 'byQuantity' and ci.pack_key <> ''
    then coalesce((
      select gsp.price from product_prices gsp
      where gsp.product_id = ci.product_id and gsp.effective_at <= now()
      order by gsp.effective_at desc limit 1
    ), 0) * coalesce((gs.accessory_packs ->> ci.pack_key)::numeric, 0)
  else coalesce((
    select gsp.price from product_prices gsp
    where gsp.product_id = ci.product_id and gsp.effective_at <= now()
    order by gsp.effective_at desc limit 1
  ), 0)
end`;

/** Lines counted as cards (not units) — this is what the cart switcher
 * prints as "N articles". Plugins add extra cards through cart.summaries. */
export const CART_ITEM_COUNT_SQL = `(
  coalesce((select count(*)::int from cart_items ci where ci.cart_id = c.id), 0)
)`;

export const CART_TOTAL_SQL = `(
  coalesce((
    select sum(ci.quantity * ${CART_LINE_UNIT_PRICE_SQL})
    from cart_items ci
    left join products gs on gs.id = ci.product_id
    where ci.cart_id = c.id
  ), 0)
)`;
