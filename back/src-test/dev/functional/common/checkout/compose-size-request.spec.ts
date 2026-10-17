import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS, E2E_TITLES } from '../../../support/catalog.js';
import { waitForMail } from '../../../support/mail.js';
import { ComposePages } from '../../../support/pages/compose.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, startCustomerJourneyAtRoot } from '../../../support/interact.js';

const COMMENT = 'Merci de proposer cette taille.';

async function runUnavailableSizeRequest(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  const email = uniqueEmail('compose-size');
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.addNail(E2E_PRODUCT_UIDS.NAIL_GAP, 'left-thumb');
  await compose.expectDesignPlaced(E2E_PRODUCT_UIDS.NAIL_GAP);
  await compose.addNail(E2E_PRODUCT_UIDS.NAIL_A, 'right-thumb');
  await compose.expectDesignPlaced(E2E_PRODUCT_UIDS.NAIL_A);

  // M is offered on both nails, so the set can still be added. S is not
  // offered on the gap nail: the chip is struck and stays clickable.
  await expect(compose.sizeChip('M')).toHaveAttribute('data-in-stock', 'true');
  await expect(compose.sizeChip('S')).toHaveAttribute('data-in-stock', 'false');
  await expect(page.getByTestId(tid.compose.submit)).toBeVisible();

  await compose.setSize('S');
  await expect(compose.sizeChip('S')).toHaveAttribute('aria-pressed', 'true');
  await compose.expectUnavailableStamp('left-thumb', 'S');
  await compose.expectNoUnavailableStamp('right-thumb');
  await expect(page.getByTestId(tid.compose.submit)).toHaveCount(0);
  await expect(page.getByTestId(tid.compose.sizeRequest)).toBeVisible();

  await compose.setQuantity(2);
  const sinceMs = Date.now() - 1_000;
  const modal = await compose.openSizeRequest();
  const leftHand = modal.getByRole('button', { name: /main gauche/i });
  await clickVisible(leftHand);
  await expect(leftHand).toHaveAttribute('aria-expanded', 'true');
  await expect(modal).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_GAP]);
  await clickVisible(modal.getByRole('button', { name: /main droite/i }));
  await expect(modal).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_A]);

  await compose.submitSizeRequest(modal, { email, comment: COMMENT });

  const mail = await waitForMail({
    kind: 'spy',
    subjectIncludes: 'taille S x2',
    sinceMs,
    timeoutMs: 15_000,
  });
  expect(mail.subject).toContain('Demande de taille pour un set sur mesure');
  expect(mail.html).toContain(email);
  expect(mail.html).toContain('Non connecté');
  expect(mail.html).toContain(E2E_PRODUCT_UIDS.NAIL_GAP);
  expect(mail.html).toContain(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_GAP]);
  expect(mail.html).toContain('pouce gauche');
  expect(mail.html).toContain(E2E_PRODUCT_UIDS.NAIL_A);
  expect(mail.html).toContain(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_A]);
  expect(mail.html).toContain('pouce droit');
  expect(mail.html).toContain(COMMENT);
  expect(mail.html).toContain('Ongles non proposés dans cette taille');
  expect(mail.html).toContain('Autres ongles du set (déjà proposés)');
}

test.describe('Compose unavailable size request', () => {
  test('nail missing S: it is posed, stamped, and the size request is emailed', async ({ page }) => {
    await runUnavailableSizeRequest(page);
  });

  test('mobile nail missing S: it is posed, stamped, and the size request is emailed', async ({ page }) => {
    await runUnavailableSizeRequest(page);
  });
});
