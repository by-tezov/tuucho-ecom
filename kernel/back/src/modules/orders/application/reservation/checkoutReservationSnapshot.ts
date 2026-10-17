import type pg from 'pg';
import { decryptJsonPii, encryptPii } from '../../../../platform/security/piiCrypto.js';
import type { AccessoryType } from '../../../catalog/domain/accessoryPacks.js';
import { dbPacks, stockUnitsForLine } from '../../../catalog/domain/accessoryPacks.js';
import type { GuestAddressInput, PricedCheckout, StockReservationItem } from '../pricing/checkoutPricing.js';

/** The exact server-priced checkout that stock was allocated for. It is
 * deliberately stored separately from the mutable cart: a customer can take
 * time in a redirect payment flow, change another tab, or return through a
 * webhook, without changing what their already-authorized payment buys. */
export interface CheckoutReservationSnapshot {
  version: 1;
  priced: PricedCheckout;
  cartId?: string;
  /** Guest owner recovery when Stripe metadata is incomplete. Stored only
   * inside the encrypted snapshot; authenticated reservations omit it. */
  guestEmail?: string;
  guestSaved?: {
    rememberCard: boolean;
    rememberShipping: boolean;
    rememberBilling: boolean;
    shipping: GuestAddressInput;
    billing: GuestAddressInput | null;
  } | null;
}

export function encryptCheckoutReservationSnapshot(snapshot: CheckoutReservationSnapshot): { enc: string } {
  return { enc: encryptPii(JSON.stringify(snapshot))! };
}

export function decryptCheckoutReservationSnapshot(stored: unknown): CheckoutReservationSnapshot | null {
  if (!stored || typeof stored !== 'object' || !('enc' in stored)) return null;
  const enc = (stored as { enc: unknown }).enc;
  if (typeof enc !== 'string') return null;
  const decrypted = decryptJsonPii(enc);
  if (
    !decrypted ||
    typeof decrypted !== 'object' ||
    (decrypted as { version?: unknown }).version !== 1 ||
    !(decrypted as { priced?: unknown }).priced ||
    typeof (decrypted as { priced?: unknown }).priced !== 'object' ||
    !Array.isArray((decrypted as { priced: { items?: unknown } }).priced.items)
  ) {
    return null;
  }
  const snapshot = decrypted as CheckoutReservationSnapshot;
  snapshot.priced.extraLines ??= [];
  snapshot.priced.plugins ??= {};
  return snapshot;
}

export async function saveCheckoutReservationSnapshot(
  client: pg.PoolClient,
  reservationId: string,
  priced: PricedCheckout,
  guestSaved?: CheckoutReservationSnapshot['guestSaved'],
  guestEmail?: string,
  cartId?: string,
): Promise<void> {
  await client.query(
    `insert into checkout_reservation_snapshots (reservation_id, snapshot)
     values ($1, $2::jsonb)`,
    [
      reservationId,
      JSON.stringify(
        encryptCheckoutReservationSnapshot({ version: 1, priced, guestSaved, guestEmail, cartId }),
      ),
    ],
  );
}

export async function loadCheckoutReservationSnapshot(
  client: pg.PoolClient,
  reservationId: string,
): Promise<CheckoutReservationSnapshot | null> {
  const { rows } = await client.query<{ snapshot: unknown }>(
    `select snapshot from checkout_reservation_snapshots where reservation_id = $1`,
    [reservationId],
  );
  return rows[0] ? decryptCheckoutReservationSnapshot(rows[0].snapshot) : null;
}

/** Confirms that the immutable priced lines still match the physical stock
 * units allocated to a reservation. Authenticated and guest checkout share
 * this integrity check; accessories may represent multiple stock units per
 * displayed pack, so the comparison must use the accessory pack multiplier. */
export async function reservationMatchesPricedItems(
  client: pg.PoolClient,
  reservationId: string,
  items: PricedCheckout['items'],
): Promise<boolean> {
  const { rows: reservationItems } = await client.query<StockReservationItem>(
    `select product_id, shape_key, length_key, size, quantity
     from stock_reservation_items where reservation_id = $1`,
    [reservationId],
  );
  // Composed sets hold no stock, so reserveCart never gave them a
  // reservation row (see reserveGuestCart / reserveCart): compare only the
  // lines that were actually reserved.
  const reservable = items.filter(({ line }) => line.product_id);
  const productIds = [
    ...new Set(reservable.map(({ line }) => line.product_id).filter((id): id is string => !!id)),
  ];
  const { rows: accessoryRows } = productIds.length
    ? await client.query<{ id: string; accessory_type: AccessoryType; accessory_packs: unknown }>(
        `select id, accessory_type, accessory_packs from products where id = any($1::uuid[])`,
        [productIds],
      )
    : { rows: [] as { id: string; accessory_type: AccessoryType; accessory_packs: unknown }[] };
  const accessoryById = new Map(accessoryRows.map((row) => [row.id, row]));
  return (
    reservationItems.length === reservable.length &&
    reservable.every(({ line }) => {
      const productInfo = line.product_id ? accessoryById.get(line.product_id) : undefined;
      const expectedUnits = productInfo
        ? (stockUnitsForLine(
            productInfo.accessory_type,
            dbPacks(productInfo.accessory_packs),
            line.pack_key,
            line.quantity,
          ) ?? line.quantity)
        : line.quantity;
      return reservationItems.some(
        (item) =>
          item.product_id === line.product_id &&
          item.shape_key === line.shape_key &&
          item.length_key === line.length_key &&
          item.size === line.size &&
          item.quantity === expectedUnits,
      );
    })
  );
}

/** Reservation snapshots are checkout-only data. Unlinked abandoned holds
 * can be removed immediately. A reservation linked to Stripe is retained for
 * seven days so a delayed signed webhook can still create a `need_review`
 * order from the exact paid snapshot; explicit failed/canceled PI paths
 * remove their own snapshot immediately. */
export async function purgeTemporaryCheckoutReservationSnapshots(
  client: pg.Pool | pg.PoolClient,
  reservationId?: string,
): Promise<void> {
  await client.query(
    `delete from checkout_reservation_snapshots snapshot
     using stock_reservations reservation
     where snapshot.reservation_id = reservation.id
       and (
         (reservation.stripe_payment_intent_id is null
           and (reservation.state = 'released' or reservation.expires_at <= now()))
         or snapshot.created_at <= now() - interval '7 days'
       )
       and ($1::uuid is null or reservation.id = $1)`,
    [reservationId ?? null],
  );
}

export interface ReservableLine {
  product_id: string;
  shape_key: string;
  length_key: string;
  size: string;
  /** Stock units, not line quantity — a byQuantity pack consumes
   * quantity × multiplier (see stockUnitsForLine). */
  stockUnits: number;
}

/** One multi-row insert instead of one statement per line. Shared by the
 * authenticated and guest reservation paths, which build identical rows. */
export async function insertReservationItems(
  client: pg.PoolClient,
  reservationId: string,
  rows: ReservableLine[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.query(
    `insert into stock_reservation_items (reservation_id, product_id, shape_key, length_key, size, quantity)
     select $1, product_id, shape_key, length_key, size, quantity
       from (
         select unnest($2::uuid[])    as product_id,
                unnest($3::text[])    as shape_key,
                unnest($4::text[])    as length_key,
                unnest($5::text[])    as size,
                unnest($6::integer[]) as quantity
       ) as line`,
    [
      reservationId,
      rows.map((row) => row.product_id),
      rows.map((row) => row.shape_key),
      rows.map((row) => row.length_key),
      rows.map((row) => row.size),
      rows.map((row) => row.stockUnits),
    ],
  );
}
