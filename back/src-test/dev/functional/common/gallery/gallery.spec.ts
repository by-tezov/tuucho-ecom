// Shared desktop and mobile gallery coverage.
import { test, expect } from '../../../support/fixtures.js';
import type { Page } from 'patchright/test';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import { scrollGalleryCards, scrollToBottom } from '../../../support/scroll.js';
import { reveal } from '../../../support/interact.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';

/** Catalogue total shown above the grid, not the number of mounted cards. */
async function galleryResultCount(page: Page): Promise<number> {
  const label = page.getByTestId('gallery-result-count');
  const read = async () => Number(((await label.textContent()) ?? '').match(/(\d+)/)?.[1] ?? '0');
  await expect.poll(read, { timeout: 15_000 }).toBeGreaterThan(0);
  return read();
}

test.describe('Functional gallery', () => {
  test('gallery: loads and scrolls cards', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    await scrollGalleryCards(page, tid.gallery.card);
  });

  test('gallery: opens the lightbox', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    await gallery.openZoom(0);
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('gallery: favorites filter shows the favorited card', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    await gallery.toggleFavorite(0);
    await gallery.showFavoritesOnly();
    await expect(gallery.cards().first()).toBeVisible();
  });

  test('stock: filter narrows results', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    const before = await gallery.cards().count();
    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('gallery-stock-out').click();
    await sheet.getByTestId('gallery-filters-apply').click();
    const after = await gallery.cards().count();
    expect(after).toBeLessThanOrEqual(before);
    // Every public E2E set has at least one available size. The sold-out view
    // must therefore exclude all of them, including the partially stocked
    // fixture, rather than merely returning a smaller arbitrary page.
    for (const uid of [E2E_PRODUCT_UIDS.A1, E2E_PRODUCT_UIDS.A2, E2E_PRODUCT_UIDS.B1, E2E_PRODUCT_UIDS.OOS]) {
      await expect(gallery.cardByUid(uid)).toHaveCount(0);
    }
  });

  test('gallery filters: size, shape, and price range narrow the results', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    // The result label is the catalogue total. Mounted cards are a virtualized
    // window that grows one card at a time, so a DOM count taken mid-reveal
    // is not the size of the feed.
    const before = await galleryResultCount(page);

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();

    const sizeGroup = sheet.getByRole('group', { name: /taille/i }).first();
    await sizeGroup.getByTestId('gallery-size-filter-chip').first().click();
    const shapeGroup = sheet.getByRole('group', { name: /forme/i }).first();
    await shapeGroup.getByRole('button').first().click();

    const minPrice = sheet.getByRole('slider', { name: /prix minimum/i });
    const minBound = Number(await minPrice.getAttribute('min'));
    const maxBound = Number(await minPrice.getAttribute('max'));
    expect(maxBound).toBeGreaterThan(minBound);
    await minPrice.fill(String(Math.min(minBound + 1, maxBound)));

    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('gallery-filters-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect
      .poll(
        async () =>
          Number(((await page.getByTestId('gallery-result-count').textContent()) ?? '').match(/(\d+)/)?.[1] ?? '0'),
        { timeout: 15_000 },
      )
      .toBeLessThanOrEqual(before);

    // The selected range survives application and can be inspected again;
    // this proves the price filter was applied, not merely interacted with.
    await page.getByTestId('gallery-filters-toggle').click();
    const reopened = page.getByRole('dialog', { name: /filtres/i });
    await expect(reopened.getByRole('slider', { name: /prix minimum/i })).toHaveValue(
      String(Math.min(minBound + 1, maxBound)),
    );
    await reopened.getByTestId('gallery-filters-apply').click();
  });

  async function assertShapeFilterExcludesNonMatchingSet(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('group', { name: /forme/i })
      .getByRole('button', { name: /^amande$/i })
      .click();
    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();

    // CARRE_LONG only declares the 'carré' shape — filtering by 'amande' must
    // exclude it while keeping a set that actually offers amande.
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.CARRE_LONG)).toHaveCount(0);
    // Real catalogue data also offers 'amande', so the filtered result is
    // large and virtualized — A1 isn't necessarily in the first render
    // window. findSeededCard scrolls incrementally until it mounts.
    await expect(await gallery.findSeededCard(E2E_PRODUCT_UIDS.A1)).toBeVisible();
  }

  async function assertLengthFilterNarrowsToOneSet(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('group', { name: /longueur/i })
      .getByRole('button', { name: /^long$/i })
      .click();
    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();

    // Every other seed only ever stocks E2E_LENGTH ('medium') — filtering by
    // 'long' must resolve to exactly CARRE_LONG, the one set that offers it.
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.CARRE_LONG)).toHaveCount(1);
    await expect(gallery.cardByUid(E2E_PRODUCT_UIDS.A1)).toHaveCount(0);
  }

  test('filters gallery by shape: excludes a set that does not offer it', async ({ page }) => {
    await assertShapeFilterExcludesNonMatchingSet(page);
  });

  test('mobile filters gallery by shape: excludes a set that does not offer it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await assertShapeFilterExcludesNonMatchingSet(page);
  });

  test('filters gallery by length: shows only the set offering it', async ({ page }) => {
    await assertLengthFilterNarrowsToOneSet(page);
  });

  test('mobile filters gallery by length: shows only the set offering it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await assertLengthFilterNarrowsToOneSet(page);
  });

  async function assertManualShapePickOverridesFilterUntilReapplied(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('group', { name: /forme/i })
      .getByRole('button', { name: /^amande$/i })
      .click();
    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();

    const card = await gallery.findSeededCard(E2E_PRODUCT_UIDS.A1);
    const shapeTag = card.getByTestId('gallery-shape');
    await expect(shapeTag).toHaveAttribute('data-shape-key', 'amande');

    // A manual pick on the card's own floating shape menu must be honored
    // immediately, not fought back by the filter-sync effect.
    await shapeTag.click();
    await page
      .getByTestId('gallery-shape-option')
      .filter({ hasText: /^carré$/i })
      .click();
    await expect(shapeTag).toHaveAttribute('data-shape-key', 'carré');
    await page.waitForTimeout(300);
    await expect(shapeTag).toHaveAttribute('data-shape-key', 'carré');

    // Re-activating the same filter value (off, then on again) is a genuine
    // filter change and must snap the card back to its preferred variant.
    await page.getByTestId('gallery-filters-toggle').click();
    const offSheet = page.getByRole('dialog', { name: /filtres/i });
    await offSheet
      .getByRole('group', { name: /forme/i })
      .getByRole('button', { name: /^amande$/i })
      .click();
    await offSheet.getByTestId('gallery-filters-apply').click();
    await expect(offSheet).toBeHidden();

    await page.getByTestId('gallery-filters-toggle').click();
    const onSheet = page.getByRole('dialog', { name: /filtres/i });
    await onSheet
      .getByRole('group', { name: /forme/i })
      .getByRole('button', { name: /^amande$/i })
      .click();
    await onSheet.getByTestId('gallery-filters-apply').click();
    await expect(onSheet).toBeHidden();

    const cardAgain = await gallery.findSeededCard(E2E_PRODUCT_UIDS.A1);
    await expect(cardAgain.getByTestId('gallery-shape')).toHaveAttribute('data-shape-key', 'amande');
  }

  async function assertManualLengthPickOverridesFilterUntilReapplied(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet
      .getByRole('group', { name: /longueur/i })
      .getByRole('button', { name: /^long$/i })
      .click();
    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();

    const card = await gallery.findSeededCard(E2E_PRODUCT_UIDS.CARRE_LONG);
    const lengthTag = card.getByTestId('gallery-length');
    await expect(lengthTag).toHaveAttribute('data-length-key', 'long');

    // A manual pick on the card's own floating length menu must be honored
    // immediately, not fought back by the filter-sync effect.
    await lengthTag.click();
    await page
      .getByTestId('gallery-length-option')
      .filter({ hasText: /^medium$/i })
      .click();
    await expect(lengthTag).toHaveAttribute('data-length-key', 'medium');
    await page.waitForTimeout(300);
    await expect(lengthTag).toHaveAttribute('data-length-key', 'medium');

    // Re-activating the same filter value (off, then on again) is a genuine
    // filter change and must snap the card back to its preferred variant.
    await page.getByTestId('gallery-filters-toggle').click();
    const offSheet = page.getByRole('dialog', { name: /filtres/i });
    await offSheet
      .getByRole('group', { name: /longueur/i })
      .getByRole('button', { name: /^long$/i })
      .click();
    await offSheet.getByTestId('gallery-filters-apply').click();
    await expect(offSheet).toBeHidden();

    await page.getByTestId('gallery-filters-toggle').click();
    const onSheet = page.getByRole('dialog', { name: /filtres/i });
    await onSheet
      .getByRole('group', { name: /longueur/i })
      .getByRole('button', { name: /^long$/i })
      .click();
    await onSheet.getByTestId('gallery-filters-apply').click();
    await expect(onSheet).toBeHidden();

    const cardAgain = await gallery.findSeededCard(E2E_PRODUCT_UIDS.CARRE_LONG);
    await expect(cardAgain.getByTestId('gallery-length')).toHaveAttribute('data-length-key', 'long');
  }

  async function assertManualSizePickOverridesFilterUntilReapplied(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();

    await page.getByTestId('gallery-filters-toggle').click();
    const sheet = page.getByRole('dialog', { name: /filtres/i });
    await expect(sheet).toBeVisible();
    await sheet.locator('[data-testid="gallery-size-filter-chip"][data-size="M"]').click();
    await sheet.getByTestId('gallery-filters-apply').click();
    await expect(sheet).toBeHidden();

    const card = await gallery.findSeededCard(E2E_PRODUCT_UIDS.A1);
    const sizeM = card.locator('[data-testid="gallery-size"][data-size="M"]');
    await expect(sizeM).toHaveAttribute('aria-pressed', 'true');

    // A manual size pick on the card must be honored immediately, not
    // fought back by the filter-sync effect.
    const sizeS = card.locator('[data-testid="gallery-size"][data-size="S"]');
    await reveal(sizeS);
    await sizeS.click();
    await expect(sizeS).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    await expect(sizeS).toHaveAttribute('aria-pressed', 'true');

    // Re-activating the same size filter (off, then on again) is a genuine
    // filter change and must snap the card back to that size.
    await page.getByTestId('gallery-filters-toggle').click();
    const offSheet = page.getByRole('dialog', { name: /filtres/i });
    await offSheet.locator('[data-testid="gallery-size-filter-chip"][data-size="M"]').click();
    await offSheet.getByTestId('gallery-filters-apply').click();
    await expect(offSheet).toBeHidden();

    await page.getByTestId('gallery-filters-toggle').click();
    const onSheet = page.getByRole('dialog', { name: /filtres/i });
    await onSheet.locator('[data-testid="gallery-size-filter-chip"][data-size="M"]').click();
    await onSheet.getByTestId('gallery-filters-apply').click();
    await expect(onSheet).toBeHidden();

    const cardAgain = await gallery.findSeededCard(E2E_PRODUCT_UIDS.A1);
    await expect(cardAgain.locator('[data-testid="gallery-size"][data-size="M"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  test('manual shape pick on a card: overrides the active filter until it is reapplied', async ({ page }) => {
    await assertManualShapePickOverridesFilterUntilReapplied(page);
  });

  test('mobile manual shape pick on a card: overrides the active filter until it is reapplied', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await assertManualShapePickOverridesFilterUntilReapplied(page);
  });

  test('manual length pick on a card: overrides the active filter until it is reapplied', async ({ page }) => {
    await assertManualLengthPickOverridesFilterUntilReapplied(page);
  });

  test('mobile manual length pick on a card: overrides the active filter until it is reapplied', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    await assertManualLengthPickOverridesFilterUntilReapplied(page);
  });

  // Desktop only: the card's size row is deliberately `display: none` on
  // mobile (compact layout — size is picked from the lightbox there instead,
  // see GalleryCard.module.css), so there is no card-level size affordance
  // to exercise on a mobile viewport.
  test('manual size pick on a card: overrides the active filter until it is reapplied', async ({ page }) => {
    await assertManualSizePickOverridesFilterUntilReapplied(page);
  });

  test('drawer continue: multiple products are added to the cart', async ({ page }) => {
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    // Reveal drips cards in. Wait until a row is actually mounted before
    // deciding how many products this test can add.
    let available = 0;
    await expect
      .poll(
        async () => {
          available = await gallery.cards().count();
          return available;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(3);
    const n = Math.min(3, available);
    await gallery.addFirstAvailableToCart(n, { dismissDrawer: false });
    // A hard navigation clears the disposable browser storage via the test
    // profile init script, which is exactly where anonymous carts live. Use
    // the drawer's SPA navigation so this test validates the real guest cart.
    await reveal(page.getByTestId(tid.cart.drawerCheckout));
    await page.getByTestId(tid.cart.drawerCheckout).click();
    await expect(page).toHaveURL(/\/cart(?:$|[/?])/);
    await reveal(page.getByTestId(tid.cart.page));
    const lines = page.getByTestId(tid.cart.line);
    await expect(lines).toHaveCount(n);
    await scrollToBottom(page);
  });

  test('mobile gallery: scroll and add to cart via lightbox', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 633 });
    const gallery = new GalleryPages(page);
    await gallery.goto();
    await expect(gallery.cards().first()).toBeVisible();
    await scrollGalleryCards(page, tid.gallery.card);
    // Virtual rows are recycled at the bottom. Come back to a mounted card
    // before opening it, instead of clicking a row that is still swapping.
    await reveal(page.getByTestId(tid.gallery.card).first());
    await gallery.addFirstAvailableToCart(1, { dismissDrawer: false });
    await expect(page.getByTestId(tid.cart.drawer)).toBeVisible();
  });

  async function assertLightboxQuantityOpensFromPointer(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.openZoomForUid(E2E_PRODUCT_UIDS.A1);
    await gallery.ensureLightboxSheetExpanded();
    const lightbox = page.getByTestId(tid.gallery.lightbox);
    await gallery.openQuantityPicker(lightbox);
    await gallery.chooseQuantity(2);
    await expect(lightbox).toBeVisible();
    await expect(gallery.quantityTrigger(lightbox)).toContainText('2');
  }

  async function assertSizeRequestQuantityOpensFromPointer(page: Page) {
    const gallery = new GalleryPages(page);
    await gallery.openZoomForUid(E2E_PRODUCT_UIDS.OOS);
    const request = await gallery.openSizeRequestFromUnavailableSize('XS');
    await gallery.openQuantityPicker(request);
    await gallery.chooseQuantity(2);
    await expect(request).toBeVisible();
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible();
    await expect(gallery.quantityTrigger(request)).toContainText('2');
  }

  test('lightbox quantity list: opens from a real pointer without closing zoom', async ({ page }) => {
    await assertLightboxQuantityOpensFromPointer(page);
  });

  test('mobile lightbox quantity list: opens from a real pointer without closing zoom', async ({ page }) => {
    await assertLightboxQuantityOpensFromPointer(page);
  });

  test('size-request quantity list: opens from a real pointer without closing zoom', async ({ page }) => {
    await assertSizeRequestQuantityOpensFromPointer(page);
  });

  test('mobile size-request quantity list: opens from a real pointer without closing zoom', async ({
    page,
  }) => {
    await assertSizeRequestQuantityOpensFromPointer(page);
  });

  async function assertSizeRequestDismissThenLightboxClosesOnce(
    page: Page,
    dismiss: 'backdrop' | 'close',
  ) {
    const gallery = new GalleryPages(page);
    await gallery.assertSizeRequestThenLightboxClosesOnce(dismiss);
  }

  test('size-request backdrop: dismiss then zoom close does not open another lightbox', async ({
    page,
  }) => {
    await assertSizeRequestDismissThenLightboxClosesOnce(page, 'backdrop');
  });

  test('mobile size-request backdrop: dismiss then zoom close does not open another lightbox', async ({
    page,
  }) => {
    await assertSizeRequestDismissThenLightboxClosesOnce(page, 'backdrop');
  });

  test('size-request close then zoom close: another lightbox does not open', async ({ page }) => {
    await assertSizeRequestDismissThenLightboxClosesOnce(page, 'close');
  });

  test('mobile size-request close then zoom close: another lightbox does not open', async ({
    page,
  }) => {
    await assertSizeRequestDismissThenLightboxClosesOnce(page, 'close');
  });
});
