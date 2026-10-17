import { expect, test } from '@playwright/test';

test('public shell changes and persists the semantic theme', async ({ page }) => {
  await page.goto('/en/about');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', 'dark');
});

test('localized public route keeps its URL language through the application shell', async ({ page }) => {
  await page.goto('/es/about');

  // A cold deep link deliberately plays the entry splash at `/` first. In
  // the isolated test server the API is unavailable, so its safety exit owns
  // the worst-case timing before the original URL is resumed.
  await expect(page).toHaveURL(/\/es\/about$/, { timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('alert', { name: /error/i })).toHaveCount(0);
});
