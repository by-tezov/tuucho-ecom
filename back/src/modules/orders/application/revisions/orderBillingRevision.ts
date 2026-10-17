import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { encryptPii } from '../../../../platform/security/piiCrypto.js';
import { type OrderItemRow, type OrderRow } from '../../domain/order.js';
import type { OrderRevisionKind, OrderRevisionRequestedBy } from '../../domain/orderRevision.js';
import { attachItems, decryptAddressPiiFields, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { encryptRevisionDiff } from '../../infrastructure/revisionStorage.js';
import {
  REVISION_ELIGIBLE_STATUSES,
  clearLockSql,
  computeChainedContentHash,
  isLockActive,
  latestRevisionNumber,
  orderHasInvoice,
  revisionLimitReached,
  saveOrderSnapshot,
} from './orderRevisionSupport.js';

export function billingSnapshotForDiff(order: OrderRow) {
  return {
    sameAsShipping: order.billing_same_as_shipping,
    addressId: order.billing_address_id,
    recipientName: order.billing_recipient_name,
    companyName: order.billing_company_name,
    line1: order.billing_line1,
    line2: order.billing_line2,
    postalCode: order.billing_postal_code,
    city: order.billing_city,
    countryCode: order.billing_country_code,
    phone: order.billing_phone,
  };
}

export type UpdateOrderBillingResult =
  | { ok: true; order: OrderRow; items: OrderItemRow[]; changed: boolean }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'order_not_editable'
        | 'lock_invalid'
        | 'order_changed'
        | 'billing_address_not_found'
        | 'revision_limit_reached'
        | 'invoice_already_issued'
        | 'content_hash_missing';
    };

interface BillingAddressSource {
  id: string | null;
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  postal_code: string;
  city: string;
  country_code: string;
  phone: string | null;
}

/** Customer billing-address amendment. Requires a lock token issued by
 * acquireRevisionLock. If the lock TTL has expired but the order is still
 * untouched (same status eligibility + same content_hash as at acquire),
 * re-acquires briefly, applies, and unlocks. */
export async function updateOrderBilling(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  lockToken: string,
  sameAsShipping: boolean,
  billingAddressId: string | undefined,
): Promise<UpdateOrderBillingResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<OrderRow>(
      `select * from orders where id = $1 and user_id = $2 for update`,
      [orderId, userId],
    );
    const order = rows[0] ? decryptOrderRow(rows[0]) : undefined;
    if (!order) {
      await client.query('rollback');
      return { ok: false, reason: 'not_found' };
    }
    if (!REVISION_ELIGIBLE_STATUSES.has(order.status)) {
      await client.query('rollback');
      return { ok: false, reason: 'order_not_editable' };
    }
    if (!order.content_hash) {
      await client.query('rollback');
      return { ok: false, reason: 'content_hash_missing' };
    }
    if (await orderHasInvoice(client, order.id)) {
      await client.query('rollback');
      return { ok: false, reason: 'invoice_already_issued' };
    }
    if (
      !order.revision_lock_token ||
      order.revision_lock_token !== lockToken ||
      order.revision_lock_user_id !== userId
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'lock_invalid' };
    }

    const lockStillActive = isLockActive(order);
    if (!lockStillActive) {
      if (order.content_hash !== order.revision_lock_baseline_hash) {
        await client.query('rollback');
        return { ok: false, reason: 'order_changed' };
      }
    }

    let billingSource: BillingAddressSource;
    if (sameAsShipping) {
      billingSource = {
        id: null,
        recipient_name: order.recipient_name,
        company_name: order.company_name,
        line1: order.line1,
        line2: order.line2,
        postal_code: order.postal_code,
        city: order.city,
        country_code: order.country_code,
        phone: order.phone,
      };
    } else {
      if (!billingAddressId) {
        await client.query('rollback');
        return { ok: false, reason: 'billing_address_not_found' };
      }
      const { rows: billingRows } = await client.query<BillingAddressSource>(
        `select id, recipient_name, company_name, line1, line2, postal_code, city, country_code, phone
         from addresses where id = $1 and user_id = $2 and kind = 'facturation'`,
        [billingAddressId, userId],
      );
      const billingRow = billingRows[0];
      if (!billingRow) {
        await client.query('rollback');
        return { ok: false, reason: 'billing_address_not_found' };
      }
      billingSource = decryptAddressPiiFields(billingRow);
    }

    const customerType: 'particulier' | 'entreprise' = billingSource.company_name
      ? 'entreprise'
      : 'particulier';

    const nextBilling = {
      billing_address_id: billingSource.id,
      billing_recipient_name: billingSource.recipient_name,
      billing_company_name: billingSource.company_name,
      billing_line1: billingSource.line1,
      billing_line2: billingSource.line2,
      billing_postal_code: billingSource.postal_code,
      billing_city: billingSource.city,
      billing_country_code: billingSource.country_code,
      billing_phone: billingSource.phone,
      billing_same_as_shipping: sameAsShipping,
      customer_type: customerType,
    };

    const unchanged =
      order.billing_same_as_shipping === nextBilling.billing_same_as_shipping &&
      order.billing_address_id === nextBilling.billing_address_id &&
      order.billing_recipient_name === nextBilling.billing_recipient_name &&
      order.billing_company_name === nextBilling.billing_company_name &&
      order.billing_line1 === nextBilling.billing_line1 &&
      order.billing_line2 === nextBilling.billing_line2 &&
      order.billing_postal_code === nextBilling.billing_postal_code &&
      order.billing_city === nextBilling.billing_city &&
      order.billing_country_code === nextBilling.billing_country_code &&
      order.billing_phone === nextBilling.billing_phone &&
      order.customer_type === nextBilling.customer_type;

    if (unchanged) {
      const { rows: unlockedRows } = await client.query<OrderRow>(
        `update orders set ${clearLockSql()}, updated_at = now() where id = $1 returning *`,
        [order.id],
      );
      await client.query('commit');
      const unlocked = decryptOrderRow(unlockedRows[0]!);
      const itemsByOrder = await attachItems(pool, [unlocked]);
      return { ok: true, order: unlocked, items: itemsByOrder.get(unlocked.id) ?? [], changed: false };
    }

    const itemsByOrder = await attachItems(client, [order]);
    const items = itemsByOrder.get(order.id) ?? [];
    const beforeBilling = billingSnapshotForDiff(order);
    const beforeCustomerType = order.customer_type;
    const total = Number(order.total);
    const revisionNumber = (await latestRevisionNumber(client, order.id)) + 1;
    if (revisionLimitReached(revisionNumber - 1)) {
      await client.query('rollback');
      return { ok: false, reason: 'revision_limit_reached' };
    }
    await saveOrderSnapshot(client, order, items, revisionNumber - 1);

    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders set
         billing_address_id = $2,
         billing_recipient_name = $3,
         billing_company_name = $4,
         billing_line1 = $5,
         billing_line2 = $6,
         billing_postal_code = $7,
         billing_city = $8,
         billing_country_code = $9,
         billing_phone = $10,
         billing_same_as_shipping = $11,
         customer_type = $12,
         ${clearLockSql()},
         updated_at = now()
       where id = $1
       returning *`,
      [
        order.id,
        nextBilling.billing_address_id,
        encryptPii(nextBilling.billing_recipient_name),
        encryptPii(nextBilling.billing_company_name),
        encryptPii(nextBilling.billing_line1),
        encryptPii(nextBilling.billing_line2),
        encryptPii(nextBilling.billing_postal_code),
        encryptPii(nextBilling.billing_city),
        nextBilling.billing_country_code,
        encryptPii(nextBilling.billing_phone),
        nextBilling.billing_same_as_shipping,
        nextBilling.customer_type,
      ],
    );
    const updated = decryptOrderRow(updatedRows[0]!);

    const previousHash = order.content_hash;
    const nextHash = computeChainedContentHash(previousHash, updated, items);
    const diff = {
      billing: { before: beforeBilling, after: billingSnapshotForDiff(updated) },
      customerType: { before: beforeCustomerType, after: updated.customer_type },
    };

    await client.query(
      `insert into order_revisions (
         id, order_id, revision_number, kind, diff, total_before, total_after,
         requested_by, content_hash
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        order.id,
        revisionNumber,
        'billing_address_change' satisfies OrderRevisionKind,
        JSON.stringify(encryptRevisionDiff(diff)),
        total,
        total,
        'customer' satisfies OrderRevisionRequestedBy,
        nextHash,
      ],
    );
    await client.query(`update orders set content_hash = $2 where id = $1`, [order.id, nextHash]);
    updated.content_hash = nextHash;
    await saveOrderSnapshot(client, updated, items, revisionNumber);

    await client.query('commit');
    return { ok: true, order: updated, items, changed: true };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
