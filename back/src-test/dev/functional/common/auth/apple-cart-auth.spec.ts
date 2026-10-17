// Apple is a browser SDK integration. These cart tests stub only the SDK
// token hand-off and verify Lumen's own verbose create and existing-login
// branches at the checkout entry point.
import { expect, type Page } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { checkVisible, clickVisible } from '../../../support/interact.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';

type Surface = 'web' | 'mobile';

function appleSession(email: string, created: boolean) {
  return {
    success: true,
    ...(created ? { created: true } : {}),
    user: {
      id: `apple-cart-${email}`,
      email,
      emailVerified: true,
      pendingEmail: null,
      firstName: null,
      lastName: null,
      phone: null,
      status: 'active',
      role: 'user',
      deletionScheduledFor: null,
      hasPassword: false,
      hasGoogle: false,
      googleEmail: null,
      hasApple: true,
      appleEmail: email,
      hasFacebook: false,
      facebookEmail: null,
    },
    accessToken: `apple-cart-token-${created ? 'new' : 'existing'}`,
    accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  };
}

async function stubAppleIdentity(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.AppleID = {
      auth: {
        init() {},
        async signIn() {
          return {
            authorization: { code: 'apple-cart-code', id_token: 'apple-cart-id-token' },
          };
        },
      },
    };
  });
}

async function offerAppleOnly(page: Page): Promise<void> {
  await page.route('**/auth/sign-in-methods', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        signInMethods: {
          google: false,
          apple: true,
          facebook: false,
          googleVerbose: false,
          appleVerbose: true,
          facebookVerbose: false,
        },
      }),
    });
  });
}

async function openGuestCart(page: Page, surface: Surface): Promise<void> {
  await page.setViewportSize(surface === 'mobile' ? { width: 390, height: 633 } : { width: 1280, height: 900 });
  await page.goto(shopPath('/gallery'));
  await new GalleryPages(page).addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'S' });
  await new CartPages(page).goto();
  await expect(page.getByTestId(tid.guest.email)).toBeVisible({ timeout: 15_000 });
}

async function clickApple(page: Page): Promise<void> {
  await clickVisible(page.getByTestId('auth-apple-continue'));
}

async function appleCreatesAccountFromGuestCart(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-apple-cart-new`);
  await stubAppleIdentity(page);
  await offerAppleOnly(page);
  await page.route('**/auth/apple', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        needsAccountChoice: true,
        socialPendingToken: 'apple-cart-pending',
        provider: 'apple',
        socialEmail: email,
      }),
    });
  });
  await page.route('**/auth/social/create', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(appleSession(email, true)) });
  });

  await openGuestCart(page, surface);
  await expect(page.getByTestId('guest-checkout-account-gdpr')).toHaveCount(0);
  await clickApple(page);
  const create = page.getByRole('button', { name: /créer un compte/i });
  await expect(create).toBeVisible({ timeout: 15_000 });
  await clickVisible(create);
  const consent = page.getByRole('checkbox', { name: /j’accepte.*CGU/i });
  await expect(consent).toBeVisible({ timeout: 15_000 });
  await checkVisible(consent);
  await clickVisible(create);
  await expect(page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
}

async function existingAppleConnectsFromGuestCart(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-apple-cart-existing`);
  await stubAppleIdentity(page);
  await offerAppleOnly(page);
  await page.route('**/auth/apple', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(appleSession(email, false)) });
  });

  await openGuestCart(page, surface);
  await expect(page.getByTestId('guest-checkout-account-gdpr')).toHaveCount(0);
  await clickApple(page);
  await expect(page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
}

test.describe('Apple guest-cart authentication', () => {
  test('web verbose Apple identity: creates a new account from the guest cart', async ({ page }) => {
    await appleCreatesAccountFromGuestCart(page, 'web');
  });
  test('mobile verbose Apple identity: creates a new account from the guest cart', async ({ page }) => {
    await appleCreatesAccountFromGuestCart(page, 'mobile');
  });

  test('web existing Apple identity: connects from the guest cart without account consent', async ({ page }) => {
    await existingAppleConnectsFromGuestCart(page, 'web');
  });
  test('mobile existing Apple identity: connects from the guest cart without account consent', async ({ page }) => {
    await existingAppleConnectsFromGuestCart(page, 'mobile');
  });
});
