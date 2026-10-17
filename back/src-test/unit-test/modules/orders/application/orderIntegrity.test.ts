/**
 * `content_hash` is stored on every confirmed order and re-verified later, so
 * the canonical payload it hashes is a persisted contract: renaming,
 * reordering or adding a key silently invalidates every existing hash. The
 * golden string below is that contract. Changing it is a deliberate
 * migration decision, never a side effect of a refactor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { config } from '../../../../../src/config/env.js';
import {
  computeFullOrderSnapshotHash,
  computeOrderContentHash,
  fullOrderSnapshot,
} from '../../../../../src/modules/orders/application/orderIntegrity.js';
import type { OrderItemRow, OrderRow } from '../../../../../src/modules/orders/domain/order.js';

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 'o1',
    user_id: 'u1',
    guest_email: null,
    guest_email_lookup: null,
    owner_deleted_at: null,
    customer_email: 'enc',
    customer_first_name: null,
    customer_last_name: null,
    placed_as_guest: false,
    language: null,
    order_number: 'PS-1001',
    status: 'confirmed',
    status_reason: null,
    need_review_blocked: false,
    need_review_resolved_at: null,
    need_review_resolved_by: null,
    need_review_resolution: null,
    stripe_resolution: null,
    recipient_name: 'Jane Doe',
    company_name: null,
    line1: '1 rue de la Paix',
    line2: null,
    delivery_notes: null,
    postal_code: '75002',
    city: 'Paris',
    country_code: 'FR',
    phone: null,
    address_id: 'a1',
    network_code: 'home',
    pickup_point: null,
    courier_id: 'c1',
    courier_code: 'colissimo',
    courier_name: { fr: 'Colissimo' },
    packet_key: 'small',
    express: false,
    shipping_fee: '4.90',
    voucher_code: null,
    voucher_item_discount: '0.00',
    voucher_shipping_discount: '0.00',
    rules_item_discount: '0.00',
    shipping_list_fee: '4.90',
    cart_rules_snapshot: [],
    loyalty_credit: '0.00',
    loyalty_earn: '0.00',
    loyalty_earn_status: 'pending',
    loyalty_granted_at: null,
    total: '24.90',
    stripe_payment_intent_id: 'pi_1',
    payment_capture_status: 'authorized',
    payment_operation: null,
    payment_operation_started_at: null,
    payment_method_type: 'card',
    payment_card_brand: 'visa',
    payment_card_last4: '4242',
    content_hash: null,
    billing_address_id: null,
    billing_recipient_name: 'Jane Doe',
    billing_company_name: null,
    billing_line1: '1 rue de la Paix',
    billing_line2: null,
    billing_postal_code: '75002',
    billing_city: 'Paris',
    billing_country_code: 'FR',
    billing_phone: null,
    billing_same_as_shipping: true,
    customer_type: 'particulier',
    revision_lock_token: null,
    revision_lock_until: null,
    revision_lock_user_id: null,
    revision_lock_baseline_hash: null,
    admin_verified_at: null,
    sent_at: null,
    gift_offer_id: null,
    gift_snapshot: null,
    confirmed_at: '2026-10-01T10:00:00.000Z',
    status_updated_at: '2026-10-01T10:00:00.000Z',
    created_at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function item(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: 'i1',
    order_id: 'o1',
    product_id: 'p1',
    product_uid: 'PS-0001',
    product_type: 'nail',
    title: { fr: 'Rose' },
    desc: null,
    occasion: null,
    colors: '[{"key":"pink","role":"main","label":{"fr":"Rose"}}]',
    shape_key: 'almond',
    length_key: 'medium',
    shape_label: null,
    length_label: null,
    photo_path: null,
    photos: [],
    size: 'M',
    pack_key: '',
    pack_label: null,
    quantity: 1,
    unit_price: '20.00',
    line_total: '20.00',
    origin: 'user',
    locked: false,
    rule_code: null,
    comment: null,
    ...overrides,
  };
}

const GOLDEN =
  '{"orderNumber":"PS-1001","recipientName":"Jane Doe","companyName":null,"line1":"1 rue de la Paix",' +
  '"line2":null,"postalCode":"75002","city":"Paris","countryCode":"FR","phone":null,"networkCode":"home",' +
  '"pickupPoint":null,"courierCode":"colissimo","courierName":{"fr":"Colissimo"},"packetKey":"small",' +
  '"express":false,"shippingFee":"4.90","shippingListFee":"4.90","rulesItemDiscount":"0.00",' +
  '"cartRulesSnapshot":[],"voucherCode":null,"voucherItemDiscount":"0.00","voucherShippingDiscount":"0.00",' +
  '"total":"24.90","confirmedAt":"2026-10-01T10:00:00.000Z","billingAddressId":null,' +
  '"billingRecipientName":"Jane Doe","billingCompanyName":null,"billingLine1":"1 rue de la Paix",' +
  '"billingLine2":null,"billingPostalCode":"75002","billingCity":"Paris","billingCountryCode":"FR",' +
  '"billingPhone":null,"billingSameAsShipping":true,"customerType":"particulier","items":[{"productId":"p1",' +
  '"productUid":"PS-0001","title":{"fr":"Rose"},"desc":null,"occasion":null,"colors":[{"key":"pink",' +
  '"role":"main","label":{"fr":"Rose"}}],"shapeKey":"almond","lengthKey":"medium","shapeLabel":null,' +
  '"lengthLabel":null,"photoPath":null,"photos":[],"size":"M","quantity":1,"unitPrice":"20.00",' +
  '"lineTotal":"20.00","origin":"user","locked":false,"ruleCode":null}]}';

test('the canonical integrity payload is frozen', () => {
  assert.equal(JSON.stringify(fullOrderSnapshot(order(), [item()]).integrity), GOLDEN);
  const expected = createHmac('sha256', config.jwt.secret).update(GOLDEN).digest('hex');
  assert.equal(computeOrderContentHash(order(), [item()]), expected);
});

test('an order without a note or pack keeps its historical hash', () => {
  const base = computeOrderContentHash(order(), [item()]);
  assert.equal(computeOrderContentHash(order(), [item({ comment: '' })]), base);
  assert.equal(computeOrderContentHash(order(), [item({ comment: 'Pour Léa' })]) === base, false);
  assert.equal(computeOrderContentHash(order(), [item({ pack_key: 'x2', pack_label: { fr: 'x2' } })]) === base, false);
});

test('colors stored as JSON text or as an array hash the same', () => {
  const asArray = item({ colors: [{ key: 'pink', role: 'main', label: { fr: 'Rose' } }] });
  assert.equal(computeOrderContentHash(order(), [asArray]), computeOrderContentHash(order(), [item()]));
});

test('commercial fields change the hash; operational state does not', () => {
  const base = computeOrderContentHash(order(), [item()]);
  for (const changed of [
    order({ total: '0.01' }),
    order({ line1: '2 rue de la Paix' }),
    order({ voucher_code: 'NOEL' }),
    order({ billing_city: 'Lyon' }),
  ]) {
    assert.notEqual(computeOrderContentHash(changed, [item()]), base);
  }
  for (const same of [
    order({ status: 'sent' }),
    order({ payment_capture_status: 'captured' }),
    order({ delivery_notes: 'code 1234' }),
    order({ revision_lock_token: 't' }),
  ]) {
    assert.equal(computeOrderContentHash(same, [item()]), base);
  }
  assert.notEqual(computeOrderContentHash(order(), [item({ quantity: 2 })]), base);
});

test('the full snapshot wraps the payload with operational context', () => {
  const snapshot = fullOrderSnapshot(order(), [item()]);
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.status, 'confirmed');
  assert.equal(snapshot.paymentCardLast4, '4242');
  assert.match(computeFullOrderSnapshotHash(snapshot), /^[0-9a-f]{64}$/);
});
