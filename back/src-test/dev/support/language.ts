import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { clickVisible } from './interact.js';

/** Non-default shop languages reachable from the French switcher. */
export type SwitchableLang = 'en' | 'th' | 'es' | 'it' | 'nl' | 'pt';

const LANGUAGE_OPTION: Record<SwitchableLang, RegExp> = {
  en: /English/i,
  th: /ไทย/,
  es: /Español/i,
  it: /Italiano/i,
  nl: /Nederlands/i,
  pt: /Português/i,
};

/** Switch a customer-facing page from French to another enabled language and
 * verify the SEO-visible result: localized route, document language,
 * translated heading, canonical URL, and alternate links. */
export async function switchToLanguage(
  page: Page,
  lang: SwitchableLang,
  restPath: string,
  heading: RegExp,
): Promise<void> {
  const trigger = page.getByRole('button', { name: /changer de langue/i });
  await expect(trigger).toBeVisible();
  await clickVisible(trigger);

  const menu = page.getByRole('listbox', { name: /changer de langue/i });
  await expect(menu).toBeVisible();
  const option = menu.getByRole('option', { name: LANGUAGE_OPTION[lang] });
  await expect(option).toHaveAttribute('aria-selected', 'false');
  await clickVisible(option);

  const expectedPath = `/${lang}${restPath === '/' ? '' : restPath}`;
  await expect(page).toHaveURL((url) => url.pathname === expectedPath);
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('h1').first()).toContainText(heading);

  // The local dev target intentionally emits noindex and removes canonical /
  // hreflang links. Production SEO metadata is still checked when the
  // functional runner is explicitly launched with PAM_FRONT_SEO=1.
  if (process.env.PAM_FRONT_SEO === '1') {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', new RegExp(`${expectedPath.replaceAll('/', '\\/')}$`));
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(8);
  } else {
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  }
  await expect(menu).toBeHidden();
}

export async function switchToEnglish(
  page: Page,
  restPath: string,
  heading: RegExp,
): Promise<void> {
  await switchToLanguage(page, 'en', restPath, heading);
}
