import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { evaluateCartRules, listCartRules } from '../../../plugins/application/pluginBridges.js';
import { encryptPii } from '../../../../platform/security/piiCrypto.js';
import { requiresMondialRelayRecipientPhone } from '../../../shipping/application/shippingLabels.js';
import { roundMoney as round2, shippingFeeForTier } from '../../../commerce/domain/checkoutMoney.js';
import { type OrderItemRow, type OrderPickupPoint, type OrderRow } from '../../domain/order.js';
import { packedNailQuantity } from '../../domain/packetQuantity.js';
import type { OrderRevisionKind, OrderRevisionRequestedBy } from '../../domain/orderRevision.js';
import { attachItems, decryptAddressPiiFields, decryptOrderRow } from '../../infrastructure/orderRows.js';
import { encryptRevisionDiff } from '../../infrastructure/revisionStorage.js';
import { billingSnapshotForDiff } from './orderBillingRevision.js';
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

function shippingSnapshotForDiff(order: OrderRow) {
  return {
    addressId: order.address_id,
    recipientName: order.recipient_name,
    companyName: order.company_name,
    line1: order.line1,
    line2: order.line2,
    deliveryNotes: order.delivery_notes,
    postalCode: order.postal_code,
    city: order.city,
    countryCode: order.country_code,
    phone: order.phone,
    networkCode: order.network_code,
    pickupPoint: order.pickup_point,
  };
}

export type UpdateOrderShippingResult =
  | { ok: true; order: OrderRow; items: OrderItemRow[]; changed: boolean }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'order_not_editable'
        | 'lock_invalid'
        | 'order_changed'
        | 'address_not_found'
        | 'courier_not_found'
        | 'courier_country_unavailable'
        | 'shipping_country_mismatch'
        | 'courier_network_unavailable'
        | 'recipient_phone_required'
        | 'shipping_overflow'
        | 'express_unavailable'
        | 'shipping_price_unavailable'
        | 'price_would_change'
        | 'revision_limit_reached'
        | 'invoice_already_issued'
        | 'content_hash_missing';
    };

/** Customer shipping-address amendment under revision lock. Same courier,
 * same country, and same delivery network — refuses if the recomputed
 * shipping fee would change (packet/rules drift). */
export async function updateOrderShipping(
  pool: pg.Pool,
  userId: string,
  orderId: string,
  lockToken: string,
  addressId: string,
): Promise<UpdateOrderShippingResult> {
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
    if (!isLockActive(order) && order.content_hash !== order.revision_lock_baseline_hash) {
      await client.query('rollback');
      return { ok: false, reason: 'order_changed' };
    }
    if (!order.courier_id || !order.courier_code) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_not_found' };
    }

    const { rows: addressRows } = await client.query<{
      id: string;
      recipient_name: string | null;
      company_name: string | null;
      line1: string;
      line2: string | null;
      delivery_notes: string | null;
      postal_code: string;
      city: string;
      country_code: string;
      phone: string | null;
      pickup_points: Record<string, OrderPickupPoint>;
    }>(
      `select id, recipient_name, company_name, line1, line2, delivery_notes, postal_code, city,
              country_code, phone, pickup_points
       from addresses where id = $1 and user_id = $2 and kind = 'livraison'`,
      [addressId, userId],
    );
    const addressRaw = addressRows[0];
    if (!addressRaw) {
      await client.query('rollback');
      return { ok: false, reason: 'address_not_found' };
    }
    const address = decryptAddressPiiFields(addressRaw);

    // Delivery country is fixed at confirm — a different country would need
    // a new checkout (courier offer / label / VAT), even when the same
    // courier brand also serves that country.
    if (address.country_code !== order.country_code) {
      await client.query('rollback');
      return { ok: false, reason: 'shipping_country_mismatch' };
    }

    const { rows: courierRows } = await client.query<{ id: string; code: string }>(
      `select id, code from couriers where id = $1 and enabled`,
      [order.courier_id],
    );
    const courier = courierRows[0];
    if (!courier || courier.code !== order.courier_code) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_not_found' };
    }

    const { rows: countryMatch } = await client.query(
      `select 1 from courier_countries where courier_id = $1 and country_code = $2 and enabled`,
      [courier.id, address.country_code],
    );
    if (countryMatch.length === 0) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_country_unavailable' };
    }

    const { rows: networkMatch } = await client.query<{ network_code: string }>(
      `select cn.network_code
       from courier_networks cn
       join address_networks an on an.network_code = cn.network_code and an.address_id = $2
       join delivery_networks dn on dn.code = cn.network_code
       where cn.courier_id = $1
         and ($3::text is null or cn.network_code = $3)
       order by dn.sort_order
       limit 1`,
      [courier.id, addressId, order.network_code],
    );
    const matchedNetwork = networkMatch[0];
    if (!matchedNetwork) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_network_unavailable' };
    }
    if (order.network_code && matchedNetwork.network_code !== order.network_code) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_network_unavailable' };
    }
    const pickupPoint = address.pickup_points[matchedNetwork.network_code] ?? null;
    // The checkout delivery mode is immutable during an address amendment:
    // a point-relais order must keep a point, and home delivery must not be
    // silently switched to a pickup point even when a courier supports both
    // through the same network. The client filter is only UX; this is the
    // authoritative protection.
    if ((order.pickup_point !== null) !== (pickupPoint !== null)) {
      await client.query('rollback');
      return { ok: false, reason: 'courier_network_unavailable' };
    }
    if (
      requiresMondialRelayRecipientPhone(order.courier_code, matchedNetwork.network_code) &&
      !address.phone?.trim()
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'recipient_phone_required' };
    }

    const itemsByOrder = await attachItems(client, [order]);
    const items = itemsByOrder.get(order.id) ?? [];
    const totalQuantity = packedNailQuantity(items);
    const { rows: packetRows } = await client.query<{
      packet_key: string;
      max_quantity: number;
      price: unknown;
      express_price: unknown;
    }>(
      `select packet_key, max_quantity, price, express_price from courier_packets
       where courier_id = $1 order by sort_order`,
      [courier.id],
    );
    const tier = packetRows.find((row) => row.max_quantity >= totalQuantity);
    if (!tier) {
      await client.query('rollback');
      return { ok: false, reason: 'shipping_overflow' };
    }
    const feeResult = shippingFeeForTier(tier.price, tier.express_price, order.express, address.country_code);
    if (!feeResult.ok) {
      await client.query('rollback');
      return { ok: false, reason: feeResult.reason };
    }
    const shippingListFee = feeResult.shippingListFee;

    const merchandiseSubtotal = round2(
      items.filter((item) => item.origin !== 'rule').reduce((sum, item) => sum + Number(item.line_total), 0),
    );
    const nailLines = items
      .filter((item) => item.origin === 'user' && item.product_type === 'nail')
      .map((item) => ({ quantity: item.quantity, lineTotal: Number(item.line_total) }));
    const extraSets = items
      .filter((item) => item.origin === 'user' && !item.product_id)
      .map((item) => ({
        quantity: item.quantity,
        nailCount: item.nails?.length ?? 0,
        lineTotal: Number(item.line_total),
      }));
    const giftLines = items
      .filter((item) => item.origin === 'rule')
      .map((item) => ({
        productId: item.product_id ?? '',
        productUid: item.product_uid,
        quantity: item.quantity,
        ruleCode: item.rule_code ?? '',
      }));
    const rules = await listCartRules(client);
    const cartRules = await evaluateCartRules({
      rules,
      nailLines,
      extraSets,
      merchandiseSubtotal,
      shippingListFee,
      countryCode: address.country_code,
      giftLines,
    });
    const shippingFee = cartRules.shippingFee;
    const rulesItemDiscount = cartRules.rulesItemDiscount;

    if (
      tier.packet_key !== order.packet_key ||
      shippingFee !== Number(order.shipping_fee) ||
      shippingListFee !== Number(order.shipping_list_fee) ||
      rulesItemDiscount !== Number(order.rules_item_discount)
    ) {
      await client.query('rollback');
      return { ok: false, reason: 'price_would_change' };
    }

    const unchanged =
      order.address_id === address.id &&
      order.recipient_name === address.recipient_name &&
      order.company_name === address.company_name &&
      order.line1 === address.line1 &&
      order.line2 === address.line2 &&
      order.delivery_notes === address.delivery_notes &&
      order.postal_code === address.postal_code &&
      order.city === address.city &&
      order.country_code === address.country_code &&
      order.phone === address.phone &&
      order.network_code === matchedNetwork.network_code &&
      JSON.stringify(order.pickup_point) === JSON.stringify(pickupPoint);

    if (unchanged) {
      const { rows: unlockedRows } = await client.query<OrderRow>(
        `update orders set ${clearLockSql()}, updated_at = now() where id = $1 returning *`,
        [order.id],
      );
      await client.query('commit');
      const unlocked = decryptOrderRow(unlockedRows[0]!);
      return { ok: true, order: unlocked, items, changed: false };
    }

    const revisionNumber = (await latestRevisionNumber(client, order.id)) + 1;
    if (revisionLimitReached(revisionNumber - 1)) {
      await client.query('rollback');
      return { ok: false, reason: 'revision_limit_reached' };
    }
    await saveOrderSnapshot(client, order, items, revisionNumber - 1);
    const beforeShipping = shippingSnapshotForDiff(order);
    const syncBilling = order.billing_same_as_shipping;
    const customerType: 'particulier' | 'entreprise' = syncBilling
      ? address.company_name
        ? 'entreprise'
        : 'particulier'
      : order.customer_type;

    const { rows: updatedRows } = await client.query<OrderRow>(
      `update orders set
         address_id = $2,
         recipient_name = $3,
         company_name = $4,
         line1 = $5,
         line2 = $6,
         delivery_notes = $7,
         postal_code = $8,
         city = $9,
         country_code = $10,
         phone = $11,
         network_code = $12,
         pickup_point = $13::jsonb,
         billing_recipient_name = case when $14 then $3 else billing_recipient_name end,
         billing_company_name = case when $14 then $4 else billing_company_name end,
         billing_line1 = case when $14 then $5 else billing_line1 end,
         billing_line2 = case when $14 then $6 else billing_line2 end,
         billing_postal_code = case when $14 then $8 else billing_postal_code end,
         billing_city = case when $14 then $9 else billing_city end,
         billing_country_code = case when $14 then $10 else billing_country_code end,
         billing_phone = case when $14 then $11 else billing_phone end,
         customer_type = $15,
         ${clearLockSql()},
         updated_at = now()
       where id = $1
       returning *`,
      [
        order.id,
        address.id,
        encryptPii(address.recipient_name),
        encryptPii(address.company_name),
        encryptPii(address.line1),
        encryptPii(address.line2),
        encryptPii(address.delivery_notes),
        encryptPii(address.postal_code),
        encryptPii(address.city),
        address.country_code,
        encryptPii(address.phone),
        matchedNetwork.network_code,
        JSON.stringify(pickupPoint),
        syncBilling,
        customerType,
      ],
    );
    const updated = decryptOrderRow(updatedRows[0]!);

    const previousHash = order.content_hash;
    const nextHash = computeChainedContentHash(previousHash, updated, items);
    const diff = {
      shipping: { before: beforeShipping, after: shippingSnapshotForDiff(updated) },
      ...(syncBilling
        ? {
            billing: {
              before: billingSnapshotForDiff(order),
              after: billingSnapshotForDiff(updated),
            },
            customerType: { before: order.customer_type, after: updated.customer_type },
          }
        : {}),
    };
    const total = Number(order.total);

    await client.query(
      `insert into order_revisions (
         id, order_id, revision_number, kind, diff, total_before, total_after,
         requested_by, content_hash
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        order.id,
        revisionNumber,
        'shipping_address_change' satisfies OrderRevisionKind,
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

/** Only ever called once a Stripe PaymentIntent has actually succeeded (see
 * account.routes.ts's /checkout/finalize and server.ts's webhook handler —
 * both call this, whichever runs first wins). Snapshots the current cart
 * (title/product_uid/photo/price, all read fresh from the catalog right now)
 * into a new order + order_items, snapshots the chosen address and shipping
 * choice, and clears the cart — all inside one transaction so a confirm can
 * never leave a half-emptied cart or an order with no lines.
 *
 * stripePaymentIntentId is both the payment record and the idempotency
 * key: a webhook retry or a race between /checkout/finalize and the
 * webhook for the same PaymentIntent finds the already-created order via
 * the unique index and returns it as-is (created: false) rather than
 * re-validating and double-charging the cart. Callers use `created` to
 * decide whether to send the confirmation email (exactly once). */
