import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GiftFailure } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/errors.js';
import { assertNotGone, assertReceiverCanMutate } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/access.js';
import { parseAccessPin, pinDigestInput } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/pin.js';
import { isSpyKind, SPY_KINDS } from '../../../../../src/modules/settings/domain/spyKinds.js';
import { CHECKOUT_FAILURE_STATUS } from '../../../../../src/modules/commerce/application/checkoutFailureStatus.js';
import {
  parseOrderItemColors,
  parseOrderItemPhotos,
  type OrderItemRow,
} from '../../../../../src/modules/orders/domain/order.js';

test('assertNotGone fails after terminal visibility window or offer expiry', () => {
  const now = new Date('2026-01-02T00:00:00.000Z');
  assert.doesNotThrow(() => assertNotGone('selecting', new Date('2026-01-03T00:00:00.000Z'), now));
  assert.throws(
    () => assertNotGone('cancelled', new Date('2026-01-01T00:00:00.000Z'), now),
    (error: unknown) => error instanceof GiftFailure && error.code === 'gift_gone',
  );
  assert.throws(
    () => assertNotGone('cancelled', null, now),
    (error: unknown) => error instanceof GiftFailure && error.code === 'gift_gone',
  );
});

test('assertReceiverCanMutate blocks frozen and inactive statuses', () => {
  assert.throws(
    () => assertReceiverCanMutate('paying'),
    (error: unknown) => error instanceof GiftFailure && error.code === 'gift_frozen',
  );
  assert.throws(
    () => assertReceiverCanMutate('cancelled'),
    (error: unknown) => error instanceof GiftFailure && error.code === 'gift_inactive',
  );
  assert.doesNotThrow(() => assertReceiverCanMutate('selecting'));
});

test('parseAccessPin accepts trimmed 4-digit pins', () => {
  assert.equal(parseAccessPin(' 2468 '), '2468');
  assert.equal(parseAccessPin('24a8'), null);
  assert.equal(parseAccessPin(2468), null);
  assert.equal(pinDigestInput('offer', '1234'), 'offer:pin:1234');
});

test('isSpyKind covers the catalog', () => {
  assert.equal(isSpyKind('login'), true);
  assert.equal(isSpyKind('not_a_kind'), false);
  assert.ok(SPY_KINDS.includes('gift_created'));
});

test('CHECKOUT_FAILURE_STATUS maps voucher and address reasons', () => {
  assert.equal(CHECKOUT_FAILURE_STATUS.address_not_found, 404);
  assert.equal(CHECKOUT_FAILURE_STATUS.voucher_user_not_allowed, 403);
  assert.equal(CHECKOUT_FAILURE_STATUS.gift_not_payable, 409);
});

// The second entry in each list is deliberately malformed, so it cannot
// satisfy the row type — dropping it is exactly what is under test. The cast
// keeps that shape in the test instead of weakening the parser signatures.
test('parseOrderItemColors and photos drop malformed entries', () => {
  assert.deepEqual(
    parseOrderItemColors([
      { key: 'red', role: 'main', label: { fr: 'Rouge' } },
      { key: 'bad', role: 'x', label: { fr: 'X' } },
    ] as unknown as OrderItemRow['colors']),
    [{ key: 'red', role: 'main', label: { fr: 'Rouge' } }],
  );
  assert.deepEqual(
    parseOrderItemPhotos([
      { position: 0, smallPath: 's.webp', modalPath: 'm.webp', hash: 'h' },
      { position: 'x', smallPath: 's', modalPath: 'm' },
    ] as unknown as OrderItemRow['photos']),
    [{ position: 0, smallPath: 's.webp', modalPath: 'm.webp', hash: 'h' }],
  );
});
