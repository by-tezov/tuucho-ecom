import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateGiftOfferBody } from '../../../../../../../plugins/commerce/gift/tuucho-commerce-gift/back/src/application/createOffer.js';
import { GIFT_COMMENT_MAX_LINES, GIFT_NAME_MAX_LENGTH } from '../../../../../src/utils/fieldLimits.js';

const SESSION = { id: '11111111-1111-4111-8111-111111111111', email: 'giver@example.com' };

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    giverEmail: 'Giver@Example.com',
    giverDisplayName: ' Paul ',
    receiverName: ' Julie ',
    giverComment: 'Joyeux anniversaire !',
    maxBudget: 40,
    accessPin: '1234',
    shareCardStyle: 'classic',
    gdprConsent: { accepted: true },
    ...overrides,
  };
}

test('a minimal guest offer parses with safe defaults', () => {
  const parsed = parseCreateGiftOfferBody(body())!;
  assert.equal(parsed.giverEmail, 'giver@example.com');
  assert.equal(parsed.giverDisplayName, 'Paul');
  assert.equal(parsed.receiverName, 'Julie');
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.hideReceiverPrices, true, 'prices stay hidden unless explicitly shown');
  assert.equal(parsed.allowAccessories, false);
  assert.equal(parsed.maxAccessoryBudget, null);
  assert.equal(parsed.session, null);
});

test('a guest must accept GDPR; a signed-in giver is covered by their account', () => {
  assert.equal(parseCreateGiftOfferBody(body({ gdprConsent: undefined })), null);
  assert.equal(parseCreateGiftOfferBody(body({ gdprConsent: { accepted: 'yes' } })), null);
  const signedIn = parseCreateGiftOfferBody(body({ gdprConsent: undefined }), SESSION)!;
  assert.equal(signedIn.gdprAccepted, true);
  assert.deepEqual(signedIn.session, SESSION);
});

test('the budget must be a positive number, rounded to cents', () => {
  assert.equal(parseCreateGiftOfferBody(body({ maxBudget: 39.999 }))!.maxBudget, 40);
  for (const bad of [0, -5, '40', Number.NaN, Infinity, 0.004, undefined]) {
    assert.equal(parseCreateGiftOfferBody(body({ maxBudget: bad })), null, String(bad));
  }
});

test('accessories need their own budget, which is dropped when they are off', () => {
  assert.equal(parseCreateGiftOfferBody(body({ allowAccessories: true })), null);
  assert.equal(
    parseCreateGiftOfferBody(body({ allowAccessories: true, maxAccessoryBudget: 12.345 }))!.maxAccessoryBudget,
    12.35,
  );
  assert.equal(parseCreateGiftOfferBody(body({ maxAccessoryBudget: 10 }))!.maxAccessoryBudget, null);
  assert.equal(parseCreateGiftOfferBody(body({ maxAccessoryBudget: -1 })), null);
  assert.equal(parseCreateGiftOfferBody(body({ allowAccessories: 'true', maxAccessoryBudget: 10 }))!.allowAccessories, false);
});

test('the PIN is exactly four digits', () => {
  assert.equal(parseCreateGiftOfferBody(body({ accessPin: ' 0042 ' }))!.accessPin, '0042');
  for (const bad of ['123', '12345', 'abcd', 1234, undefined]) {
    assert.equal(parseCreateGiftOfferBody(body({ accessPin: bad })), null, String(bad));
  }
});

test('the card message is required and bounded in lines', () => {
  assert.equal(parseCreateGiftOfferBody(body({ giverComment: undefined })), null);
  assert.equal(parseCreateGiftOfferBody(body({ giverComment: '   ' })), null);
  const tooManyLines = Array.from({ length: GIFT_COMMENT_MAX_LINES + 1 }, () => 'x').join('\n');
  assert.equal(parseCreateGiftOfferBody(body({ giverComment: tooManyLines })), null);
});

test('names, email and style are required', () => {
  assert.equal(parseCreateGiftOfferBody(body({ receiverName: '  ' })), null);
  assert.equal(parseCreateGiftOfferBody(body({ giverEmail: 'nope' })), null);
  assert.equal(parseCreateGiftOfferBody(body({ shareCardStyle: 'unknown' })), null);
  assert.equal(parseCreateGiftOfferBody(null), null);
});

test('names follow the share-card edit bounds: 80 characters, no control characters', () => {
  assert.equal(parseCreateGiftOfferBody(body({ receiverName: 'x'.repeat(GIFT_NAME_MAX_LENGTH) }))!.receiverName.length, 80);
  assert.equal(parseCreateGiftOfferBody(body({ receiverName: 'x'.repeat(GIFT_NAME_MAX_LENGTH + 1) })), null);
  assert.equal(parseCreateGiftOfferBody(body({ receiverName: 'Ju\u0000lie' })), null);
  assert.equal(parseCreateGiftOfferBody(body({ giverDisplayName: 'Paul\nMarc' })), null);
});

test('an unsupported language falls back to English', () => {
  assert.equal(parseCreateGiftOfferBody(body({ language: 'de' }))!.language, 'en');
  assert.equal(parseCreateGiftOfferBody(body({ language: 'th' }))!.language, 'en');
});
