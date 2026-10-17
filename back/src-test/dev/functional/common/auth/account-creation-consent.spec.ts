import { expect, type Page, type Route } from 'patchright/test';
import { test } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import {
  checkVisible,
  clickVisible,
  desktopLoginButton,
  dismissOnboardingIfPresent,
  fillVisible,
  startCustomerJourneyAtRoot,
  typeOtpVisible,
} from '../../../support/interact.js';
import { shopPath } from '../../../support/shopPath.js';
import { tid } from '../../../support/selectors.js';

type Surface = 'web' | 'mobile';
type RequestBody = Record<string, unknown>;

function authSession(email: string, provider?: 'google' | 'apple') {
  return {
    success: true,
    created: true,
    user: {
      id: `account-creation-${provider ?? 'password'}-${email}`,
      email,
      emailVerified: true,
      pendingEmail: null,
      firstName: null,
      lastName: null,
      phone: null,
      status: 'active',
      role: 'user',
      deletionScheduledFor: null,
      hasPassword: provider === undefined,
      hasGoogle: provider === 'google',
      googleEmail: provider === 'google' ? email : null,
      hasApple: provider === 'apple',
      appleEmail: provider === 'apple' ? email : null,
      hasFacebook: false,
      facebookEmail: null,
    },
    accessToken: `functional-${provider ?? 'password'}-token`,
    accessTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  };
}

function requestBody(route: Route): RequestBody {
  return JSON.parse(route.request().postData() ?? '{}') as RequestBody;
}

/** A mocked access token is not a real session. The shop then loads carts,
 * favorites and preferences, those 401, and a failed refresh logs the visitor
 * out before the header can show Mon compte. Answer refresh with the mocked
 * session once it exists. The cold-boot refresh before that stays unauthorized. */
async function holdMockedSession(page: Page): Promise<{
  adopt: (session: ReturnType<typeof authSession>) => void;
}> {
  let current: ReturnType<typeof authSession> | null = null;
  await page.route('**/auth/refresh', async (route) => {
    if (!current) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: { code: 'unauthorized' } }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        user: current.user,
        accessToken: current.accessToken,
        accessTokenExpiresAt: current.accessTokenExpiresAt,
      }),
    });
  });
  return {
    adopt(session) {
      current = session;
    },
  };
}

async function mockSignInMethods(
  page: Page,
  enabled: Partial<{ google: boolean; apple: boolean }> = {},
): Promise<void> {
  await page.route('**/auth/sign-in-methods', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        signInMethods: {
          google: enabled.google ?? false,
          apple: enabled.apple ?? false,
          facebook: false,
          // The behaviours below deliberately cover the non-verbose Google
          // path and the verbose Apple account-choice path.
          googleVerbose: false,
          appleVerbose: true,
          facebookVerbose: false,
        },
      }),
    });
  });
}

async function openConnect(page: Page, surface: Surface): Promise<void> {
  await page.setViewportSize(surface === 'mobile' ? { width: 390, height: 633 } : { width: 1280, height: 900 });
  if (surface === 'mobile') {
    await startCustomerJourneyAtRoot(page);
    await page.goto(shopPath('/login'));
    await dismissOnboardingIfPresent(page);
    return;
  }
  await startCustomerJourneyAtRoot(page);
  await dismissOnboardingIfPresent(page);
  await clickVisible(desktopLoginButton(page));
}

async function openEmailConnect(page: Page, surface: Surface): Promise<void> {
  await openConnect(page, surface);
  const loginForm = page.getByTestId(tid.auth.loginForm);
  // These paths intentionally have no social provider enabled. Wait for the
  // capability request to settle rather than mistaking its loading shell for
  // the social-first form.
  await expect(loginForm).toBeVisible({ timeout: 15_000 });
}

async function expectAuthenticated(page: Page, surface: Surface): Promise<void> {
  if (surface === 'web') {
    await expect(
      page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    return;
  }
  await expect(page.getByTestId(tid.auth.loginForm)).toBeHidden({ timeout: 15_000 });
}

/** Read both legal documents before acceptance. The desktop modal survives a
 * browser-history return; the mobile legal page's own Retour control must do
 * the same. Neither visit may tick (or reset into ticking) the checkbox. */
async function readLegalAndReturn(page: Page, surface: Surface, consent: ReturnType<Page['getByTestId']>): Promise<void> {
  for (const [path, name] of [
    ['/terms', 'terms'],
    ['/privacy', 'privacy'],
  ] as const) {
    const legalLink = consent.locator(`xpath=ancestor::label[1]//a[contains(@href, '${path}')]`);
    await clickVisible(legalLink);
    await expect(page).toHaveURL(new RegExp(`${path}(?:$|[/?#])`));
    if (surface === 'mobile') {
      await clickVisible(page.getByTestId(tid.legal.back).first());
    } else {
      await page.goBack();
    }
    await expect(consent, `returning from ${name} keeps the pending consent step`).toBeVisible({ timeout: 15_000 });
    await expect(consent).not.toBeChecked();
  }
}

async function stubGoogleIdentity(page: Page): Promise<void> {
  await page.route('https://accounts.google.test/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><button type="button">Continuer avec Google</button><script>document.querySelector('button').addEventListener('click', () => parent.postMessage({ type: 'functional-google-credential' }, '*'))</script>`,
    });
  });
  await page.addInitScript(() => {
    let callback: ((response: { credential?: string }) => void) | undefined;
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'functional-google-credential') callback?.({ credential: 'functional-google-token' });
    });
    const google = {
      accounts: {
        id: {
          initialize(options: { callback?: (response: { credential?: string }) => void }) {
            callback = options.callback;
          },
          renderButton(host: HTMLElement) {
            const iframe = document.createElement('iframe');
            iframe.title = 'Google Sign-In';
            iframe.src = 'https://accounts.google.test/functional';
            host.replaceChildren(iframe);
          },
        },
      },
    };
    (window as unknown as { google: typeof google }).google = google;
  });
}

async function clickGoogle(page: Page): Promise<void> {
  await clickVisible(
    page
      .frameLocator('[data-testid="auth-google-button-host"] iframe[title="Google Sign-In"]')
      .getByRole('button'),
  );
}

async function stubAppleIdentity(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.AppleID = {
      auth: {
        init() {},
        async signIn() {
          return {
            authorization: { code: 'functional-apple-code', id_token: 'functional-apple-token' },
          };
        },
      },
    };
  });
}

async function passwordCreationConsent(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-consent-password`);
  const calls: RequestBody[] = [];
  const sessionHold = await holdMockedSession(page);
  await mockSignInMethods(page);
  await page.route('**/auth/login-or-register', async (route) => {
    calls.push(requestBody(route));
    const created = calls.length > 1;
    const session = created ? authSession(email) : null;
    if (session) sessionHold.adopt(session);
    await route.fulfill({
      status: created ? 200 : 400,
      contentType: 'application/json',
      body: JSON.stringify(created ? session : { success: false, error: { code: 'invalid_request' } }),
    });
  });

  await openEmailConnect(page, surface);
  await expect(page.getByTestId(tid.auth.consent)).toHaveCount(0);
  await fillVisible(page.getByTestId(tid.auth.email), email);
  await fillVisible(page.getByTestId(tid.auth.password), testPassword);
  await clickVisible(page.getByTestId(tid.auth.submit));

  const consent = page.getByTestId(tid.auth.consent);
  await expect(consent).toBeVisible({ timeout: 15_000 });
  expect(calls).toEqual([
    expect.objectContaining({ gdprConsent: { accepted: false } }),
  ]);
  await readLegalAndReturn(page, surface, consent);
  await checkVisible(consent);
  await clickVisible(page.getByTestId(tid.auth.consentSubmit));
  await expectAuthenticated(page, surface);
  expect(calls).toEqual([
    expect.objectContaining({ gdprConsent: { accepted: false } }),
    expect.objectContaining({ gdprConsent: { accepted: true } }),
  ]);
}

async function passwordlessCreationConsent(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-consent-otp`);
  const otpCalls: RequestBody[] = [];
  const sessionHold = await holdMockedSession(page);
  await mockSignInMethods(page);
  await page.route('**/auth/request-otp', async (route) => {
    otpCalls.push(requestBody(route));
    await route.fulfill({
      status: otpCalls.length === 1 ? 400 : 200,
      contentType: 'application/json',
      body: JSON.stringify(
        otpCalls.length === 1 ? { success: false, error: { code: 'invalid_request' } } : { success: true },
      ),
    });
  });
  await page.route('**/auth/verify-otp', async (route) => {
    const session = authSession(email);
    sessionHold.adopt(session);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) });
  });

  await openEmailConnect(page, surface);
  await expect(page.getByTestId(tid.auth.consent)).toHaveCount(0);
  await clickVisible(page.getByTestId(tid.auth.passwordlessLink));
  await fillVisible(page.getByTestId(tid.auth.email), email);
  await clickVisible(page.getByTestId(tid.auth.submit));
  const consent = page.getByTestId(tid.auth.consent);
  await expect(consent).toBeVisible({ timeout: 15_000 });
  expect(otpCalls).toEqual([expect.not.objectContaining({ gdprConsent: expect.anything() })]);
  await checkVisible(consent);
  await clickVisible(page.getByTestId(tid.auth.consentSubmit));
  const otp = page.getByTestId('auth-connect-otp');
  await expect(otp).toBeVisible({ timeout: 15_000 });
  await typeOtpVisible(otp, '123456');
  await clickVisible(page.getByTestId('auth-otp-submit'));
  await expectAuthenticated(page, surface);
  expect(otpCalls).toEqual([
    expect.not.objectContaining({ gdprConsent: expect.anything() }),
    expect.objectContaining({ gdprConsent: { accepted: true } }),
  ]);
}

async function googleCreationConsent(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-consent-google`);
  const googleCalls: RequestBody[] = [];
  const completionCalls: RequestBody[] = [];
  const sessionHold = await holdMockedSession(page);
  await stubGoogleIdentity(page);
  await mockSignInMethods(page, { google: true });
  await page.route('**/auth/google', async (route) => {
    googleCalls.push(requestBody(route));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, needsConsent: true, googleSignupToken: 'functional-google-pending' }),
    });
  });
  await page.route('**/auth/google/complete', async (route) => {
    completionCalls.push(requestBody(route));
    const session = authSession(email, 'google');
    sessionHold.adopt(session);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) });
  });

  await openConnect(page, surface);
  await expect(page.getByTestId(tid.auth.googleConsent)).toHaveCount(0);
  await clickGoogle(page);
  const consent = page.getByTestId(tid.auth.googleConsent);
  await expect(consent).toBeVisible({ timeout: 15_000 });
  expect(googleCalls).toEqual([expect.not.objectContaining({ gdprConsent: expect.anything() })]);
  await checkVisible(consent);
  await clickVisible(page.getByRole('button', { name: /^accepter$/i }));
  await expectAuthenticated(page, surface);
  expect(completionCalls).toEqual([
    expect.objectContaining({ gdprConsent: { accepted: true } }),
  ]);
}

async function appleCreationConsent(page: Page, surface: Surface): Promise<void> {
  const email = uniqueEmail(`${surface}-consent-apple`);
  const appleCalls: RequestBody[] = [];
  const createCalls: RequestBody[] = [];
  const sessionHold = await holdMockedSession(page);
  await stubAppleIdentity(page);
  await mockSignInMethods(page, { apple: true });
  await page.route('**/auth/apple', async (route) => {
    appleCalls.push(requestBody(route));
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        needsAccountChoice: true,
        socialPendingToken: 'functional-apple-pending',
        provider: 'apple',
        socialEmail: email,
      }),
    });
  });
  await page.route('**/auth/social/create', async (route) => {
    createCalls.push(requestBody(route));
    const session = authSession(email, 'apple');
    sessionHold.adopt(session);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(session) });
  });

  await openConnect(page, surface);
  await expect(page.getByRole('checkbox')).toHaveCount(1); // only “stay signed in”; no CGU yet
  await clickVisible(page.getByTestId('auth-apple-continue'));
  await expect(page.getByRole('button', { name: /créer un compte/i })).toBeVisible({ timeout: 15_000 });
  expect(appleCalls).toEqual([expect.not.objectContaining({ gdprConsent: expect.anything() })]);
  await clickVisible(page.getByRole('button', { name: /créer un compte/i }));
  const consent = page.getByRole('checkbox');
  await expect(consent).toBeVisible({ timeout: 15_000 });
  await checkVisible(consent);
  await clickVisible(page.getByRole('button', { name: /créer un compte/i }));
  await expectAuthenticated(page, surface);
  expect(createCalls).toEqual([
    expect.objectContaining({ gdprConsent: { accepted: true } }),
  ]);
}

test.describe('Account creation consent timing', () => {
  test('web password creation: requests acceptance only after a new account is detected, and restores after legal reading', async ({
    page,
  }) => {
    await passwordCreationConsent(page, 'web');
  });
  test('mobile password creation: requests acceptance only after a new account is detected, and restores after legal reading', async ({
    page,
  }) => {
    await passwordCreationConsent(page, 'mobile');
  });

  test('web passwordless creation: requests acceptance only after a new account is detected', async ({ page }) => {
    await passwordlessCreationConsent(page, 'web');
  });
  test('mobile passwordless creation: requests acceptance only after a new account is detected', async ({ page }) => {
    await passwordlessCreationConsent(page, 'mobile');
  });

  test('web non-verbose Google creation: defers acceptance until the identity is new', async ({ page }) => {
    await googleCreationConsent(page, 'web');
  });
  test('mobile non-verbose Google creation: defers acceptance until the identity is new', async ({ page }) => {
    await googleCreationConsent(page, 'mobile');
  });

  test('web verbose Apple creation: asks for account choice before acceptance', async ({ page }) => {
    await appleCreationConsent(page, 'web');
  });
  test('mobile verbose Apple creation: asks for account choice before acceptance', async ({ page }) => {
    await appleCreationConsent(page, 'mobile');
  });
});
