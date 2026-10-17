import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJsonPii } from '../../../../../src/platform/security/piiCrypto.js';
import {
  readOrderGiftSnapshot,
  sameGiftMailAddress,
} from '../../../../../src/modules/orders/application/giftSnapshot.js';

test('readOrderGiftSnapshot returns giver and receiver emails from the frozen snapshot', () => {
  const enc = encryptJsonPii({
    offerId: 'offer-1',
    giverDisplayName: 'Marc',
    receiverName: 'Julie',
    giverEmail: 'marc@example.com',
    receiverEmail: 'julie@example.com',
    hideReceiverPrices: true,
  });
  const snap = readOrderGiftSnapshot({ enc });
  assert.ok(snap);
  assert.equal(snap.giverEmail, 'marc@example.com');
  assert.equal(snap.receiverEmail, 'julie@example.com');
  assert.equal(snap.hideReceiverPrices, true);
});

test('readOrderGiftSnapshot tolerates older snapshots without emails', () => {
  const enc = encryptJsonPii({
    offerId: 'offer-old',
    giverDisplayName: 'Marc',
    receiverName: 'Julie',
    hideReceiverPrices: false,
  });
  const snap = readOrderGiftSnapshot({ enc });
  assert.ok(snap);
  assert.equal(snap.giverEmail, '');
  assert.equal(snap.receiverEmail, null);
  assert.equal(snap.hideReceiverPrices, false);
});

test('sameGiftMailAddress ignores case and surrounding spaces', () => {
  assert.equal(sameGiftMailAddress('Julie@Example.com', ' julie@example.com '), true);
  assert.equal(sameGiftMailAddress('marc@example.com', 'julie@example.com'), false);
  assert.equal(sameGiftMailAddress(null, 'julie@example.com'), false);
});
