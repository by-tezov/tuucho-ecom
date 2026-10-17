import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { config } from '../../../config/env.js';
import { detachPaymentMethod, getOrCreateCustomerId, retrievePaymentIntent, retrieveRemotePaymentMethod, attachRemotePaymentMethod, updateRemotePaymentMethod, type PaymentClient, type PublicPaymentMethod } from '../../../platform/stripe/stripeClient.js';
import { decryptPii, encryptPii } from '../../../platform/security/piiCrypto.js';

export type CardPurpose = 'one_time' | 'saved';
export type CheckoutUseStatus = 'saved' | 'one_time_available' | 'one_time_consumed';

interface RetentionRow {
  id: string;
  user_id: string;
  stripe_payment_method_id: string;
  card_fingerprint: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  cardholder_name: string | null;
  purpose: CardPurpose;
  checkout_use_status: CheckoutUseStatus;
  one_time_consumed_order_id: string | null;
  one_time_consumed_at: string | null;
  delete_after: string | null;
  last_order_id: string | null;
  checkout_privacy_session_id: string | null;
}

function retentionDaysMs(): number {
  return config.oneTimeCardRetentionDays * 24 * 60 * 60 * 1000;
}

function provisionalDeleteAfter(): Date {
  return new Date(Date.now() + retentionDaysMs());
}

/** A checkout may only name a saved card or a still-unconsumed one-time
 * card. This query deliberately does not trust the browser's cached Stripe
 * PaymentMethod id. */
export async function isPaymentMethodAvailableForCheckout(
  pool: pg.Pool,
  userId: string,
  paymentMethodId: string,
  checkoutPrivacySessionId?: string,
): Promise<boolean> {
  const { rows } = await pool.query<{ available: boolean }>(
    `select exists(
       select 1 from customer_card_retention
        where user_id = $1 and stripe_payment_method_id = $2
          and (
            (purpose = 'saved' and checkout_use_status = 'saved')
            or (purpose = 'one_time' and checkout_use_status = 'one_time_available'
                and checkout_privacy_session_id = $3)
          )
     ) as available`,
    [userId, paymentMethodId, checkoutPrivacySessionId ?? null],
  );
  return rows[0]?.available === true;
}

/** Called inside confirmOrder's transaction. The row lock and compare-and-set
 * make a one-time card single-use even if two tabs finish payment together.
 *
 * This happens before the `orders` insert, so it must not assign either
 * order foreign key yet. The caller links those fields after inserting the
 * order, still under this same transaction and row lock.
 *
 * No retention row means the PaymentMethod was never registered through
 * "add card" — Google Pay / Apple Pay (and any other checkout-only wallet
 * card) create a fresh pm_… at confirm time. Those must be allowed through;
 * returning false here used to fail every signed-in wallet checkout after
 * Stripe already authorized the hold (guest confirm skips this path entirely).
 * Saved and one-time Add-Card methods always have a row by create-intent time. */
export async function consumeOneTimeCardForOrder(
  client: pg.PoolClient,
  userId: string,
  paymentMethodId: string,
): Promise<boolean> {
  const { rows } = await client.query<RetentionRow>(
    `select * from customer_card_retention
     where user_id = $1 and stripe_payment_method_id = $2
     for update`,
    [userId, paymentMethodId],
  );
  const row = rows[0];
  if (!row) return true;
  if (row.purpose === 'saved' && row.checkout_use_status === 'saved') return true;
  if (row.purpose !== 'one_time' || row.checkout_use_status !== 'one_time_available') return false;

  await client.query(
    `update customer_card_retention
       set checkout_use_status = 'one_time_consumed',
           one_time_consumed_at = now(),
           delete_after = greatest(coalesce(delete_after, $2::timestamptz), $2::timestamptz),
           updated_at = now()
     where id = $1`,
    [row.id, provisionalDeleteAfter().toISOString()],
  );
  return true;
}

function toPublic(row: RetentionRow): PublicPaymentMethod {
  return {
    id: row.stripe_payment_method_id,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    cardholderName: decryptPii(row.cardholder_name),
  };
}

function cardFieldsFromStripe(pm: any): {
  fingerprint: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  cardholderName: string | null;
} {
  const fingerprint = pm.card?.fingerprint;
  if (!fingerprint) throw new Error(`PaymentMethod ${pm.id} has no card fingerprint`);
  return {
    fingerprint,
    brand: pm.card?.brand ?? 'unknown',
    last4: pm.card?.last4 ?? '',
    expMonth: pm.card?.exp_month ?? 0,
    expYear: pm.card?.exp_year ?? 0,
    cardholderName: pm.billing_details.name ?? null,
  };
}

async function setAllowRedisplay(
  stripe: PaymentClient,
  paymentMethodId: string,
  allowRedisplay: 'always' | 'limited',
): Promise<void> {
  await updateRemotePaymentMethod(stripe, paymentMethodId, { allow_redisplay: allowRedisplay });
}

async function findByPaymentMethodId(
  pool: pg.Pool,
  paymentMethodId: string,
): Promise<RetentionRow | undefined> {
  const { rows } = await pool.query<RetentionRow>(
    `select * from customer_card_retention where stripe_payment_method_id = $1`,
    [paymentMethodId],
  );
  return rows[0];
}

async function upsertRow(
  pool: pg.Pool,
  input: {
    userId: string;
    paymentMethodId: string;
    fingerprint: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    cardholderName: string | null;
    purpose: CardPurpose;
    checkoutUseStatus: CheckoutUseStatus;
    deleteAfter: Date | null;
    checkoutPrivacySessionId: string | null;
  },
): Promise<RetentionRow> {
  const existing = await findByPaymentMethodId(pool, input.paymentMethodId);
  if (existing) {
    const { rows } = await pool.query<RetentionRow>(
      `update customer_card_retention
       set brand = $2,
           last4 = $3,
           exp_month = $4,
           exp_year = $5,
           cardholder_name = $6,
           purpose = $7,
           delete_after = $8,
           checkout_use_status = $9,
           checkout_privacy_session_id = $10,
           one_time_consumed_order_id = null,
           one_time_consumed_at = null,
           updated_at = now()
       where id = $1
       returning *`,
      [
        existing.id,
        input.brand,
        input.last4,
        input.expMonth,
        input.expYear,
        encryptPii(input.cardholderName),
        input.purpose,
        input.deleteAfter?.toISOString() ?? null,
        input.checkoutUseStatus,
        input.checkoutPrivacySessionId,
      ],
    );
    return rows[0]!;
  }

  const { rows } = await pool.query<RetentionRow>(
    `insert into customer_card_retention (
       id, user_id, stripe_payment_method_id, card_fingerprint,
       brand, last4, exp_month, exp_year, cardholder_name,
       purpose, delete_after, checkout_use_status, checkout_privacy_session_id
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning *`,
    [
      randomUUID(),
      input.userId,
      input.paymentMethodId,
      input.fingerprint,
      input.brand,
      input.last4,
      input.expMonth,
      input.expYear,
      encryptPii(input.cardholderName),
      input.purpose,
      input.deleteAfter?.toISOString() ?? null,
      input.checkoutUseStatus,
      input.checkoutPrivacySessionId,
    ],
  );
  return rows[0]!;
}

/** After SetupIntent / guest attach: sync Stripe allow_redisplay with our
 * retention row and upgrade one_time → saved when the customer checks
 * remember. Same PAN (fingerprint) may exist as several rows — each new
 * PaymentMethod keeps its own id. */
export async function registerCard(
  pool: pg.Pool,
  stripe: PaymentClient,
  userId: string,
  paymentMethodId: string,
  savedForFuture: boolean,
  checkoutPrivacySessionId?: string,
): Promise<PublicPaymentMethod> {
  const customerId = await getOrCreateCustomerId(pool, stripe, userId);
  const pm = await retrieveRemotePaymentMethod(stripe, paymentMethodId);
  if (pm.type !== 'card') throw new Error('payment_method_not_card');
  if (pm.customer && pm.customer !== customerId) throw new Error('payment_method_wrong_customer');
  if (!pm.customer) {
    await attachRemotePaymentMethod(stripe, paymentMethodId, { customer: customerId });
  }

  const fields = cardFieldsFromStripe(pm);
  await setAllowRedisplay(stripe, paymentMethodId, savedForFuture ? 'always' : 'limited');
  const row = await upsertRow(pool, {
    userId,
    paymentMethodId,
    fingerprint: fields.fingerprint,
    brand: fields.brand,
    last4: fields.last4,
    expMonth: fields.expMonth,
    expYear: fields.expYear,
    cardholderName: fields.cardholderName,
    purpose: savedForFuture ? 'saved' : 'one_time',
    checkoutUseStatus: savedForFuture ? 'saved' : 'one_time_available',
    deleteAfter: savedForFuture ? null : provisionalDeleteAfter(),
    checkoutPrivacySessionId: savedForFuture ? null : (checkoutPrivacySessionId ?? null),
  });
  return toPublic(row);
}


/** Anchor delete_after at received/cancelled time + retention days. */
export async function bumpRetentionAfterOrderTerminal(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  order: { id: string; user_id: string | null; stripe_payment_intent_id: string | null },
): Promise<void> {
  // Guest orders never have a customer_card_retention row (see
  // forgetOneTimeCardForOrder's same guard).
  if (!order.user_id) return;
  if (!stripe || !order.stripe_payment_intent_id || order.stripe_payment_intent_id.startsWith('free:')) {
    return;
  }
  let paymentMethodId: string | undefined;
  try {
    const pi = await retrievePaymentIntent(stripe, order.stripe_payment_intent_id);
    const pm = pi.payment_method;
    paymentMethodId = typeof pm === 'string' ? pm : pm?.id;
  } catch {
    return;
  }
  if (!paymentMethodId) return;

  const deleteAfter = new Date(Date.now() + retentionDaysMs());
  await pool.query(
    `update customer_card_retention
     set last_order_id = $3,
         delete_after = case
           when delete_after is null or delete_after < $4 then $4
           else delete_after
         end,
         updated_at = now()
     where user_id = $1
       and stripe_payment_method_id = $2
       and purpose = 'one_time'`,
    [order.user_id, paymentMethodId, order.id, deleteAfter.toISOString()],
  );
}

/** Immediately forget a one-time (non-remembered) card used on this order —
 * detach from Stripe and drop the retention row. Saved cards are untouched.
 * Used by customer cancel while payment is still only authorized. */
export async function forgetOneTimeCardForOrder(
  pool: pg.Pool,
  stripe: PaymentClient | undefined,
  order: { id: string; user_id: string | null; stripe_payment_intent_id: string | null },
): Promise<void> {
  // Guest orders never have a customer_card_retention row — guest payments
  // are always one-off Stripe intents with no saved-card/retention concept
  // (no account to attach a saved card to).
  if (!order.user_id) return;
  if (!stripe || !order.stripe_payment_intent_id || order.stripe_payment_intent_id.startsWith('free:')) {
    return;
  }
  let paymentMethodId: string | undefined;
  try {
    const pi = await retrievePaymentIntent(stripe, order.stripe_payment_intent_id);
    const pm = pi.payment_method;
    paymentMethodId = typeof pm === 'string' ? pm : pm?.id;
  } catch {
    return;
  }
  if (!paymentMethodId) return;

  const { rows } = await pool.query<RetentionRow>(
    `select * from customer_card_retention
     where user_id = $1 and stripe_payment_method_id = $2 and purpose = 'one_time'`,
    [order.user_id, paymentMethodId],
  );
  const row = rows[0];
  if (!row) return;

  const user = await pool.query<{ stripe_customer_id: string | null }>(
    `select stripe_customer_id from users where id = $1`,
    [order.user_id],
  );
  const customerId = user.rows[0]?.stripe_customer_id;
  if (customerId) {
    try {
      await detachPaymentMethod(stripe, customerId, paymentMethodId);
    } catch {
      // Already detached — still drop our row.
    }
  }
  await pool.query(`delete from customer_card_retention where id = $1`, [row.id]);
}

/** Detach expired one-time cards from Stripe and drop retention rows.
 * Safe to call repeatedly from an external cron. */
export async function processExpiredOneTimeCards(pool: pg.Pool, stripe: PaymentClient | undefined): Promise<number> {
  const { rows } = await pool.query<RetentionRow>(
    `select * from customer_card_retention
     where purpose = 'one_time'
       and delete_after is not null
       and delete_after <= now()`,
  );
  if (rows.length === 0) return 0;

  // Resolved up front: one query for the batch instead of one per expired
  // card. The row deletes below stay per-row on purpose — each is paired with
  // a Stripe detach that may fail independently, and a failed detach must not
  // roll back the rows that succeeded.
  const customerIdByUser = new Map<string, string | null>();
  if (stripe) {
    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const { rows: userRows } = await pool.query<{ id: string; stripe_customer_id: string | null }>(
      `select id, stripe_customer_id from users where id = any($1::uuid[])`,
      [userIds],
    );
    for (const user of userRows) customerIdByUser.set(user.id, user.stripe_customer_id);
  }

  let deleted = 0;
  for (const row of rows) {
    if (stripe) {
      const customerId = customerIdByUser.get(row.user_id) ?? null;
      if (customerId) {
        try {
          await detachPaymentMethod(stripe, customerId, row.stripe_payment_method_id);
        } catch {
          // Already detached or missing — still drop our row.
        }
      }
    }
    await pool.query(`delete from customer_card_retention where id = $1`, [row.id]);
    deleted += 1;
  }
  return deleted;
}
