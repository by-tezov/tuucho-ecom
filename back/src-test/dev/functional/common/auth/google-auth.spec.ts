// Google Identity Services is an external browser integration. These tests
// replace only its iframe/button with a deterministic credential callback and
// assert Lumen's browser-side request/response handling. API token
// verification remains an API/infrastructure concern: it cannot be exercised
// with a fabricated Google ID token.
import { expect, type Page } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { apiJson, uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { tid } from '../../../support/selectors.js';
import { shopPath } from '../../../support/shopPath.js';
import {
  checkVisible,
  clickVisible,
  desktopLoginButton,
  dismissOnboardingIfPresent,
  fillVisible,
  reveal,
  startCustomerJourneyAtRoot,
} from '../../../support/interact.js';

interface GoogleSessionOptions {
  email: string;
  created: boolean;
  hasGoogle?: boolean;
  accessToken?: string;
}

function session({
  email,
  created,
  hasGoogle = true,
  accessToken = 'google-browser-test-token',
}: GoogleSessionOptions) {
  return {
    success: true,
    user: {
      id: `google-test-${email}`,
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
      hasGoogle,
      googleEmail: hasGoogle ? email : null,
    },
    accessToken,
    accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
    ...(created ? { created: true } : {}),
  };
}

/** Install a local GIS-shaped cross-origin iframe before application modules
 * run. The production iframe cannot be driven with an interactive Google
 * account in E2E, but its overlay geometry and user-click path are essential
 * here: a same-document button would hide regressions in that boundary. */
async function stubGoogleIdentity(page: Page, idToken: string): Promise<void> {
  await page.route('https://accounts.google.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><button type="button" aria-label="Continuer avec Google">Continuer avec Google</button><script>document.querySelector('button').addEventListener('click', () => parent.postMessage({ type: 'gis-stub-credential' }, '*'))</script>`,
    });
  });
  await page.addInitScript((credential: string) => {
    type CredentialCallback = (response: { credential?: string }) => void;
    let callback: CredentialCallback | undefined;
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'gis-stub-credential') callback?.({ credential });
    });
    const google = {
      accounts: {
        id: {
          initialize(options: { callback?: CredentialCallback }) {
            callback = options.callback;
          },
          renderButton(host: HTMLElement) {
            const iframe = document.createElement('iframe');
            iframe.title = 'Google Sign-In';
            iframe.src = 'https://accounts.google.test/gis-stub';
            host.replaceChildren(iframe);
          },
        },
      },
    };
    (window as unknown as { google: typeof google }).google = google;
  }, idToken);
}

/** Proves the actual GIS iframe covers the styled host before clicking inside
 * it. The former zero-sized hidden host and parent-querySelector click both
 * fail this contract. */
async function clickGoogleIframe(page: Page, hostTestId: string): Promise<void> {
  const host = page.getByTestId(hostTestId);
  // Scroll the host, not the button inside the iframe. On a long account
  // page the iframe document and the page scroll fight, so
  // scrollIntoViewIfNeeded on the inner button never goes stable.
  await reveal(host);
  const iframe = host.locator('iframe[title="Google Sign-In"]');
  await expect(iframe).toBeVisible({ timeout: 15_000 });
  const button = page
    .frameLocator(`[data-testid="${hostTestId}"] iframe[title="Google Sign-In"]`)
    .getByRole('button');
  const [hostBox, iframeBox, buttonBox] = await Promise.all([
    host.boundingBox(),
    iframe.boundingBox(),
    button.boundingBox(),
  ]);
  expect(hostBox).not.toBeNull();
  expect(iframeBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(iframeBox!.width).toBeGreaterThanOrEqual(hostBox!.width - 1);
  expect(iframeBox!.height).toBeGreaterThanOrEqual(hostBox!.height - 1);
  expect(iframeBox!.width).toBeLessThanOrEqual(hostBox!.width + 4);
  expect(iframeBox!.height).toBeLessThanOrEqual(hostBox!.height + 4);
  await page.mouse.click(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2);
}

function testGoogleIdToken(email: string): string {
  const payload = Buffer.from(JSON.stringify({ sub: `google-sub-${email}`, email }), 'utf8').toString('base64url');
  return `pam-test-google.${payload}`;
}

/** Register with a password, then sign in with the matching Google identity for real.
 * The isolated API accepts `pam-test-google.` tokens and cancels that password. */
async function signInPasswordAccountWithGoogle(page: Page, email: string): Promise<void> {
  await stubGoogleIdentity(page, testGoogleIdToken(email));
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(email, testPassword);
  await auth.logout();
  await startCustomerJourneyAtRoot(page);
  await dismissOnboardingIfPresent(page);
  await clickVisible(desktopLoginButton(page));
  await clickGoogleIframe(page, tid.auth.googleButtonHost);
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

async function mockGoogleSignIn(page: Page, result: ReturnType<typeof session>): Promise<void> {
  await page.route('**/auth/google', async (route) => {
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
}

async function openGuestCart(page: Page): Promise<void> {
  await page.goto(shopPath('/gallery'));
  await new GalleryPages(page).addSeededProduct(E2E_PRODUCT_UIDS.A2, { shapeKey: 'carré', size: 'S' });
  await new CartPages(page).goto();
  await expect(page.getByTestId(tid.guest.email)).toBeVisible({ timeout: 15_000 });
}

async function googleFromGuestCart(page: Page): Promise<void> {
  await checkVisible(page.getByTestId(tid.guest.consent));
  await clickGoogleIframe(page, tid.auth.googleButtonHost);
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

async function prepareGoogleSignInMethods(page: Page, email: string) {
  await stubGoogleIdentity(page, `google-link-${email}`);
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(email, testPassword);
  const profile = await rememberProfileUser(page);
  await auth.openDesktopAccount();
  const signInMethods = page.getByTestId(tid.account.signInMethods);
  await clickVisible(signInMethods.getByRole('button', { name: /déverrouiller/i }));
  const unlockDialog = page.getByRole('dialog', { name: /déverrouiller/i });
  await fillVisible(unlockDialog.locator('input[name="current-password"]'), testPassword);
  await clickVisible(unlockDialog.getByRole('button').last());
  await expect(page.getByTestId(tid.account.googleLinkButton)).toBeVisible({ timeout: 15_000 });
  return { signInMethods, profile };
}

test.describe('Google account journeys (GIS browser contract)', () => {
  test('new Google identity: accepts consent and creates the account', async ({ page }) => {
    const email = uniqueEmail('google-new');
    await stubGoogleIdentity(page, 'google-new-id-token');
    await page.route('**/auth/google', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, needsConsent: true, googleSignupToken: 'google-signup-token' }),
      });
    });
    await page.route('**/auth/google/complete', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(session({ email, created: true })),
      });
    });

    await startCustomerJourneyAtRoot(page);
    await dismissOnboardingIfPresent(page);
    await clickVisible(desktopLoginButton(page));
    await clickGoogleIframe(page, tid.auth.googleButtonHost);
    await expect(page.getByTestId(tid.auth.googleConsent)).toBeVisible({ timeout: 15_000 });
    await checkVisible(page.getByTestId(tid.auth.googleConsent));
    await clickVisible(page.getByRole('button', { name: /^accepter$/i }));
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test('a password-created account: can sign in through its matching Google identity', async ({ page }) => {
    const email = uniqueEmail('google-password-existing');
    await signInPasswordAccountWithGoogle(page, email);
    const auth = new AuthPages(page);
    await auth.openDesktopAccount();
    const passwordTitle = page.getByRole('heading', { name: /créer un mot de passe/i });
    await expect(passwordTitle).toBeVisible();
    await expect(passwordTitle.locator('xpath=..')).toContainText('Non défini');
  });

  test('Google link drops the password: the connect modal explains it, OTP still enters, and the profile sets a new one', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('google-password-dropped');
    await signInPasswordAccountWithGoogle(page, email);

    const { body: cancelled } = await apiJson<{ error?: { code?: string; reason?: string } }>(
      request,
      'POST',
      '/auth/login',
      { data: { email, password: testPassword, rememberMe: false }, expectedStatus: 401 },
    );
    expect(cancelled.error).toEqual({ code: 'password_cancelled', reason: 'social_link' });

    const auth = new AuthPages(page);
    await auth.logout();
    await startCustomerJourneyAtRoot(page);
    await clickVisible(desktopLoginButton(page));
    await auth.useEmailInstead();
    await fillVisible(page.getByTestId(tid.auth.email), email);
    await fillVisible(page.getByTestId(tid.auth.password), testPassword);
    await clickVisible(page.getByTestId(tid.auth.submit));
    const connectModal = page.getByRole('dialog', { name: 'Se connecter ou créer un compte' });
    await expect(connectModal.getByRole('alert')).toContainText(/associé à Google, Facebook ou Apple/);
    await expect(connectModal.getByRole('alert')).toContainText(/code OTP/);
    await expect(connectModal.getByRole('alert')).toContainText(/nouveau mot de passe dans ton profil/);

    await auth.loginWithOtpFromDesktopAccountModal(email);
    await auth.openDesktopAccount();
    const unlock = page
      .getByRole('heading', { name: /créer un mot de passe/i })
      .locator(
        'xpath=ancestor::*[count(.//h2)=1 and .//button[contains(., "Déverrouiller")]][1]',
      )
      .getByRole('button', { name: /déverrouiller/i });
    await auth.unlockSectionWithMailedOtp(unlock, email);
    const nextPassword = 'E2eTest2!';
    await fillVisible(page.locator('#change-password-new'), nextPassword);
    await fillVisible(page.locator('input[name="new-password-confirm"]'), nextPassword);
    await clickVisible(page.getByRole('button', { name: 'Changer le mot de passe' }));
    await expect(page.getByText('Mot de passe mis à jour.')).toBeVisible({ timeout: 15_000 });

    await auth.logout();
    await auth.loginFromDesktopAccountModal(email, nextPassword);
    await auth.openDesktopAccount();
    await expect(page.getByRole('heading', { name: /changer de mot de passe/i })).toBeVisible();
  });

  test('guest cart: Google creates an account for a new shopper', async ({ page }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await stubGoogleIdentity(page, 'google-cart-new-id-token');
    await mockGoogleSignIn(page, session({ email: uniqueEmail('google-cart-new'), created: true }));
    await openGuestCart(page);
    await googleFromGuestCart(page);
  });

  test('guest cart: Google connects an existing shopper without an email/password detour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1_280, height: 900 });
    await stubGoogleIdentity(page, 'google-cart-existing-id-token');
    await mockGoogleSignIn(page, session({ email: uniqueEmail('google-cart-existing'), created: false }));
    await openGuestCart(page);
    await googleFromGuestCart(page);
  });

  test('Google link: waits for security unlock then associates', async ({ page }) => {
    const email = uniqueEmail('google-link');
    const { signInMethods, profile } = await prepareGoogleSignInMethods(page, email);
    await page.route('**/account/link-google', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasGoogle: true, googleEmail: email },
        }),
      });
    });
    await clickGoogleIframe(page, tid.account.googleLinkButton);
    await expect(signInMethods).toContainText(/associé/i);
  });

  test('Google unlink: waits for security unlock then dissociates', async ({ page }) => {
    const email = uniqueEmail('google-unlink');
    const { signInMethods, profile } = await prepareGoogleSignInMethods(page, email);
    await page.route('**/account/link-google', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasGoogle: true, googleEmail: email },
        }),
      });
    });
    await clickGoogleIframe(page, tid.account.googleLinkButton);
    await expect(signInMethods).toContainText(/associé/i);

    await clickVisible(signInMethods.getByRole('button', { name: /déverrouiller/i }));
    const unlockDialog = page.getByRole('dialog', { name: /déverrouiller/i });
    await fillVisible(unlockDialog.locator('input[name="current-password"]'), testPassword);
    await clickVisible(unlockDialog.getByRole('button').last());
    await expect(page.getByTestId(tid.account.googleUnlink)).toBeVisible({ timeout: 15_000 });
    await page.route('**/account/unlink-google', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          user: { ...profile.snapshot(), hasGoogle: false, googleEmail: null },
        }),
      });
    });
    await clickVisible(page.getByTestId(tid.account.googleUnlink));
    await expect(page.getByTestId(tid.account.googleUnlink)).toBeHidden({ timeout: 15_000 });
  });
});
