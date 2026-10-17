import { test, expect } from '../../../support/fixtures.js';
import {
  enableAllShopPaymentMethods,
  uniqueEmail,
} from '../../../support/api.js';
import {
  E2E_NAIL_PRICES,
  E2E_PRODUCT_UIDS,
  E2E_TITLES,
  E2E_VARIATION,
} from '../../../support/catalog.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { ComposePages, euro } from '../../../support/pages/compose.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, expectAnonymousSession, startCustomerJourneyAtRoot } from '../../../support/interact.js';
import { shopPath } from '../../../support/shopPath.js';

async function seedOneNailInCart(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.buildOneNail();
  await compose.submit({ dismissDrawer: true });
  await new CartPages(page).goto();
  await compose.expectCartCompositionCount(1);
  return compose;
}

async function seedIncompleteThree(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.buildIncompleteThree();
  await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A * 2 + E2E_NAIL_PRICES.NAIL_B);
  return compose;
}

async function seedTwoCompositionsInCart(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.buildOneNail();
  await compose.submit({ dismissDrawer: true });
  await compose.goto();
  await compose.addNail(E2E_PRODUCT_UIDS.NAIL_B, 'right-thumb');
  await compose.submitAndGoToCart();
  await compose.expectCartCompositionCount(2);
  return compose;
}

test.describe('Compose cart layouts and mutations', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('one nail: composition reaches the cart with its price', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A);
    await compose.changeNailShape('left-thumb', 'carré');
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A);
    await compose.submit({ dismissDrawer: true });
    const cart = new CartPages(page);
    await cart.goto();
    await compose.expectCartCompositionCount(1);
    await expect(compose.cartComposition()).toContainText('1 / 10');
    await expect(compose.cartComposition()).toContainText(euro(E2E_NAIL_PRICES.NAIL_A));
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);
  });

  test('one nail cart: increasing quantity updates goods', async ({ page }) => {
    const compose = await seedOneNailInCart(page);
    await compose.increaseCartQuantity();
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 2);
  });

  test('one nail cart: changing size keeps goods priced', async ({ page }) => {
    const compose = await seedOneNailInCart(page);
    await compose.changeCartSize('L');
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);
  });

  test('one nail on each hand: shows both hand groups', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.goto();
    await compose.buildOnePerHand();
    const unit = E2E_NAIL_PRICES.NAIL_A + E2E_NAIL_PRICES.NAIL_B;
    await compose.expectTotal(unit);
    await compose.submitAndGoToCart();
    await expect(compose.cartComposition()).toContainText('2 / 10');
    await expect(compose.cartComposition()).toContainText('Main gauche');
    await expect(compose.cartComposition()).toContainText('Main droite');
    await compose.expectCartGoods(unit);
  });

  test('one hand: only the left hand is listed', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.goto();
    await compose.buildOneHand();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A * 5);
    await compose.submitAndGoToCart();
    await expect(compose.cartComposition()).toContainText('5 / 10');
    await expect(compose.cartComposition()).toContainText('Main gauche');
    await expect(compose.cartComposition()).not.toContainText('Main droite');
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 5);
  });

  test('incomplete set: a premium variation updates the composer total', async ({ page }) => {
    const compose = await seedIncompleteThree(page);
    const three = E2E_NAIL_PRICES.NAIL_A * 2 + E2E_NAIL_PRICES.NAIL_B;
    await compose.addNail(E2E_PRODUCT_UIDS.NAIL_V, 'right-thumb', {
      variationKey: E2E_VARIATION.BASE,
    });
    await compose.expectTotal(three + E2E_NAIL_PRICES.NAIL_V);
    await compose.changeNailVariation('right-thumb', E2E_VARIATION.PREMIUM);
    await compose.expectTotal(three + E2E_NAIL_PRICES.NAIL_V_PREMIUM);
  });

  test('incomplete set: removing a nail updates the composer total', async ({ page }) => {
    const compose = await seedIncompleteThree(page);
    const three = E2E_NAIL_PRICES.NAIL_A * 2 + E2E_NAIL_PRICES.NAIL_B;
    await compose.removeNail('left-index');
    await compose.expectTotal(three - E2E_NAIL_PRICES.NAIL_A);
  });

  test('incomplete set with a premium variation: reaches the cart', async ({ page }) => {
    const compose = await seedIncompleteThree(page);
    const three = E2E_NAIL_PRICES.NAIL_A * 2 + E2E_NAIL_PRICES.NAIL_B;
    await compose.addNail(E2E_PRODUCT_UIDS.NAIL_V, 'right-thumb', {
      variationKey: E2E_VARIATION.PREMIUM,
    });
    const afterAdd = three + E2E_NAIL_PRICES.NAIL_V_PREMIUM;
    await compose.expectTotal(afterAdd);
    await compose.submitAndGoToCart();
    await expect(compose.cartComposition()).toContainText('4 / 10');
    await expect(compose.cartComposition()).toContainText(/nuit/i);
    await compose.expectCartGoods(afterAdd);
  });

  test('deep link from gallery-nail?product: places the nail', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.gotoWithProduct(E2E_PRODUCT_UIDS.NAIL_A);
    await expect(page.getByTestId(tid.compose.lightboxAdd)).toBeVisible({ timeout: 15_000 });
    await clickVisible(
      page
        .getByTestId(tid.gallery.lightbox)
        .locator(`[data-testid="${tid.compose.handFinger}"][data-hand-finger="left-thumb"]`),
    );
    await clickVisible(page.getByTestId(tid.compose.lightboxAdd));
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeHidden({ timeout: 10_000 });
    await expect(
      page.locator(`[data-testid="${tid.compose.finger}"][data-finger="left-thumb"]`),
    ).toBeVisible();
    await compose.expectTotal(E2E_NAIL_PRICES.NAIL_A);
  });

  test('nail product page CTA: opens the composer zoom', async ({ page }) => {
    await startCustomerJourneyAtRoot(page);
    await page.goto(shopPath(`/nail/rose-e2e-nail-alpha-${E2E_PRODUCT_UIDS.NAIL_A.toLowerCase()}`));
    await expect(page.getByTestId(tid.compose.nailProductPage)).toBeVisible({ timeout: 15_000 });
    await clickVisible(page.getByTestId(tid.compose.nailProductCompose));
    // useGalleryProductDeepLink strips ?product= once the nail fetch settles
    // (so refresh/back does not reopen the zoom). Assert the stable outcome:
    // composer page with that nail's zoom open, not the ephemeral query.
    await expect(page).toHaveURL(/\/gallery-nail/);
    await expect(page.getByTestId(tid.compose.page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(tid.compose.lightboxAdd)).toBeVisible();
  });

  test('cart: deleting one of two compositions leaves one line', async ({ page }) => {
    const compose = await seedTwoCompositionsInCart(page);
    await compose.deleteCartComposition(0);
    await compose.expectCartCompositionCount(1);
    await expect(page.getByTestId(tid.cart.subtotal)).toHaveText(/[45]\.00 €/);
  });

  test('composer drawer: trash removes one of two drawer lines', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.submit({ dismissDrawer: true });
    await compose.goto();
    await compose.addNail(E2E_PRODUCT_UIDS.NAIL_B, 'right-thumb');
    await compose.submit({ dismissDrawer: false });
    await expect(page.getByTestId(tid.compose.drawerLine)).toHaveCount(2);
    await compose.deleteFromDrawer();
    await expect(page.getByTestId(tid.compose.drawerLine)).toHaveCount(1);
  });

  test('guest composition: the cart has no wishlist control', async ({ page }) => {
    const compose = new ComposePages(page);
    await startCustomerJourneyAtRoot(page);
    await expectAnonymousSession(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.submitAndGoToCart();
    await expect(compose.cartComposition().getByRole('button', { name: /Plus tard/i })).toHaveCount(0);
  });

  test('signed-in composition: it moves to Wish List and appears there', async ({ page }) => {
    const email = uniqueEmail('compose-wish');
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    const compose = new ComposePages(page);
    await compose.goto();
    await compose.buildOneNail();
    await compose.submitAndGoToCart();
    await compose.moveToWishlist();
    await compose.expectCartCompositionCount(0);
    await compose.activateWishlistCart();
    await expect(compose.cartComposition()).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.NAIL_A]);
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A);
  });

  test('one hand plus gallery set: drawer shows both line kinds', async ({ page }) => {
    const compose = new ComposePages(page);
    const gallery = new GalleryPages(page);
    await startCustomerJourneyAtRoot(page);
    await compose.goto();
    await compose.buildOneHand();
    await compose.submit({ dismissDrawer: true });
    await gallery.goto();
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, {
      shapeKey: 'amande',
      size: 'M',
      dismissDrawer: false,
    });
    const drawer = page.getByTestId(tid.cart.drawer);
    await expect(drawer.getByTestId(tid.compose.drawerLine)).toBeVisible();
    await expect(page.getByTestId(tid.cart.drawerSuccess)).toContainText(E2E_TITLES[E2E_PRODUCT_UIDS.A1]);
    await clickVisible(page.getByTestId(tid.cart.drawerCheckout));
    await compose.expectCartCompositionCount(1);
    await expect(page.getByTestId(tid.cart.line)).toHaveCount(1);
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 5 + E2E_NAIL_PRICES.SET_A1);
  });
});
