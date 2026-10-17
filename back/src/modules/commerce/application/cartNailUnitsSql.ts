/**
 * Purchasable catalogue nail-set units on a cart, as one scalar SQL
 * expression bound to `$1 = cart_id`. Feeds `gift_per_nail_set` for
 * catalogue sets. Composed sets are counted beside it, once each holds at
 * least the rule's `minNails`.
 *
 * Out-of-stock user lines do not earn a gift — this mirrors priceCheckout,
 * which drops `available_quantity === 0` lines before recomputing gift
 * quantity for the actual order. Without it, a nail line that has since sold
 * out elsewhere still counted at its full stored quantity, so the cart kept
 * showing (and granting) a gift kit that checkout would never honor.
 *
 */
export const CART_SET_UNITS_SQL = `(
  coalesce((
    select sum(ci.quantity)
    from cart_items ci
    join products p on p.id = ci.product_id
    where ci.cart_id = $1 and ci.origin = 'user' and p.product_type = 'nail'
      and coalesce((
        select greatest(pa.quantity - coalesce((
          select sum(sri.quantity)
          from stock_reservation_items sri
          join stock_reservations sr on sr.id = sri.reservation_id
          where sri.product_id = pa.product_id
            and sri.shape_key = pa.shape_key
            and sri.length_key = pa.length_key
            and sri.size = pa.size
            and (sr.state = 'consumed' or (sr.state = 'held' and sr.expires_at > now()))
        ), 0), 0)::integer
        from product_availability pa
        where pa.product_id = ci.product_id and pa.shape_key = ci.shape_key
          and pa.length_key = ci.length_key and pa.size = ci.size
      ), 0) > 0
  ), 0)
)`;
