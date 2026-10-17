import type pg from 'pg';

/** Moves a reservation's still-held voucher use to the reservation's new
 * expiry when the customer extends it, so the use is not counted free for
 * someone else while the checkout it belongs to is still open. */
export async function extendVoucherHoldsForReservation(
  client: pg.PoolClient,
  reservationId: string,
  expiresAt: Date,
): Promise<void> {
  await client.query(
    `update voucher_holds set expires_at = $2, updated_at = now()
     where reservation_id = $1 and state = 'held'`,
    [reservationId, expiresAt],
  );
}
