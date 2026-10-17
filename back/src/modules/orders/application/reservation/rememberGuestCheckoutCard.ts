import type pg from 'pg';
import type { GuestAddressInput } from '../pricing/checkoutPricing.js';
import {
  decryptCheckoutReservationSnapshot,
  encryptCheckoutReservationSnapshot,
  type CheckoutReservationSnapshot,
} from './checkoutReservationSnapshot.js';

type GuestSaved = NonNullable<CheckoutReservationSnapshot['guestSaved']>;

/** Pay-sheet remember is chosen after create-intent. Fold it into the
 * encrypted reservation so settlement (browser finalize or the webhook,
 * whichever lands first) saves the card without reading Stripe
 * `allow_redisplay`. */
export function guestSavedWithRememberCard(
  snapshot: CheckoutReservationSnapshot,
  rememberCard: boolean,
): GuestSaved | null | 'unchanged' {
  const current = snapshot.guestSaved ?? null;
  if (!current && !rememberCard) return 'unchanged';
  if (current?.rememberCard === rememberCard) return 'unchanged';
  if (current) return { ...current, rememberCard };
  return {
    rememberCard: true,
    rememberShipping: false,
    rememberBilling: false,
    shipping: shippingFromPriced(snapshot),
    billing: null,
  };
}

function shippingFromPriced(snapshot: CheckoutReservationSnapshot): GuestAddressInput {
  const address = snapshot.priced.address;
  const pickupPoints = address.pickup_points ?? {};
  const networkCode = snapshot.priced.networkCode;
  const fromPickup = Object.keys(pickupPoints);
  const networkCodes = networkCode ? [networkCode] : fromPickup;
  return {
    recipientName: address.recipient_name,
    companyName: address.company_name,
    line1: address.line1,
    line2: address.line2,
    deliveryNotes: address.delivery_notes,
    postalCode: address.postal_code,
    city: address.city,
    countryCode: address.country_code,
    phone: address.phone,
    networkCodes: networkCodes.length > 0 ? networkCodes : ['home'],
    pickupPoints,
    savedForFuture: false,
  };
}

export async function rememberGuestCheckoutCard(
  pool: pg.Pool,
  paymentIntentId: string,
  rememberCard: boolean,
): Promise<'updated' | 'not_found' | 'not_held'> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string; state: string; snapshot: unknown }>(
      `select reservation.id, reservation.state, snapshot.snapshot
         from stock_reservations reservation
         join checkout_reservation_snapshots snapshot
           on snapshot.reservation_id = reservation.id
        where reservation.stripe_payment_intent_id = $1
          and reservation.user_id is null
        for update`,
      [paymentIntentId],
    );
    const row = rows[0];
    if (!row) {
      await client.query('rollback');
      return 'not_found';
    }
    if (row.state !== 'held') {
      await client.query('rollback');
      return 'not_held';
    }
    const snapshot = decryptCheckoutReservationSnapshot(row.snapshot);
    if (!snapshot?.guestEmail) {
      await client.query('rollback');
      return 'not_found';
    }
    const nextSaved = guestSavedWithRememberCard(snapshot, rememberCard);
    if (nextSaved !== 'unchanged') {
      await client.query(
        `update checkout_reservation_snapshots
            set snapshot = $2::jsonb
          where reservation_id = $1`,
        [row.id, JSON.stringify(encryptCheckoutReservationSnapshot({ ...snapshot, guestSaved: nextSaved }))],
      );
    }
    await client.query('commit');
    return 'updated';
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
