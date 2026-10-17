import { test, expect } from '../../../support/fixtures.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

test.describe('Functional home featured', () => {
  test('nouveautés featured section: it is built from the E2E featured catalogue', async ({ page }) => {
    await page.goto(shopPath('/home'));
    const section = page.getByTestId(tid.home.featured);
    await expect(section).toBeVisible();
    await expect(page.getByTestId(tid.home.featuredCard).first()).toBeVisible();
  });
});
