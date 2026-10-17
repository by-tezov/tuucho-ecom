import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJsonPii } from '../../../../../src/platform/security/piiCrypto.js';
import { resolveMondialRelayRecipientEmail } from '../../../../../src/modules/shipping/application/shippingLabels.js';

test('gift snapshot receiver email wins over the giver account email', () => {
  const enc = encryptJsonPii({
    offerId: 'offer-1',
    receiverEmail: 'julie.receiver@example.com',
  });
  const email = resolveMondialRelayRecipientEmail(
    {
      gift_snapshot: { enc },
      guest_email: null,
      user_id: 'giver-user-id',
    },
    'marc.giver@example.com',
  );
  assert.equal(email, 'julie.receiver@example.com');
});

test('without a gift receiver email, signed-in orders keep the account email', () => {
  const email = resolveMondialRelayRecipientEmail(
    {
      gift_snapshot: null,
      guest_email: null,
      user_id: 'user-1',
    },
    'customer@example.com',
  );
  assert.equal(email, 'customer@example.com');
});

test('guest orders keep guest_email when there is no gift receiver', () => {
  const email = resolveMondialRelayRecipientEmail(
    {
      gift_snapshot: null,
      guest_email: 'guest@example.com',
      user_id: null,
    },
    null,
  );
  assert.equal(email, 'guest@example.com');
});

test('an old gift snapshot without receiverEmail falls back to the giver account', () => {
  const enc = encryptJsonPii({
    offerId: 'offer-old',
    giverEmail: 'marc.giver@example.com',
  });
  const email = resolveMondialRelayRecipientEmail(
    {
      gift_snapshot: { enc },
      guest_email: null,
      user_id: 'giver-user-id',
    },
    'marc.giver@example.com',
  );
  assert.equal(email, 'marc.giver@example.com');
});
