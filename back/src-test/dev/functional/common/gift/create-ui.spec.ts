import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { TEST_GIFT_PIN } from '../../../support/gift.js';
import { startCustomerJourneyAtRoot } from '../../../support/interact.js';
import { GiftPages, giftSurfaceFromTitle } from '../../../support/pages/gift.pages.js';
import { tid } from '../../../support/selectors.js';

const SEVEN_LINE_COMMENT = 'a\nb\nc\nd\ne\nf\ng';
const SIX_LINE_COMMENT = 'a\nb\nc\nd\ne\nf';

async function openDraft(page: import('patchright/test').Page, emailSlug: string) {
  await startCustomerJourneyAtRoot(page);
  const gift = new GiftPages(page);
  await gift.openOffrirFromNav();
  await gift.fillGuestIdentity({
    email: uniqueEmail(emailSlug),
    comment: 'Pour toi',
  });
  return gift;
}

async function expectCommentCap(page: import('patchright/test').Page) {
  const gift = await openDraft(page, 'gift-ui-cap');
  await gift.pasteComment(SEVEN_LINE_COMMENT);
  await expect(page.getByTestId(tid.gift.giverComment)).toHaveValue(SIX_LINE_COMMENT);
  await gift.expectCommentLines(6);
}

async function expectCardStyle(page: import('patchright/test').Page) {
  const gift = await openDraft(page, 'gift-ui-card');
  await gift.chooseShareCardStyle('Anniversaire');
  await gift.expectShareCardStyle('Anniversaire');
  await expect(page.getByTestId(tid.gift.shareCardPreview)).toContainText('Julie');
}

async function expectDraftPersists(page: import('patchright/test').Page) {
  const gift = await openDraft(page, 'gift-ui-draft');
  await gift.pasteComment(SIX_LINE_COMMENT);
  await gift.chooseShareCardStyle('Anniversaire');
  await gift.fillPins(TEST_GIFT_PIN);
  await page.reload();
  await expect(page.getByTestId(tid.gift.createForm)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(tid.gift.giverName)).toHaveValue('Marc');
  await expect(page.getByTestId(tid.gift.receiverName)).toHaveValue('Julie');
  await expect(page.getByTestId(tid.gift.giverComment)).toHaveValue(SIX_LINE_COMMENT);
  await gift.expectShareCardStyle('Anniversaire');
  await expect(page.getByTestId(tid.gift.createPin).locator('input').first()).toHaveValue('');
  await expect(page.getByTestId(tid.gift.createPinConfirm).locator('input').first()).toHaveValue('');
}

const UI_CASES: Array<{ title: string; run: (page: import('patchright/test').Page) => Promise<void> }> = [
  { title: 'the comment line cap is enforced', run: expectCommentCap },
  { title: 'the share card style is enforced', run: expectCardStyle },
  { title: 'the draft persists across reload without the PIN', run: expectDraftPersists },
];

test.describe('Functional gift create UI', () => {
  for (const entry of UI_CASES) {
    test(`web Offrir draft: ${entry.title}`, async ({ page }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe('web');
      await entry.run(page);
    });
    test(`mobile Offrir draft: ${entry.title}`, async ({ page }, testInfo) => {
      expect(giftSurfaceFromTitle(testInfo.title)).toBe('mobile');
      await entry.run(page);
    });
  }
});
