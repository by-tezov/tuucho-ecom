// Facebook Login is a third-party browser integration. These tests replace
// only FB.login with a deterministic access-token callback, while still
// exercising the browser-side request, consent and account-link handling.
// Token verification itself is covered by the API social-auth contract.
import { expect, type Page } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { tid } from '../../../support/selectors.js';
import { checkVisible, clickVisible, desktopLoginButton, fillVisible } from '../../../support/interact.js';
import { shopPath } from '../../../support/shopPath.js';

interface FacebookSessionOptions {
  email: string;
  created: boolean;
  hasFacebook?: boolean;
  accessToken?: string;
}

function session({
  email,
  created,
  hasFacebook = true,
  accessToken = 'facebook-browser-test-token',
}: FacebookSessionOptions) {
  return {
    success: true,
    user: {
      id: `facebook-test-${email}`,
      email,
      emailVerified: true,
      pendingEmail: null,
      firstName: null,
      lastName: null,
      phone: null,
      status: 'active',
      role: 'user',
      deletionScheduledFor: null,
      hasPassword: true,
      hasGoogle: false,
      googleEmail: null,
      hasFacebook,
      facebookEmail: hasFacebook ? email : null,
    },
    accessToken,
    accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    ...(created ? { created: true } : {}),
  };
}

/** Install an SDK-shaped FB object before application modules run. The
 * production popup cannot be driven without an interactive Meta account. */
async function stubFacebookLogin(page: Page, accessToken: string): Promise<void> {
  await page.addInitScript((token: string) => {
    const FB = {
      init() {},
      login(callback: (response: { authResponse?: { accessToken?: string } }) => void) {
        callback({ authResponse: { accessToken: token } });
      },
    };
    (window as unknown as { FB: typeof FB }).FB = FB;
  }, accessToken);
}

async function mockFacebookSignIn(page: Page, result: ReturnType<typeof session>): Promise<void> {
  await page.route('**/auth/facebook', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
}

async function openGuestCart(page: Page): Promise<void> {
  await page.goto(shopPath('/gallery'));
  await new GalleryPages(page).addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'S' });
  await new CartPages(page).goto();
  await expect(page.getByTestId(tid.guest.email)).toBeVisible({ timeout: 15_000 });
}

async function facebookFromGuestCart(page: Page): Promise<void> {
  await checkVisible(page.getByTestId(tid.guest.consent));
  await clickVisible(
    page.getByTestId(tid.auth.facebookButtonHost).getByRole('button', { name: /facebook/i }),
  );
  await expect(page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
}

/** Account settings re-fetch GET /account/profile when `user.id` changes.
 * Link/unlink mocks must keep the live account id, not a fabricated one. */
async function rememberProfileUser(page: Page): Promise<{ snapshot: () => Record<string, unknown> }> {
  let user: Record<string, unknown> | null = null;
  await page.route('**/account/profile', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as { user?: Record<string, unknown> };
    if (body.user) user = body.user;
    await route.fulfill({
      status: response.status(),
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  return {
    snapshot() {
      if (!user) throw new Error('GET /account/profile has not returned a user yet');
      return user;
    },
  };
}

async function prepareFacebookSignInMethods(page: import('patchright/test').Page, email: string) {
  await stubFacebookLogin(page, `facebook-link-${email}`);
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(email, testPassword);
  const profile = await rememberProfileUser(page);
  await auth.openDesktopAccount();
  const signInMethods = page.getByTestId(tid.account.signInMethods);
  await clickVisible(signInMethods.getByRole('button', { name: /déverrouiller/i }));
  const unlockDialog = page.getByRole('dialog', { name: /déverrouiller/i });
  await fillVisible(unlockDialog.locator('input[name="current-password"]'), testPassword);
  await clickVisible(unlockDialog.getByRole('button').last());
  await expect(page.getByTestId(tid.account.facebookLinkButton)).toBeVisible({ timeout: 15_000 });
  return { signInMethods, profile };
}

test.describe('Facebook account journeys (JS SDK browser contract)', () => {
  test('a forged callback without a locally: started flow never opens a session', async ({ page }) => {
    let facebookRequests = 0;
    await page.route('**/auth/facebook', async (route) => {
      facebookRequests += 1;
      await route.abort();
    });

    await page.goto('/auth/facebook-return#access_token=attacker-token&state=attacker-state');
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => facebookRequests).toBe(0);
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toHaveCount(0);
  });

  test('new Facebook identity: accepts consent and creates the account', async ({ page }) => {
    const email = uniqueEmail('facebook-new');
    await stubFacebookLogin(page, 'facebook-new-access-token');
    await page.route('**/auth/facebook', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          needsConsent: true,
          facebookSignupToken: 'facebook-signup-token',
        }),
      });
    });
    await page.route('**/auth/facebook/complete', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(session({ email, created: true })),
      });
    });

    await page.goto('/');
    await clickVisible(desktopLoginButton(page));
    await clickVisible(
      page.getByTestId(tid.auth.facebookButtonHost).getByRole('button', { name: /facebook/i }),
    );
    await expect(page.getByTestId(tid.auth.facebookConsent)).toBeVisible({ timeout: 15_000 });
    await checkVisible(page.getByTestId(tid.auth.facebookConsent));
    await clickVisible(page.getByRole('button', { name: /^accepter$/i }));
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('a password-created account: can sign in through its matching Facebook identity', async ({ page }) => {
    const email = uniqueEmail('facebook-password-existing');
    await stubFacebookLogin(page, 'facebook-existing-access-token');
    let accessToken: string | undefined;
    await page.route('**/auth/login-or-register', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { accessToken?: string };
      accessToken = body.accessToken;
      await route.fulfill({ response, body: JSON.stringify(body) });
    });
    const auth = new AuthPages(page);
    await auth.registerFromDesktopAccountModal(email, testPassword);
    await auth.logout();
    await page.unroute('**/auth/login-or-register');
    if (!accessToken) throw new Error('register response contained no access token');
    await mockFacebookSignIn(page, session({ email, created: false, accessToken }));

    await page.goto('/');
    await clickVisible(desktopLoginButton(page));
    await clickVisible(
      page.getByTestId(tid.auth.facebookButtonHost).getByRole('button', { name: /facebook/i }),
    );
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('guest cart: Facebook creates an account for a new shopper', async ({ page }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await stubFacebookLogin(page, 'facebook-cart-new-access-token');
    await mockFacebookSignIn(page, session({ email: uniqueEmail('facebook-cart-new'), created: true }));
    await openGuestCart(page);
    await facebookFromGuestCart(page);
  });

  test('guest cart: Facebook connects an existing shopper without an email/password detour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await stubFacebookLogin(page, 'facebook-cart-existing-access-token');
    await mockFacebookSignIn(page, session({ email: uniqueEmail('facebook-cart-existing'), created: false }));
    await openGuestCart(page);
    await facebookFromGuestCart(page);
  });

  test('Facebook link: waits for security unlock then associates', async ({ page }) => {
    const email = uniqueEmail('facebook-link');
    const { signInMethods, profile } = await prepareFacebookSignInMethods(page, email);
    await page.route('**/account/link-facebook', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasFacebook: true, facebookEmail: email },
        }),
      });
    });
    await clickVisible(page.getByTestId(tid.account.facebookLinkButton));
    await expect(signInMethods).toContainText(/associé/i);
  });

  test('Facebook unlink: waits for security unlock then dissociates', async ({ page }) => {
    const email = uniqueEmail('facebook-unlink');
    const { signInMethods, profile } = await prepareFacebookSignInMethods(page, email);
    await page.route('**/account/link-facebook', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasFacebook: true, facebookEmail: email },
        }),
      });
    });
    await clickVisible(page.getByTestId(tid.account.facebookLinkButton));
    await expect(signInMethods).toContainText(/associé/i);

    await clickVisible(signInMethods.getByRole('button', { name: /déverrouiller/i }));
    const unlockDialog = page.getByRole('dialog', { name: /déverrouiller/i });
    await fillVisible(unlockDialog.locator('input[name="current-password"]'), testPassword);
    await clickVisible(unlockDialog.getByRole('button').last());
    await expect(page.getByTestId(tid.account.facebookUnlink)).toBeVisible({ timeout: 15_000 });
    await page.route('**/account/unlink-facebook', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasFacebook: false, facebookEmail: null },
        }),
      });
    });
    await clickVisible(page.getByTestId(tid.account.facebookUnlink));
    await expect(page.getByTestId(tid.account.facebookUnlink)).toBeHidden({ timeout: 15_000 });
  });
});
