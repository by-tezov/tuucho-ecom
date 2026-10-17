import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentAdminGiftOffer } from '../../../../../src/modules/gift/application/presenters.js';
import type { AdminGiftOfferListRow } from '../../../../../src/modules/gift/infrastructure/giftAdminOfferRepo.js';

function adminRow(overrides: Partial<AdminGiftOfferListRow> = {}): AdminGiftOfferListRow {
  return {
    id: 'offer-1',
    status: 'awaiting_payment',
    giverEmail: 'marc@example.com',
    giverDisplayName: 'Marc',
    receiverName: 'Julie',
    receiverEmail: 'julie@example.com',
    maxSets: null,
    maxBudget: 80,
    allowAccessories: false,
    maxAccessoryBudget: null,
    offerExpiresAt: null,
    holdExpiresAt: new Date('2026-10-01T12:00:00.000Z'),
    payByAt: new Date('2026-10-10T12:00:00.000Z'),
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    updatedAt: new Date('2026-09-02T12:00:00.000Z'),
    ...overrides,
  };
}

test('presentAdminGiftOffer exposes giver and receiver emails after confirm', () => {
  const presented = presentAdminGiftOffer(adminRow());
  assert.equal(presented.giverEmail, 'marc@example.com');
  assert.equal(presented.receiverEmail, 'julie@example.com');
  assert.equal(presented.receiverName, 'Julie');
});

test('presentAdminGiftOffer keeps receiverEmail null before confirm', () => {
  const presented = presentAdminGiftOffer(adminRow({ status: 'selecting', receiverEmail: null }));
  assert.equal(presented.giverEmail, 'marc@example.com');
  assert.equal(presented.receiverEmail, null);
});
