import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNotGone, assertReceiverCanMutate } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/access.js';
import { parseAccessPin, pinDigestInput } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/pin.js';
import { isSpyKind, SPY_KINDS } from '../../../../../src/modules/settings/domain/spyKinds.js';

test('parseAccessPin accepts exactly four digits', () => {
  assert.equal(parseAccessPin('1234'), '1234');
  assert.equal(parseAccessPin(' 5678 '), '5678');
  assert.equal(parseAccessPin('12a4'), null);
  assert.equal(parseAccessPin('123'), null);
  assert.equal(parseAccessPin(1234), null);
});

test('pinDigestInput namespaces the pin under the offer', () => {
  assert.equal(pinDigestInput('offer-1', '1234'), 'offer-1:pin:1234');
});

test('assertReceiverCanMutate blocks frozen and inactive statuses', () => {
  assert.doesNotThrow(() => assertReceiverCanMutate('selecting'));
  assert.throws(() => assertReceiverCanMutate('awaiting_payment'));
  assert.throws(() => assertReceiverCanMutate('paying'));
  assert.throws(() => assertReceiverCanMutate('ordered'));
  assert.throws(() => assertReceiverCanMutate('cancelled'));
});

test('assertNotGone after terminal visibility ends or offer expiry', () => {
  const now = new Date('2026-01-10T12:00:00Z');
  assert.doesNotThrow(() => assertNotGone('selecting', null, now));
  assert.doesNotThrow(() =>
    assertNotGone('ordered', new Date('2026-01-11T12:00:00Z'), now),
  );
  assert.throws(() => assertNotGone('ordered', new Date('2026-01-09T12:00:00Z'), now));
  assert.throws(() => assertNotGone('cancelled', null, now));
  assert.throws(() =>
    assertNotGone('selecting', null, now, new Date('2026-01-09T12:00:00Z')),
  );
});

test('isSpyKind matches the published list', () => {
  assert.equal(isSpyKind('login'), true);
  assert.equal(isSpyKind('not_a_kind'), false);
  assert.ok(SPY_KINDS.includes('order_confirmation'));
});
