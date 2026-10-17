import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { GiftPages, giftSurfaceFromTitle } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';
import { startCustomerJourneyAtRoot } from '../../../support/interact.js';

async function openOffrir(page: import('patchright/test').Page) {
  await startCustomerJourneyAtRoot(page);
  const gift = new GiftPages(page);
  await gift.openOffrirFromNav();
  return gift;
}

async function expectRequiredFieldErrors(page: import('patchright/test').Page) {
  const gift = await openOffrir(page);
  await gift.submitCreate();
  await gift.expectFieldError(tid.gift.giverEmailError, /obligatoire/i);
  await gift.expectFieldError(tid.gift.giverNameError, /obligatoire/i);
  await gift.expectFieldError(tid.gift.receiverNameError, /obligatoire/i);
  await gift.expectFieldError(tid.gift.giverCommentError, /obligatoire/i);
  await gift.expectFieldError(tid.gift.maxBudgetError, /obligatoire/i);
  await gift.expectFieldError(tid.gift.createPinError, /4 chiffres/i);
  await gift.expectFieldError(tid.gift.gdprError, /CGU|confidentialité/i);
}

async function expectInvalidEmail(page: import('patchright/test').Page) {
  const gift = await openOffrir(page);
  await gift.fillGuestIdentity({ email: 'not-an-email', comment: 'Pour toi' });
  await gift.submitCreate();
  await gift.expectFieldError(tid.gift.giverEmailError, /invalide/i);
}

async function expectPinMismatch(page: import('patchright/test').Page) {
  const gift = await openOffrir(page);
  await gift.fillGuestIdentity({ email: uniqueEmail('gift-val-pin'), comment: 'Pour toi' });
  await gift.fillPins('1234', '5678');
  await gift.submitCreate();
  await gift.expectFieldError(tid.gift.createPinError, /correspondent pas/i);
}

async function expectGdprRequired(page: import('patchright/test').Page) {
  const gift = await openOffrir(page);
  await gift.fillGuestIdentity({ email: uniqueEmail('gift-val-gdpr'), comment: 'Pour toi' });
  await gift.fillPins('2468');
  await gift.setNailBudget(15);
  await gift.submitCreate();
  await gift.expectFieldError(tid.gift.gdprError, /CGU|confidentialité/i);
  await expect(page.getByTestId(tid.gift.createCheckEmail)).toHaveCount(0);
}

const VALIDATION_CASES: Array<{ title: string; run: (page: import('patchright/test').Page) => Promise<void> }> = [
  { title: 'required fields show errors', run: expectRequiredFieldErrors },
  { title: 'invalid email shows an error', run: expectInvalidEmail },
  { title: 'PIN mismatch shows an error', run: expectPinMismatch },
  { title: 'GDPR consent is required', run: expectGdprRequired },
];

test.describe('Functional gift create validation', () => {
  for (const entry of VALIDATION_CASES) {
    test(`web Offrir form: ${entry.title}`, async ({ page }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
      await entry.run(page);
    });
    test(`mobile Offrir form: ${entry.title}`, async ({ page }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
      await entry.run(page);
    });
  }
});
