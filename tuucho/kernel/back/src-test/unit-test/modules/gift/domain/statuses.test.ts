import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GIFT_STATUSES,
  LIVE_GIFT_STATUSES,
  canClaimGiverSession,
  canOpenPay,
  isGiftStatus,
  isTerminalGiftStatus,
  receiverCanMutate,
} from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/domain/statuses.js';

test('only known statuses are accepted', () => {
  for (const status of GIFT_STATUSES) assert.equal(isGiftStatus(status), true);
  for (const value of ['', 'SELECTING', 'paid', 'refunded']) {
    assert.equal(isGiftStatus(value), false, `${value} must not be a gift status`);
  }
});

test('the receiver may only change the gift while selecting', () => {
  for (const status of GIFT_STATUSES) {
    assert.equal(receiverCanMutate(status), status === 'selecting', `${status}`);
  }
});

test('terminal statuses are exactly the ones that end the offer', () => {
  assert.deepEqual(GIFT_STATUSES.filter(isTerminalGiftStatus), ['ordered', 'cancelled', 'expired']);
});

test('the live list is the complement of the terminal ones', () => {
  assert.deepEqual([...LIVE_GIFT_STATUSES], ['selecting', 'awaiting_payment', 'paying']);
  for (const status of LIVE_GIFT_STATUSES) assert.equal(isTerminalGiftStatus(status), false);
});

test('payment can only be opened while payment is pending', () => {
  assert.deepEqual(GIFT_STATUSES.filter(canOpenPay), ['awaiting_payment', 'paying']);
});

test('an ordered gift can never be paid again', () => {
  // Guards against a second charge on an already-ordered offer.
  assert.equal(canOpenPay('ordered'), false);
  assert.equal(canOpenPay('cancelled'), false);
  assert.equal(canOpenPay('expired'), false);
});

test('the giver may hold a session in every live status, which is wider than paying', () => {
  assert.deepEqual(GIFT_STATUSES.filter(canClaimGiverSession), [...LIVE_GIFT_STATUSES]);
  assert.equal(canClaimGiverSession('selecting'), true);
  assert.equal(canOpenPay('selecting'), false);
});
