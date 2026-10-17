import type { Page } from 'patchright/test';
import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { tid } from '../../../support/selectors.js';
import { expectAnonymousSession, startCustomerJourneyAtRoot } from '../../../support/interact.js';

const DELETED = { label: 'Adresse supprimée E2E', recipient: 'Ada Supprimée', line1: '11 rue Supprimée' };
const KEPT = { label: 'Adresse conservée E2E', recipient: 'Ada Conservée', line1: '22 rue Conservée' };

/**
 * Flags any cart address row showing `marker`, even for a single frame.
 * The regression repainted the deleted address from the tab's cart cache on
 * the next /cart visit before the revalidate replaced it, so an eventual
 * assertion alone would miss it. Mutation callbacks run before paint.
 */
async function watchForAddressRow(page: Page, marker: string): Promise<void> {
  await page.evaluate(
    ({ marker, optionTestId }) => {
      const w = window as unknown as { __deletedAddressSeen?: boolean };
      w.__deletedAddressSeen = false;
      const check = () => {
        for (const input of document.querySelectorAll(`[data-testid="${optionTestId}"]`)) {
          if (input.closest('label')?.textContent?.includes(marker)) w.__deletedAddressSeen = true;
        }
      };
      new MutationObserver(check).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    },
    { marker, optionTestId: tid.cart.addressOption },
  );
}

async function runDeletedAddressStaysDeleted(page: Page, surface: 'web' | 'mobile'): Promise<void> {
  if (surface === 'web') {
    await new AuthPages(page).registerFromDesktopAccountModal(uniqueEmail('cart-deleted-address'), testPassword);
  } else {
    await startCustomerJourneyAtRoot(page);
    await expectAnonymousSession(page);
  }
  await new GalleryPages(page).addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await cart.addHomeAddressFromCart(DELETED);

  await test.step('Expected: the address is still listed after a Galerie round trip (cart cache warm)', async () => {
    await cart.leaveToGalleryAndReturn();
    await expect(cart.addressRow(DELETED.line1)).toBeVisible();
  });

  await cart.deleteAddressFromCart(DELETED.line1);
  await watchForAddressRow(page, DELETED.line1);
  await cart.addHomeAddressFromCart(KEPT);
  await cart.leaveToGalleryAndReturn();

  await test.step('Expected: only the new address is listed and selected, the deleted one never reappears', async () => {
    const kept = cart.addressRow(KEPT.line1);
    await expect(kept).toBeVisible();
    await expect(kept.getByTestId(tid.cart.addressOption)).toBeChecked();
    await expect(page.getByTestId(tid.cart.addressOption)).toHaveCount(1);
    await expect(cart.addressRow(DELETED.line1)).toHaveCount(0);
    const seen = await page.evaluate(
      () => (window as unknown as { __deletedAddressSeen?: boolean }).__deletedAddressSeen,
    );
    expect(seen, 'deleted address was painted again on the cart').toBe(false);
  });
}

test.describe('Functional cart deleted address', () => {
  test('web signed-in deleted cart address: it never comes back after leaving and returning', async ({ page }) => {
    await runDeletedAddressStaysDeleted(page, 'web');
  });

  test('mobile guest deleted cart address: it never comes back after leaving and returning', async ({ page }) => {
    await runDeletedAddressStaysDeleted(page, 'mobile');
  });
});
