import { test, expect } from '../../../support/fixtures.js';
import {
  E2E_PRODUCT_UIDS,
  E2E_USER_LIBRARY_USERS,
} from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import { reveal } from '../../../support/interact.js';
import { shopPath } from '../../../support/shopPath.js';

test.describe('Web gallery user-library', () => {
  test('anonymous visitors cannot see a personal creation: its recipient can filter it', async ({ page }) => {
    const gallery = new GalleryPages(page);
    const personalCard = gallery.cardByUid(E2E_PRODUCT_UIDS.USER_A);

    // The anonymous query must expose neither the private card nor its
    // shortcut filter, even though the E2E catalogue contains the product.
    await page.goto(shopPath('/gallery'));
    await reveal(page.getByTestId(tid.gallery.page));
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.USER_A)).toHaveCount(0);
    await expect(page.getByTestId(tid.gallery.userLibraryOnly)).toHaveCount(0);

    const auth = new AuthPages(page);
    await auth.loginFromDesktopAccountModal(E2E_USER_LIBRARY_USERS.A.email, testPassword);
    await gallery.goto();

    const filter = page.getByTestId(tid.gallery.userLibraryOnly);
    await expect(filter).toBeVisible();
    await expect(filter).toHaveAttribute('aria-pressed', 'false');
    await gallery.showUserLibraryOnly();
    await expect(filter).toHaveAttribute('aria-pressed', 'true');
    await expect(gallery.cards()).toHaveCount(1);
    await expect(personalCard).toBeVisible();
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.USER_B)).toHaveCount(0);
  });
});
