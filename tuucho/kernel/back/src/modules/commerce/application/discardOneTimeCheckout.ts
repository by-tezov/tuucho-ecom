import type pg from 'pg';

/**
 * Marks every still-available one-time address and card for this user as
 * consumed without linking an order. Used when the active cart is emptied or
 * deleted so a later cart cannot reuse "not remembered" checkout details.
 *
 * Also clears active-cart checkout selection fields that pointed at those
 * resources (and any one-time payment method id).
 */
async function discardUnconsumedOneTimeCheckoutResources(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<void> {
  await pool.query(
    `update addresses
        set checkout_use_status = 'one_time_consumed',
            one_time_consumed_at = now(),
            updated_at = now()
      where user_id = $1
        and not saved_for_future
        and checkout_use_status = 'one_time_available'`,
    [userId],
  );

  await pool.query(
    `update customer_card_retention
        set checkout_use_status = 'one_time_consumed',
            one_time_consumed_at = now(),
            updated_at = now()
      where user_id = $1
        and purpose = 'one_time'
        and checkout_use_status = 'one_time_available'`,
    [userId],
  );

  await pool.query(
    `update carts
        set address_id = case
              when address_id is not null and exists (
                select 1 from addresses a
                 where a.id = carts.address_id
                   and a.user_id = $1
                   and not a.saved_for_future
              ) then null else address_id end,
            billing_address_id = case
              when billing_address_id is not null and exists (
                select 1 from addresses a
                 where a.id = carts.billing_address_id
                   and a.user_id = $1
                   and not a.saved_for_future
              ) then null else billing_address_id end,
            payment_method_id = case
              when payment_method_id is not null
               and payment_method_id <> 'paypal'
               and payment_method_id <> 'bancontact'
               and payment_method_id <> 'google_pay'
               and payment_method_id <> 'apple_pay'
               and exists (
                select 1 from customer_card_retention r
                 where r.user_id = $1
                   and r.stripe_payment_method_id = carts.payment_method_id
                   and r.purpose = 'one_time'
              ) then null else payment_method_id end,
            updated_at = now()
      where user_id = $1 and is_active = true`,
    [userId],
  );
}

/** True when the active cart has at least one customer (non-gift) line. */
async function activeCartHasUserLines(pool: pg.Pool | pg.PoolClient, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ has_lines: boolean }>(
    `select exists(
       select 1
         from carts c
         join cart_items i on i.cart_id = c.id
        where c.user_id = $1 and c.is_active = true and i.origin = 'user'
     ) as has_lines`,
    [userId],
  );
  return rows[0]?.has_lines === true;
}

/** After a cart mutation: if the active cart has no user lines (or no active
 * cart), discard unconsumed one-time checkout resources. */
export async function discardOneTimeIfActiveCartEmpty(
  pool: pg.Pool | pg.PoolClient,
  userId: string,
): Promise<void> {
  if (await activeCartHasUserLines(pool, userId)) return;
  await discardUnconsumedOneTimeCheckoutResources(pool, userId);
}
