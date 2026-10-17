import { test, expect } from '../../../support/fixtures.js';
import { enableAllShopPaymentMethods } from '../../../support/api.js';
import { E2E_GIFT_PRODUCT_UID, E2E_NAIL_PRICES } from '../../../support/catalog.js';
import { ComposePages, euro } from '../../../support/pages/compose.pages.js';
import { tid } from '../../../support/selectors.js';
import { startCustomerJourneyAtRoot } from '../../../support/interact.js';

/**
 * Seeded cart rules (`CART_RULE_GIFT_MIN_NAILS` / `CART_RULE_NAIL_TIER_MIN_NAILS`
 * = 5, tip-pot 1 per set, volume tiers 2=5% …). A composed set only counts
 * once it holds at least that many nails. Qty 2 is enough to unlock the
 * first volume step when the set qualifies.
 */
const MIN_NAILS = 5;
const VOLUME_PERCENT = 5;

function tipPotLine(page: import('patchright/test').Page) {
  return page.locator(
    `[data-testid="${tid.cart.accessoryLine}"][data-product-uid="${E2E_GIFT_PRODUCT_UID}"][data-origin="rule"]`,
  );
}

test.describe('Compose cart rules (tip-pot and volume remise)', () => {
  test.beforeEach(async ({ request }) => {
    await enableAllShopPaymentMethods(request);
  });

  test('below minNails: tip-pot stays absent at qty 2', async ({ page }) => {
    const compose = await seedFourNailCartAtQty2(page);
    await expect(compose.cartComposition()).toContainText('4 / 10');
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 4 * 2);
    await expect(tipPotLine(page)).toHaveCount(0);
  });

  test('below minNails: volume remise stays absent at qty 2', async ({ page }) => {
    const compose = await seedFourNailCartAtQty2(page);
    await compose.expectCartGoods(E2E_NAIL_PRICES.NAIL_A * 4 * 2);
    await expect(page.getByTestId(tid.cart.rulesDiscount)).toHaveCount(0);
  });

  test('at minNails: tip-pot unlocks at qty 2', async ({ page }) => {
    const compose = await seedOneHandCartAtQty2(page);
    await expect(compose.cartComposition()).toContainText('5 / 10');
    await expect(tipPotLine(page)).toBeVisible({ timeout: 15_000 });
    await expect(tipPotLine(page)).toContainText(/gratuit|free/i);
  });

  test('at minNails: volume remise unlocks at qty 2', async ({ page }) => {
    const compose = await seedOneHandCartAtQty2(page);
    const merchandise = E2E_NAIL_PRICES.NAIL_A * MIN_NAILS * 2;
    const discount = Math.round(merchandise * (VOLUME_PERCENT / 100) * 100) / 100;
    await compose.expectCartGoods(merchandise);
    await expect(page.getByTestId(tid.cart.rulesDiscount)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(tid.cart.rulesDiscount)).toContainText(`−${euro(discount)}`);
  });
});

async function seedFourNailCartAtQty2(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.buildFourNails();
  await expect(page.getByTestId(tid.compose.page)).toContainText(`${4} / 10`);
  await compose.submitAndGoToCart();
  await compose.increaseCartQuantity();
  return compose;
}

async function seedOneHandCartAtQty2(page: import('patchright/test').Page) {
  const compose = new ComposePages(page);
  await startCustomerJourneyAtRoot(page);
  await compose.goto();
  await compose.buildOneHand();
  await expect(page.getByTestId(tid.compose.page)).toContainText(`${MIN_NAILS} / 10`);
  await compose.submitAndGoToCart();
  await compose.increaseCartQuantity();
  return compose;
}
