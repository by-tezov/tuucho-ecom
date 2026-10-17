import { test, expect } from '../../../support/fixtures.js';
import { switchToEnglish, switchToLanguage, type SwitchableLang } from '../../../support/language.js';
import { shopPath } from '../../../support/shopPath.js';

const PAGES = [
  { path: '/home', name: 'accueil', heading: /unique nails|crafted entirely by hand/i },
  { path: '/gallery', name: 'galerie', heading: /all my creations/i },
  { path: '/gallery-nail', name: 'composition', heading: /pick each nail one by one/i },
  { path: '/capsules', name: 'formes', heading: /which shape suits you/i },
  { path: '/about', name: 'à propos', heading: /about/i },
  { path: '/contact', name: 'contact', heading: /question, an idea/i },
  { path: '/pose', name: 'pose', heading: /apply|how to/i },
  { path: '/sizes', name: 'tailles', heading: /size|fit/i },
  { path: '/legal', name: 'mentions légales', heading: /legal notice/i },
  { path: '/privacy', name: 'confidentialité', heading: /privacy policy/i },
  { path: '/terms', name: 'conditions', heading: /terms of use/i },
  { path: '/sales-terms', name: 'vente', heading: /terms of sale/i },
  { path: '/sitemap', name: 'plan du site', heading: /sitemap/i },
] as const;

/** Accueil only: one page × every non-English locale keeps the matrix bounded. */
const HOME_BY_LANG: Array<{ lang: SwitchableLang; name: string; heading: RegExp }> = [
  { lang: 'th', name: 'thaï', heading: /เล็บสวยเฉพาะตัว/ },
  { lang: 'es', name: 'espagnol', heading: /uñas únicas|creadas enteramente a mano/i },
  { lang: 'it', name: 'italien', heading: /unghie uniche|realizzate interamente a mano/i },
  { lang: 'nl', name: 'néerlandais', heading: /unieke nagels|met de hand gemaakt/i },
  { lang: 'pt', name: 'portugais', heading: /unhas únicas|criadas inteiramente/i },
];

test.describe('Sélecteur de langue et SEO, ordinateur', () => {
  for (const entry of PAGES) {
    test(`page ${entry.name}: elle passe du français à l’anglais`, async ({ page }) => {
      await page.goto(shopPath(entry.path));
      await switchToEnglish(page, entry.path, entry.heading);
    });
  }

  for (const entry of HOME_BY_LANG) {
    test(`accueil: il passe du français au ${entry.name}`, async ({ page }) => {
      await page.goto(shopPath('/home'));
      await switchToLanguage(page, entry.lang, '/home', entry.heading);
    });
  }

  test('a bare /gallery URL: negotiates to French /fr/gallery', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page).toHaveURL((url) => url.pathname === '/fr/gallery');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
