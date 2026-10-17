import { test, expect } from '../../../support/fixtures.js';
import {
  E2E_PRODUCT_UIDS,
  E2E_USER_LIBRARY_USERS,
} from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

const MOBILE = { width: 390, height: 633 };

test.describe('Mobile gallery user-library', () => {
  test('Mes créations: shows only the signed-in customer’s personal creation', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    const auth = new AuthPages(page);
    await auth.loginFromMobileOrders(E2E_USER_LIBRARY_USERS.B.email, testPassword);

    const gallery = new GalleryPages(page);
    // Navigation itself is covered by the mobile tab-bar suite. Go straight
    // to the public gallery route here so this test stays focused on the
    // authenticated feed and its mobile filter state.
    await page.goto(shopPath('/gallery'));
    await expect(page.getByTestId(tid.gallery.page)).toBeVisible();
    const filter = page.getByTestId(tid.gallery.userLibraryOnly);
    await expect(filter).toBeVisible();
    await expect(filter).toHaveAttribute('aria-pressed', 'false');

    await gallery.showUserLibraryOnly();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(gallery.cards()).toHaveCount(1);
    const personalCard = gallery.cardByUid(E2E_PRODUCT_UIDS.USER_B);
    await expect(personalCard).toBeVisible();
    await expect(personalCard.getByTestId(tid.gallery.userLibraryMarker)).toBeVisible();
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.USER_A)).toHaveCount(0);
  });
});
