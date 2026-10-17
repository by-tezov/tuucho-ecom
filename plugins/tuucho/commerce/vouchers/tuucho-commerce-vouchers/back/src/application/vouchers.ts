import { randomInt, randomUUID } from 'node:crypto';
import { shopToday } from '@kernel/back/utils/shopDate';
import type pg from 'pg';
import { isPluginEnabled } from '@kernel/back/modules/plugins/application/pluginStore';
import { localize, type Language } from '@kernel/back/utils/language';
import type { PartialTrilingual } from '@kernel/back/types';
import { emailLookupHash } from '@kernel/back/platform/security/piiCrypto';
import { calculateVoucher, type AppliedVoucher, type VoucherPricingInput } from '../domain/voucherPricing.js';

export type { AppliedVoucher, VoucherPricingInput };
export { listVouchers } from './voucherAdminList.js';
import type {
  VoucherDesiredState,
  VoucherFailureReason,
  VoucherOfferType,
  VoucherRow,
} from '../domain/voucherTypes.js';

export type { VoucherDesiredState, VoucherFailureReason, VoucherOfferType, VoucherRow };

export type VoucherOfferTypeLabels = Record<VoucherOfferType, PartialTrilingual>;
import {
  normalizeVoucherCustomerScope,
  voucherPerCustomerLimitFailure,
  type VoucherCustomerScope,
} from '../infrastructure/customerLimits.js';
export type { VoucherCustomerScope } from '../infrastructure/customerLimits.js';

/** Set equality, order-independent — the allow-list is a set, and the import's
 * idempotency check must not report a change just because the ids arrived in a
 * different order. */
function sameUserIdSet(current: string[], desired: string[]): boolean {
  if (current.length !== desired.length) return false;
  const currentSet = new Set(current);
  return desired.every((id) => currentSet.has(id));
}

export function normalizeVoucherCode(value: string): string {
  return value.trim();
}

/** Same `ABC-123` shape as `npm run voucher -- init` when `--name` is omitted. */
export async function generateUniqueVoucherCode(pool: pg.Pool): Promise<string> {
  for (let tries = 0; tries < 1000; tries += 1) {
    const letters = Array.from({ length: 3 }, () => String.fromCharCode(65 + randomInt(26))).join('');
    const code = `${letters}-${String(randomInt(1000)).padStart(3, '0')}`;
    const exists = await pool.query('select 1 from vouchers where lower(code) = lower($1)', [code]);
    if (!exists.rowCount) return code;
  }
  throw new Error('Unable to generate a unique voucher code.');
}

/** The label templates are operational vocabulary from
 * catalog source/voucher/data-type.json, imported ahead of vouchers by
 * `npm run voucher -- seed`. They are deliberately not hard-coded in the
 * storefront so every customer-facing language has one manager-owned source. */
export async function syncVoucherOfferTypeLabels(
  pool: pg.Pool,
  labels: VoucherOfferTypeLabels,
): Promise<void> {
  for (const [offerType, template] of Object.entries(labels) as [VoucherOfferType, PartialTrilingual][]) {
    await pool.query(
      `insert into voucher_offer_type_labels (offer_type, template) values ($1, $2)
       on conflict (offer_type) do update set template = excluded.template, updated_at = now()`,
      [offerType, template],
    );
  }
}

export async function listVoucherOfferTypeLabels(pool: pg.Pool): Promise<VoucherOfferTypeLabels> {
  const { rows } = await pool.query<{ offer_type: VoucherOfferType; template: PartialTrilingual }>(
    `select offer_type, template from voucher_offer_type_labels order by offer_type`,
  );
  return Object.fromEntries(rows.map((row) => [row.offer_type, row.template])) as VoucherOfferTypeLabels;
}

/** Localizes the exact validated offer rather than merely telling the
 * customer that an arbitrary promo code was accepted. */
export async function voucherOfferDescription(
  pool: pg.Pool,
  voucher: AppliedVoucher,
  language: Language,
): Promise<string | undefined> {
  const { rows } = await pool.query<{ template: PartialTrilingual }>(
    `select template from voucher_offer_type_labels where offer_type = $1`,
    [voucher.offer.type],
  );
  const template = rows[0]?.template;
  if (!template) return undefined;
  const replacements: Record<string, string> = {
    percent: voucher.offer.type === 'percent' ? String(voucher.offer.percent) : '',
    amount: voucher.offer.type === 'amount' ? String(voucher.offer.amount) : '',
    requiredItemQuantity:
      voucher.offer.type === 'free_item_nth' ? String(voucher.offer.requiredItemQuantity) : '',
    freeItemQuantity:
      voucher.offer.type === 'free_item' || voucher.offer.type === 'free_item_nth'
        ? String(voucher.freeItemQuantity ?? 0)
        : '',
    maxItemPrice: voucher.offer.type === 'free_item' ? String(voucher.offer.maxItemPrice) : '',
  };
  return localize(template, language).replace(
    /\{(percent|amount|requiredItemQuantity|freeItemQuantity|maxItemPrice)\}/g,
    (_all, key) => replacements[key] ?? '',
  );
}

/** Every voucher column plus its allow-list, rebuilt as the `uuid[]` the rest
 * of this service already expects. The list moved out of
 * `vouchers.allowed_user_ids` into the `voucher_allowed_users` join table
 * (migration 1787380000003) so it has real foreign keys and an index; keeping
 * the aggregated shape here means only the reads and the upsert changed, not
 * every consumer of VoucherRow. Sorted so two equal lists always compare
 * equal — the import used to diff them with JSON.stringify, which made a
 * reordering look like a change. */
const VOUCHER_SELECT = `
  v.*,
  coalesce(
    array(
      select vau.user_id from voucher_allowed_users vau
       where vau.voucher_code = v.code
       order by vau.user_id
    ),
    '{}'::uuid[]
  ) as allowed_user_ids`;

async function voucherRow(
  client: pg.Pool | pg.PoolClient,
  code: string,
  lock = false,
): Promise<VoucherRow | undefined> {
  const { rows } = await client.query<VoucherRow>(
    `select ${VOUCHER_SELECT} from vouchers v where lower(v.code) = lower($1)${lock ? ' for update of v' : ''}`,
    [code],
  );
  return rows[0];
}

/**
 * Lock voucher rows this checkout may touch (caller's held codes + optional
 * requested code) in code order before any hold UPDATE. Otherwise concurrent
 * reserveCart transactions take FOR KEY SHARE via voucher_holds FKs and then
 * deadlock on SELECT … FOR UPDATE of the shared promo row.
 */
export async function lockVouchersForCheckout(
  client: pg.PoolClient,
  userId: string,
  rawCode?: string,
): Promise<void> {
  const requested = rawCode ? normalizeVoucherCode(rawCode) : null;
  await client.query(
    `select v.code
     from vouchers v
     where exists (
         select 1 from voucher_holds h
         where h.voucher_code = v.code and h.user_id = $1 and h.state = 'held'
       )
        or ($2::text is not null and lower(v.code) = lower($2::text))
     order by v.code
     for update of v`,
    [userId, requested],
  );
}

/** Guest sibling of lockVouchersForCheckout — a guest identity never holds a
 * prior code (see holdVoucherForGuest's own doc comment), so there is only
 * ever the one requested code's row to lock before mutating it. */
export async function lockVoucherForGuestCheckout(client: pg.PoolClient, rawCode?: string): Promise<void> {
  if (!rawCode) return;
  await client.query(`select code from vouchers where lower(code) = lower($1) for update`, [
    normalizeVoucherCode(rawCode),
  ]);
}

async function availabilityFailure(
  client: pg.Pool | pg.PoolClient,
  row: VoucherRow,
  scopeInput?: string | VoucherCustomerScope,
): Promise<VoucherFailureReason | undefined> {
  const scope = normalizeVoucherCustomerScope(scopeInput);
  const userId = scope.userId;
  if (!row.enabled) return 'voucher_disabled';
  if (row.allowed_user_ids.length > 0 && (!userId || !row.allowed_user_ids.includes(userId))) {
    return 'voucher_user_not_allowed';
  }
  const date = shopToday();
  if (date < row.starts_at) return 'voucher_not_started';
  if (date > row.ends_at) return 'voucher_expired';
  // Keep cancelled-order redemptions as an audit trail, but return their use
  // to the voucher's available quantity.
  const { rows } = await client.query<{ used: string }>(
    `select count(*)::text as used
     from voucher_redemptions vr
     join orders o on o.id = vr.order_id
     where vr.voucher_code = $1 and o.status <> 'cancelled'
     union all
     select count(*)::text as used
     from voucher_holds vh
     where vh.voucher_code = $1 and vh.state = 'held' and vh.expires_at > now()
       and ($2::uuid is null or vh.user_id is distinct from $2::uuid)`,
    [row.code, userId ?? null],
  );
  const reserved = rows.reduce((sum, value) => sum + Number(value.used), 0);
  if (reserved >= row.quantity) return 'voucher_depleted';
  return (await voucherPerCustomerLimitFailure(client, row.code, row.max_uses_per_user, scope)) ?? undefined;
}

export async function previewVoucher(
  client: pg.Pool | pg.PoolClient,
  rawCode: string,
  input: VoucherPricingInput,
  scope?: string | VoucherCustomerScope,
): Promise<{ ok: true; voucher: AppliedVoucher } | { ok: false; reason: VoucherFailureReason }> {
  if (!(await isPluginEnabled('tuucho-commerce-vouchers', client))) return { ok: false, reason: 'voucher_not_found' };
  const row = await voucherRow(client, normalizeVoucherCode(rawCode));
  if (!row) return { ok: false, reason: 'voucher_not_found' };
  const unavailable = await availabilityFailure(client, row, scope);
  if (unavailable) return { ok: false, reason: unavailable };
  const voucher = calculateVoucher(row, input);
  if (!voucher) return { ok: false, reason: 'voucher_conditions_not_met' };
  return { ok: true, voucher };
}

/** Holds one voucher use for the exact checkout reservation that owns it.
 * Card → PayPal creates a new reservation, so the old hold is released by its
 * reservation id before the new one is created. This avoids releasing an
 * unrelated checkout belonging to the same account. */
export async function holdVoucher(
  client: pg.PoolClient,
  userId: string,
  reservationId: string,
  rawCode: string,
  input: VoucherPricingInput,
  expiresAt: Date,
): Promise<{ ok: true; voucher: AppliedVoucher } | { ok: false; reason: VoucherFailureReason }> {
  if (!(await isPluginEnabled('tuucho-commerce-vouchers', client))) return { ok: false, reason: 'voucher_not_found' };
  const row = await voucherRow(client, normalizeVoucherCode(rawCode), true);
  if (!row) return { ok: false, reason: 'voucher_not_found' };
  const code = row.code;
  const unavailable = await availabilityFailure(client, row, { userId, excludeReservationId: reservationId });
  if (unavailable) return { ok: false, reason: unavailable };
  const voucher = calculateVoucher(row, input);
  if (!voucher) return { ok: false, reason: 'voucher_conditions_not_met' };
  const { rows: existing } = await client.query<{ id: string }>(
    `select id from voucher_holds where voucher_code = $1 and reservation_id = $2 and state = 'held' for update`,
    [code, reservationId],
  );
  if (existing[0]) {
    await client.query(`update voucher_holds set expires_at = $2, updated_at = now() where id = $1`, [
      existing[0].id,
      expiresAt,
    ]);
  } else {
    await client.query(
      `insert into voucher_holds (id, voucher_code, user_id, reservation_id, state, expires_at)
       values ($1, $2, $3, $4, 'held', $5)`,
      [randomUUID(), code, userId, reservationId, expiresAt],
    );
  }
  return { ok: true, voucher };
}

/** Guest sibling of holdVoucher — keyed by the checkout attempt's own
 * stock_reservations.id instead of a user_id (a guest has none). Always a
 * fresh insert: unlike an authenticated customer, a guest checkout attempt
 * never reuses a reservation across payment-method retries (see
 * reserveGuestCart's own doc comment), so there is no prior hold by this
 * same identity to refresh or release first. */
export async function holdVoucherForGuest(
  client: pg.PoolClient,
  reservationId: string,
  rawCode: string,
  input: VoucherPricingInput,
  expiresAt: Date,
  guestEmail: string,
): Promise<{ ok: true; voucher: AppliedVoucher } | { ok: false; reason: VoucherFailureReason }> {
  if (!(await isPluginEnabled('tuucho-commerce-vouchers', client))) return { ok: false, reason: 'voucher_not_found' };
  const row = await voucherRow(client, normalizeVoucherCode(rawCode), true);
  if (!row) return { ok: false, reason: 'voucher_not_found' };
  const emailLookup = emailLookupHash(guestEmail);
  // Same PG10-safe advisory lock as auth OTP — two concurrent guest attempts
  // with the same e-mail cannot both pass the per-customer cap check.
  await client.query(`select pg_advisory_xact_lock(87217, hashtext($1))`, [
    `voucher-guest-hold:${row.code}:${emailLookup}`,
  ]);
  // A guest has no persisted identity, so a voucher restricted to specific
  // allowed_user_ids can never resolve for one — availabilityFailure already
  // returns voucher_user_not_allowed for a missing userId, same as it would
  // for any authenticated customer not on the list.
  const unavailable = await availabilityFailure(client, row, {
    guestEmail,
    excludeReservationId: reservationId,
  });
  if (unavailable) return { ok: false, reason: unavailable };
  const voucher = calculateVoucher(row, input);
  if (!voucher) return { ok: false, reason: 'voucher_conditions_not_met' };
  await client.query(
    `insert into voucher_holds (id, voucher_code, reservation_id, guest_email_lookup, state, expires_at)
     values ($1, $2, $3, $4, 'held', $5)`,
    [randomUUID(), row.code, reservationId, emailLookup, expiresAt],
  );
  return { ok: true, voucher };
}

export async function consumeVoucherHold(
  client: pg.PoolClient,
  userId: string,
  reservationId: string,
  voucher: AppliedVoucher,
  orderId: string,
): Promise<boolean> {
  // Lock voucher before holds — same order as holdVoucher — so concurrent
  // reserveCart (voucher → hold) and confirmOrder (was hold → redemption/FK)
  // cannot deadlock on a popular shared code.
  const row = await voucherRow(client, voucher.code, true);
  if (!row) return false;
  const { rows } = await client.query<{ id: string }>(
    `select id from voucher_holds
     where voucher_code = $1 and reservation_id = $2 and user_id = $3
       and state = 'held' and expires_at > now()
     for update`,
    [row.code, reservationId, userId],
  );
  const hold = rows[0];
  if (!hold) return false;
  await client.query(
    `update voucher_holds set state = 'consumed', order_id = $2, updated_at = now() where id = $1`,
    [hold.id, orderId],
  );
  await client.query(
    `insert into voucher_redemptions (id, voucher_code, user_id, order_id, item_discount, shipping_discount)
     values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), row.code, userId, orderId, voucher.itemDiscount, voucher.shippingDiscount],
  );
  return true;
}

/** Guest sibling of consumeVoucherHold — same lock/consume/redeem shape,
 * keyed by reservation_id instead of user_id. voucher_redemptions.user_id is
 * left null; the order row it's tied to (order_id, unique) already carries
 * guest_email as that redemption's sole owner field. */
export async function consumeVoucherHoldForGuest(
  client: pg.PoolClient,
  reservationId: string,
  voucher: AppliedVoucher,
  orderId: string,
): Promise<boolean> {
  const row = await voucherRow(client, voucher.code, true);
  if (!row) return false;
  const { rows } = await client.query<{ id: string }>(
    `select id from voucher_holds where voucher_code = $1 and reservation_id = $2 and state = 'held' and expires_at > now() for update`,
    [row.code, reservationId],
  );
  const hold = rows[0];
  if (!hold) return false;
  await client.query(
    `update voucher_holds set state = 'consumed', order_id = $2, updated_at = now() where id = $1`,
    [hold.id, orderId],
  );
  await client.query(
    `insert into voucher_redemptions (id, voucher_code, user_id, order_id, item_discount, shipping_discount)
     values ($1, $2, null, $3, $4, $5)`,
    [randomUUID(), row.code, orderId, voucher.itemDiscount, voucher.shippingDiscount],
  );
  return true;
}

export async function releaseVoucherHoldsForReservations(
  client: pg.Pool | pg.PoolClient,
  reservationIds: string[],
): Promise<void> {
  if (reservationIds.length === 0) return;
  await client.query(
    `update voucher_holds set state = 'released', updated_at = now()
     where reservation_id = any($1::uuid[]) and state = 'held'`,
    [reservationIds],
  );
}

export async function upsertVoucher(
  pool: pg.Pool,
  code: string,
  desired: VoucherDesiredState,
  update = true,
): Promise<'created' | 'updated' | 'unchanged'> {
  const normalized = normalizeVoucherCode(code);
  const offer = desired.offer;
  const { rows: current } = await pool.query<VoucherRow>(
    `select ${VOUCHER_SELECT} from vouchers v where lower(v.code) = lower($1)`,
    [normalized],
  );
  const row = current[0];
  if (row && !update) return 'unchanged';
  const desiredMinSubtotal =
    desired.minSubtotal != null && Number.isFinite(desired.minSubtotal) ? desired.minSubtotal : null;
  const same =
    row &&
    row.enabled === desired.enabled &&
    row.quantity === desired.quantity &&
    row.max_uses_per_user === desired.maxUsesPerUser &&
    Number(row.min_subtotal ?? 0) === Number(desiredMinSubtotal ?? 0) &&
    row.starts_at === desired.startsAt &&
    row.ends_at === desired.endsAt &&
    sameUserIdSet(row.allowed_user_ids, desired.allowedUserIds) &&
    row.offer_type === offer.type &&
    Number(row.percent ?? 0) === Number(offer.percent ?? 0) &&
    Number(row.amount ?? 0) === Number(offer.amount ?? 0) &&
    (row.required_item_quantity ?? 0) === (offer.requiredItemQuantity ?? 0) &&
    Number(row.max_item_price ?? 0) === Number(offer.maxItemPrice ?? 0);
  if (same) return 'unchanged';
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into vouchers (code, enabled, quantity, max_uses_per_user, min_subtotal, starts_at, ends_at, offer_type, percent, amount, required_item_quantity, max_item_price)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (lower(code)) do update set enabled = excluded.enabled, quantity = excluded.quantity,
         max_uses_per_user = excluded.max_uses_per_user, min_subtotal = excluded.min_subtotal,
         starts_at = excluded.starts_at, ends_at = excluded.ends_at, offer_type = excluded.offer_type,
         percent = excluded.percent, amount = excluded.amount,
         required_item_quantity = excluded.required_item_quantity, max_item_price = excluded.max_item_price,
         updated_at = now()`,
      [
        normalized,
        desired.enabled,
        desired.quantity,
        desired.maxUsesPerUser,
        desiredMinSubtotal,
        desired.startsAt,
        desired.endsAt,
        offer.type,
        offer.percent ?? null,
        offer.amount ?? null,
        offer.requiredItemQuantity ?? null,
        offer.maxItemPrice ?? null,
      ],
    );

    // Replace the allow-list wholesale, same "desired state wins" semantics
    // the array column had. Ids with no matching user are skipped rather than
    // raising: the array column silently accepted them, and an id that matches
    // no account could never grant access anyway.
    await client.query(
      `delete from voucher_allowed_users
        where voucher_code = $1
          and user_id <> all($2::uuid[])`,
      [normalized, desired.allowedUserIds],
    );
    if (desired.allowedUserIds.length > 0) {
      await client.query(
        `insert into voucher_allowed_users (voucher_code, user_id)
         select $1, u.id from users u where u.id = any($2::uuid[])
         on conflict do nothing`,
        [normalized, desired.allowedUserIds],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return row ? 'updated' : 'created';
}

export type DeleteVoucherResult = 'deleted' | 'not_found' | 'redeemed' | 'active_hold';

/**
 * Removes an unused definition without leaving short-lived checkout history
 * behind. Expired and explicitly released holds no longer reserve a voucher,
 * so they are safe to remove with its definition. A live hold still protects
 * an in-progress payment attempt; a redemption must remain as order audit.
 */
export async function deleteVoucher(pool: pg.Pool, code: string): Promise<DeleteVoucherResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const normalized = normalizeVoucherCode(code);
    const { rows: vouchers } = await client.query<{ code: string }>(
      `select code from vouchers where lower(code) = lower($1) for update`,
      [normalized],
    );
    const voucher = vouchers[0];
    if (!voucher) {
      await client.query('commit');
      return 'not_found';
    }
    const { rows: redemptionRows } = await client.query<{ exists: boolean }>(
      `select exists (select 1 from voucher_redemptions where voucher_code = $1) as exists`,
      [voucher.code],
    );
    if (redemptionRows[0]!.exists) {
      await client.query('commit');
      return 'redeemed';
    }
    const { rows: activeHoldRows } = await client.query<{ exists: boolean }>(
      `select exists (
         select 1 from voucher_holds
         where voucher_code = $1 and state = 'held' and expires_at > now()
       ) as exists`,
      [voucher.code],
    );
    if (activeHoldRows[0]!.exists) {
      await client.query('commit');
      return 'active_hold';
    }
    await client.query(
      `delete from voucher_holds
       where voucher_code = $1 and (state = 'released' or expires_at <= now())`,
      [voucher.code],
    );
    await client.query(`delete from vouchers where code = $1`, [voucher.code]);
    await client.query('commit');
    return 'deleted';
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteAllVouchers(pool: pg.Pool): Promise<number> {
  const result = await pool.query(`delete from vouchers`);
  return result.rowCount ?? 0;
}
