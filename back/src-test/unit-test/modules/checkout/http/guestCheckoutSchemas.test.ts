import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../../../../../src/config/env.js';
import {
  guestAddressInputFromBody,
  guestCompositionsFromBody,
  guestItemsFromBody,
  parseGuestCheckoutRequest,
  parseGuestVoucherValidateBody,
} from '../../../../../src/modules/checkout/http/guestCheckoutSchemas.js';

const ADDRESS = {
  recipientName: 'Jane Doe',
  line1: '1 rue de la Paix',
  postalCode: '75002',
  city: 'Paris',
  countryCode: 'FR',
};

const ITEM = { productId: 'p1', shapeKey: 'almond', lengthKey: 'medium', size: 'M', quantity: 1 };

const COMPOSITION = {
  size: 'M',
  quantity: 1,
  nails: [{ productId: 'n1', shapeKey: 'almond', lengthKey: 'short', finger: 'left-thumb' }],
};

function checkoutBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    items: [ITEM],
    address: ADDRESS,
    courierCode: 'colissimo',
    email: 'Guest@Example.com',
    gdprConsent: { accepted: true },
    ...overrides,
  };
}

test('guest lines: shape is normalized, client price/total fields are dropped', () => {
  const items = guestItemsFromBody([{ ...ITEM, unitPrice: 0.01, lineTotal: 0, comment: '  note ' }]);
  assert.deepEqual(items, [
    { productId: 'p1', shapeKey: 'almond', lengthKey: 'medium', size: 'M', packKey: '', quantity: 1, comment: 'note' },
  ]);
});

test('guest lines: one bad line rejects the whole basket', () => {
  assert.equal(guestItemsFromBody([ITEM, { ...ITEM, quantity: 0 }]), undefined);
  assert.equal(guestItemsFromBody([{ ...ITEM, quantity: config.fieldLimits.cartQuantityMax + 1 }]), undefined);
  assert.equal(guestItemsFromBody([{ ...ITEM, quantity: 1.5 }]), undefined);
  assert.equal(guestItemsFromBody([{ ...ITEM, productId: '' }]), undefined);
  assert.equal(guestItemsFromBody([{ ...ITEM, comment: 'a\u0000b' }]), undefined);
  assert.equal(guestItemsFromBody('nope'), undefined);
  assert.deepEqual(guestItemsFromBody([]), []);
});

test('guest lines: the basket size is bounded', () => {
  assert.equal(guestItemsFromBody(Array.from({ length: 51 }, () => ITEM)), undefined);
  assert.equal(guestItemsFromBody(Array.from({ length: 50 }, () => ITEM))?.length, 50);
});

test('guest compositions: absent means none, nails need a known finger', () => {
  assert.deepEqual(guestCompositionsFromBody(undefined), []);
  const [parsed] = guestCompositionsFromBody([{ ...COMPOSITION, editing: 'yes', id: '' }])!;
  assert.equal(parsed!.editing, false);
  assert.equal(parsed!.id, undefined);
  assert.equal(parsed!.nails[0]!.variationKey, '');
  assert.equal(
    guestCompositionsFromBody([{ ...COMPOSITION, nails: [{ ...COMPOSITION.nails[0], finger: 'left-toe' }] }]),
    undefined,
  );
  assert.equal(guestCompositionsFromBody([{ ...COMPOSITION, nails: [] }]), undefined);
  assert.equal(guestCompositionsFromBody([{ ...COMPOSITION, size: '' }]), undefined);
  assert.equal(guestCompositionsFromBody(Array.from({ length: 21 }, () => COMPOSITION)), undefined);
});

test('guest address: recipient or company is required, a bad one is not ignored', () => {
  assert.ok(guestAddressInputFromBody(ADDRESS));
  assert.ok(guestAddressInputFromBody({ ...ADDRESS, recipientName: undefined, companyName: 'ACME' }));
  assert.equal(guestAddressInputFromBody({ ...ADDRESS, recipientName: undefined }), undefined);
  assert.equal(
    guestAddressInputFromBody({ ...ADDRESS, companyName: 'x'.repeat(config.fieldLimits.companyNameMax + 1) }),
    undefined,
    'an over-long company is rejected even when the recipient is valid',
  );
});

test('guest address: optional fields clear on blank, reject on invalid', () => {
  const blank = guestAddressInputFromBody({ ...ADDRESS, line2: '  ', phone: '', deliveryNotes: null })!;
  assert.equal(blank.line2, null);
  assert.equal(blank.phone, null);
  assert.equal(blank.deliveryNotes, null);
  assert.equal(guestAddressInputFromBody({ ...ADDRESS, phone: 'call me' }), undefined);
  assert.equal(guestAddressInputFromBody({ ...ADDRESS, line2: 'a\u0001' }), undefined);
});

test('guest address: home is implied unless a pickup network is declared', () => {
  assert.deepEqual(guestAddressInputFromBody(ADDRESS)!.networkCodes, ['home']);
  assert.deepEqual(guestAddressInputFromBody({ ...ADDRESS, networkCodes: ['home', 'home'] })!.networkCodes, ['home']);
  const pickup = guestAddressInputFromBody({
    ...ADDRESS,
    networkCodes: ['relay'],
    pickupPoints: { relay: { id: 'R1', name: 'Tabac', metadata: { hours: '9-18' } } },
  })!;
  assert.deepEqual(pickup.networkCodes, ['relay']);
  assert.deepEqual(pickup.pickupPoints, { relay: { id: 'R1', name: 'Tabac', metadata: { hours: '9-18' } } });
});

test('guest address: a pickup point for an undeclared network is rejected', () => {
  assert.equal(
    guestAddressInputFromBody({ ...ADDRESS, networkCodes: ['relay'], pickupPoints: { other: { id: 'R1' } } }),
    undefined,
  );
  assert.equal(guestAddressInputFromBody({ ...ADDRESS, pickupPoints: [] }), undefined);
});

test('checkout request: happy path normalizes email and keeps flags strict', () => {
  const parsed = parseGuestCheckoutRequest(checkoutBody({ express: 'true', rememberCard: 1, language: 'fr' }))!;
  assert.equal(parsed.email, 'guest@example.com');
  assert.equal(parsed.express, false, 'only a literal true enables express');
  assert.equal(parsed.rememberCard, false);
  assert.equal(parsed.language, 'fr');
  assert.equal(parsed.billingAddress, undefined);
  assert.equal(parsed.voucherCode, undefined);
});

test('checkout request: GDPR consent must be explicitly accepted', () => {
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ gdprConsent: undefined })), undefined);
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ gdprConsent: { accepted: 'true' } })), undefined);
});

test('checkout request: an empty basket or missing courier/email is rejected', () => {
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ items: [] })), undefined);
  assert.ok(parseGuestCheckoutRequest(checkoutBody({ items: [], compositions: [COMPOSITION] })));
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ courierCode: ' ' })), undefined);
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ email: 'nope' })), undefined);
});

test('checkout request: a blank voucher is ignored, a malformed one rejects', () => {
  assert.ok(parseGuestCheckoutRequest(checkoutBody({ voucherCode: '' })));
  assert.ok(parseGuestCheckoutRequest(checkoutBody({ voucherCode: null })));
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ voucherCode: 'BAD CODE' })), undefined);
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ voucherCode: ' NOEL ' }))!.voucherCode, 'NOEL');
});

test('checkout request: an invalid billing address rejects instead of falling back', () => {
  assert.equal(parseGuestCheckoutRequest(checkoutBody({ billingAddress: { city: 'Paris' } })), undefined);
  const parsed = parseGuestCheckoutRequest(checkoutBody({ billingAddress: { ...ADDRESS, companyName: 'ACME' } }))!;
  assert.equal(parsed.billingAddress?.companyName, 'ACME');
});

test('voucher validate body requires a code but not an email', () => {
  const body = { items: [ITEM], address: ADDRESS, courierCode: 'colissimo', code: 'NOEL' };
  assert.equal(parseGuestVoucherValidateBody(body)!.code, 'NOEL');
  assert.equal(parseGuestVoucherValidateBody(body)!.email, undefined);
  assert.equal(parseGuestVoucherValidateBody({ ...body, code: '' }), undefined);
  assert.equal(parseGuestVoucherValidateBody({ ...body, items: [] }), undefined);
});
