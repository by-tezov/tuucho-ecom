import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import * as addresses from '../addresses/application/addresses.js';
import type { AddressKind, PickupPointMap } from '../addresses/application/addresses.js';
import { registerCard } from '../../payments/application/cardRetention.js';
import { decryptPii, emailLookupHash, encryptPii } from '../../../platform/security/piiCrypto.js';
import { detachPaymentMethod, attachRemotePaymentMethod, createRemoteCustomer, deleteRemoteCustomer, retrieveRemotePaymentMethod, updateRemotePaymentMethod, detachRemotePaymentMethod, type PaymentClient } from '../../../platform/stripe/stripeClient.js';
import { findUserById, setStripeCustomerId } from '../../identity/application/users.js';

export interface GuestSavedAddressInput {
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  deliveryNotes: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  phone: string | null;
  networkCodes: string[];
  pickupPoints: PickupPointMap;
  label?: string | null;
  savedForFuture?: boolean;
}

export interface GuestSavedCheckoutIntent {
  rememberCard: boolean;
  rememberShipping: boolean;
  rememberBilling: boolean;
  shipping: GuestSavedAddressInput;
  billing: GuestSavedAddressInput | null;
}

interface SavedAddressRow {
  id: string;
  kind: AddressKind;
  label: string | null;
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  delivery_notes: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
  pickup_points: PickupPointMap;
  network_codes: unknown;
}

interface SavedCardRow {
  id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
}

function deleteAfterIso(): string {
  return new Date(Date.now() + config.emailConfirmation.tokenTtlMs).toISOString();
}

function stripeCustomerIdOf(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

function networkCodesOf(value: unknown, pickupPoints: PickupPointMap): string[] {
  const codes = Array.isArray(value)
    ? value.filter((code): code is string => typeof code === 'string' && code.length > 0)
    : [];
  if (Object.keys(pickupPoints).length > 0) {
    const pickup = codes.filter((code) => code !== 'home');
    return pickup.length > 0 ? pickup : Object.keys(pickupPoints);
  }
  return codes.length > 0 ? codes : ['home'];
}

export function guestSavedIntentFromCheckout(
  address: GuestSavedAddressInput,
  billingAddress: GuestSavedAddressInput | undefined,
  rememberCard: boolean,
): GuestSavedCheckoutIntent | null {
  const rememberShipping = address.savedForFuture === true;
  const rememberBilling = billingAddress?.savedForFuture === true;
  if (!rememberShipping && !rememberBilling && !rememberCard) return null;
  return {
    rememberCard,
    rememberShipping,
    rememberBilling,
    shipping: address,
    billing: billingAddress ?? null,
  };
}

export async function hasUnclaimedGuestSavedCheckout(pool: pg.Pool, email: string): Promise<boolean> {
  const lookup = emailLookupHash(email);
  const { rows } = await pool.query<{ present: boolean }>(
    `select exists(
       select 1 from guest_saved_addresses where email_lookup = $1
       union all
       select 1 from guest_saved_cards where email_lookup = $1
     ) as present`,
    [lookup],
  );
  return rows[0]?.present === true;
}

/** Extends unclaimed pending rows to match a freshly issued manage token. */
export async function refreshGuestSavedCheckoutExpiry(pool: pg.Pool, email: string): Promise<void> {
  const lookup = emailLookupHash(email);
  const expires = deleteAfterIso();
  await pool.query(`update guest_saved_addresses set delete_after = $2 where email_lookup = $1`, [
    lookup,
    expires,
  ]);
  await pool.query(`update guest_saved_cards set delete_after = $2 where email_lookup = $1`, [
    lookup,
    expires,
  ]);
}

async function insertSavedAddress(
  pool: pg.Pool,
  orderId: string,
  email: string,
  kind: AddressKind,
  address: GuestSavedAddressInput,
): Promise<void> {
  const pickupPoints = kind === 'facturation' ? {} : address.pickupPoints;
  const networkCodes = kind === 'facturation' ? [] : networkCodesOf(address.networkCodes, pickupPoints);
  await pool.query(
    `insert into guest_saved_addresses (
       id, order_id, email, email_lookup, kind, label, recipient_name, company_name,
       line1, line2, delivery_notes, postal_code, city, country_code, phone,
       pickup_points, network_codes, delete_after
     ) values (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18
     )`,
    [
      randomUUID(),
      orderId,
      encryptPii(email),
      emailLookupHash(email),
      kind,
      encryptPii(address.label ?? null),
      encryptPii(address.recipientName),
      encryptPii(address.companyName),
      encryptPii(address.line1),
      encryptPii(address.line2),
      encryptPii(kind === 'facturation' ? null : address.deliveryNotes),
      encryptPii(address.postalCode),
      encryptPii(address.city),
      address.countryCode,
      encryptPii(address.phone),
      JSON.stringify(kind === 'facturation' ? {} : address.pickupPoints),
      JSON.stringify(networkCodes),
      deleteAfterIso(),
    ],
  );
}

/** After a paid guest order: keep remembered address/card rows until a
 * manage-order token claims them (or the cron deletes them).
 *
 * `rememberCard` on the reservation snapshot is set at create-intent time
 * (saved vault card). For `method: "new_card"` the customer opts in only in
 * the pay sheet via Stripe `allow_redisplay: always` on confirm — that wins
 * over a false snapshot flag so claim-by-email still imports the card. */
export async function persistGuestSavedCheckout(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  input: {
    email: string;
    orderId: string;
    intent: GuestSavedCheckoutIntent;
    paymentMethodId?: string | null;
  },
): Promise<void> {
  const paymentMethodId = input.paymentMethodId;
  let rememberCard = input.intent.rememberCard;
  if (
    !rememberCard &&
    stripe &&
    paymentMethodId &&
    !paymentMethodId.startsWith('free:')
  ) {
    try {
      const pm = await retrieveRemotePaymentMethod(stripe, paymentMethodId);
      if (pm.allow_redisplay === 'always') rememberCard = true;
    } catch (error) {
      console.error('[guest-saved] allow_redisplay lookup failed', error);
    }
  }

  if (input.intent.rememberShipping) {
    try {
      await insertSavedAddress(pool, input.orderId, input.email, 'livraison', input.intent.shipping);
    } catch (error) {
      console.error('[guest-saved] persist remembered shipping address failed', error);
    }
  }
  if (input.intent.rememberBilling && input.intent.billing) {
    try {
      await insertSavedAddress(pool, input.orderId, input.email, 'facturation', input.intent.billing);
    } catch (error) {
      console.error('[guest-saved] persist remembered billing address failed', error);
    }
  }

  if (!rememberCard || !stripe || !paymentMethodId || paymentMethodId.startsWith('free:')) {
    return;
  }

  let pendingCustomerId: string | null = null;
  try {
    const pm = await retrieveRemotePaymentMethod(stripe, paymentMethodId);
    if (pm.type !== 'card') return;
    let customerId = stripeCustomerIdOf(pm.customer);
    if (!customerId) {
      const customer = await createRemoteCustomer(stripe, {
        email: input.email,
        metadata: { pendingGuestSaved: 'true', orderId: input.orderId },
      });
      pendingCustomerId = customer.id;
      customerId = customer.id;
      await attachRemotePaymentMethod(stripe, paymentMethodId, { customer: customerId });
    }
    const attached = await retrieveRemotePaymentMethod(stripe, paymentMethodId);
    if (attached.type !== 'card') {
      if (pendingCustomerId) await deleteRemoteCustomer(stripe, pendingCustomerId);
      return;
    }
    await updateRemotePaymentMethod(stripe, paymentMethodId, { allow_redisplay: 'always' });
    const fingerprint = attached.card?.fingerprint ?? null;
    await pool.query(
      `insert into guest_saved_cards (
         id, order_id, email, email_lookup, stripe_customer_id, stripe_payment_method_id,
         card_fingerprint, brand, last4, exp_month, exp_year, cardholder_name, delete_after
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        randomUUID(),
        input.orderId,
        encryptPii(input.email),
        emailLookupHash(input.email),
        customerId,
        attached.id,
        fingerprint,
        attached.card?.brand ?? null,
        attached.card?.last4 ?? null,
        attached.card?.exp_month ?? null,
        attached.card?.exp_year ?? null,
        encryptPii(attached.billing_details.name ?? null),
        deleteAfterIso(),
      ],
    );
  } catch (error) {
    console.error('[guest-saved] persist remembered card failed', error);
    if (pendingCustomerId) {
      try {
        await deleteRemoteCustomer(stripe, pendingCustomerId);
      } catch {
        // Leftover pending customer — operator can remove it in Stripe.
      }
    }
  }
}

async function attachSavedAddresses(pool: pg.Pool, userId: string, email: string): Promise<void> {
  const lookup = emailLookupHash(email);
  const { rows } = await pool.query<SavedAddressRow>(
    `select id, kind, label, recipient_name, company_name, line1, line2, delivery_notes,
            postal_code, city, country_code, phone, pickup_points, network_codes
     from guest_saved_addresses where email_lookup = $1`,
    [lookup],
  );
  for (const row of rows) {
    try {
      await addresses.create(pool, userId, {
        kind: row.kind,
        label: decryptPii(row.label) ?? undefined,
        recipientName: decryptPii(row.recipient_name) ?? undefined,
        companyName: decryptPii(row.company_name) ?? undefined,
        line1: decryptPii(row.line1)!,
        line2: decryptPii(row.line2) ?? undefined,
        deliveryNotes: decryptPii(row.delivery_notes) ?? undefined,
        postalCode: decryptPii(row.postal_code)!,
        city: decryptPii(row.city)!,
        countryCode: row.country_code,
        phone: decryptPii(row.phone) ?? undefined,
        networkCodes: networkCodesOf(row.network_codes, row.pickup_points ?? {}),
        pickupPoints: row.pickup_points ?? {},
        savedForFuture: true,
      });
      await pool.query(`delete from guest_saved_addresses where id = $1`, [row.id]);
    } catch (error) {
      console.error('[guest-saved] attach address failed', error);
    }
  }
}

async function attachSavedCards(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  userId: string,
  email: string,
): Promise<void> {
  const lookup = emailLookupHash(email);
  const { rows } = await pool.query<SavedCardRow>(
    `select id, stripe_customer_id, stripe_payment_method_id
     from guest_saved_cards where email_lookup = $1`,
    [lookup],
  );
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      if (!stripe) continue;
      let user = await findUserById(pool, userId);
      if (!user) continue;
      const pm = await retrieveRemotePaymentMethod(stripe, row.stripe_payment_method_id);
      if (pm.type !== 'card') {
        await pool.query(`delete from guest_saved_cards where id = $1`, [row.id]);
        continue;
      }
      const pmCustomerId = stripeCustomerIdOf(pm.customer);
      if (!user.stripe_customer_id) {
        const adoptId = pmCustomerId ?? row.stripe_customer_id;
        await setStripeCustomerId(pool, userId, adoptId);
        user = { ...user, stripe_customer_id: adoptId };
      } else if (pmCustomerId && pmCustomerId !== user.stripe_customer_id) {
        // Move off the pending guest customer before registerCard, which
        // refuses a PaymentMethod already attached to someone else.
        await detachRemotePaymentMethod(stripe, row.stripe_payment_method_id);
      }
      await registerCard(pool, stripe, userId, row.stripe_payment_method_id, true);
      if (row.stripe_customer_id !== user.stripe_customer_id) {
        try {
          await deleteRemoteCustomer(stripe, row.stripe_customer_id);
        } catch {
          // Pending customer may already be gone.
        }
      }
      await pool.query(`delete from guest_saved_cards where id = $1`, [row.id]);
    } catch (error) {
      console.error('[guest-saved] attach card failed', error);
    }
  }
}

/** Token-gated: copy unclaimed remembered rows onto this account. Independent
 * register / independent login / integrity-code claim must not call this. */
export async function attachUnclaimedGuestSavedCheckout(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  userId: string,
  email: string,
): Promise<void> {
  await attachSavedAddresses(pool, userId, email);
  await attachSavedCards(pool, stripe, userId, email);
}

export async function processExpiredGuestSavedCheckout(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
): Promise<{ addresses: number; cards: number }> {
  const { rows: addressRows } = await pool.query<{ id: string }>(
    `delete from guest_saved_addresses where delete_after <= now() returning id`,
  );

  const { rows: cardRows } = await pool.query<SavedCardRow>(
    `select id, stripe_customer_id, stripe_payment_method_id
     from guest_saved_cards where delete_after <= now()`,
  );
  let cards = 0;
  for (const row of cardRows) {
    if (stripe) {
      try {
        await detachPaymentMethod(stripe, row.stripe_customer_id, row.stripe_payment_method_id);
      } catch {
        // Already detached — still drop the pending customer and row.
      }
      try {
        await deleteRemoteCustomer(stripe, row.stripe_customer_id);
      } catch {
        // Customer already gone.
      }
    }
    await pool.query(`delete from guest_saved_cards where id = $1`, [row.id]);
    cards += 1;
  }
  return { addresses: addressRows.length, cards };
}
