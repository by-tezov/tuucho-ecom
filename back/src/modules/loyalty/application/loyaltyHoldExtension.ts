import type pg from 'pg';

/** Keeps a reservation's still-held loyalty amount aligned with the
 * reservation's new expiry when the customer extends the checkout hold. */
export async function extendLoyaltyHold(
  client: pg.PoolClient,
  reservationId: string,
  expiresAt: Date,
): Promise<void> {
  await client.query(
    `update loyalty_holds set expires_at = $2, updated_at = now()
      where reservation_id = $1 and state = 'held'`,
    [reservationId, expiresAt],
  );
}
