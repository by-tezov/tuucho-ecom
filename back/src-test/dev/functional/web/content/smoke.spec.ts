import { test, expect } from '../../../support/fixtures.js';
import { scrollToBottom } from '../../../support/scroll.js';
import { shopNavigatePath } from '../../../support/shopPath.js';

const pages = [
  { path: '/', name: 'home', heading: '#hero-h', title: 'Des ongles uniques, réalisés à la main' },
  { path: '/about', name: 'about', heading: '#page-h', title: 'À propos' },
  { path: '/pose', name: 'pose', heading: '#page-h', title: 'Poser & déposer tes capsules' },
  { path: '/sizes', name: 'sizes', heading: '#guide-h', title: 'Trouve ta taille' },
  { path: '/legal', name: 'legal', heading: '#legal-h', title: 'Mentions légales' },
  { path: '/privacy', name: 'privacy', heading: '#privacy-h', title: 'Politique de confidentialité' },
  { path: '/terms', name: 'terms', heading: '#terms-h', title: 'Conditions générales d’utilisation' },
  { path: '/sales-terms', name: 'sales-terms', heading: '#sales-terms-h', title: 'Conditions générales de vente' },
  { path: '/sitemap', name: 'sitemap', heading: '#sitemap-h', title: 'Plan du site' },
];

test.describe('Functional content smoke', () => {
  for (const entry of pages) {
    test(`page ${entry.name}: it loads and scrolls to the bottom`, async ({ page }) => {
      const res = await page.goto(shopNavigatePath(entry.path));
      expect(res?.ok()).toBeTruthy();
      // A dev server commonly returns index.html with HTTP 200 for every
      // path, including an outage fallback. Validate the page's own expected
      // H1 before scrolling so "Service unavailable" cannot pass as content.
      await expect(page.locator(entry.heading)).toHaveText(entry.title);
      await scrollToBottom(page);
      const nearBottom = await page.evaluate(() => {
        const max = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        );
        // Short pages cannot scroll — treat as already at bottom.
        if (max <= window.innerHeight + 8) return true;
        return window.scrollY + window.innerHeight >= max - 24;
      });
      expect(nearBottom).toBeTruthy();
    });
  }

  test('unknown route: the 404 page is shown', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-e2e');
    await expect(page).toHaveURL(/\/this-route-does-not-exist-e2e$/);
    await expect(page.locator('#nf-h')).toHaveText('Page introuvable');
    await scrollToBottom(page);
  });
});
