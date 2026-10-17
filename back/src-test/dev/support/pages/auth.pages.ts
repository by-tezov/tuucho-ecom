import type { Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { testPassword } from '../env.js';
import { extractOtpFromMail, extractTokenFromMail, waitForMail } from '../mail.js';
import {
  checkVisible,
  clickMobileNavControl,
  clickVisible,
  desktopLoginButton,
  dismissOnboardingIfPresent,
  fillVisible,
  openMobileNav,
  reveal,
  startCustomerJourneyAtRoot,
  typeOtpVisible,
} from '../interact.js';
import { isShopPath, shopPath, shopPathWithSearch } from '../shopPath.js';

export class AuthPages {
  constructor(private readonly page: Page) {}

  /** The current connect screen is Google-first. Email/password is an
   * intentional secondary path, exposed by this control on both modal and
   * standalone surfaces. */
  async useEmailInstead(): Promise<void> {
    await dismissOnboardingIfPresent(this.page);
    const loginForm = this.page.getByTestId(tid.auth.loginForm);
    if (!(await loginForm.isVisible().catch(() => false))) {
      const emailInstead = this.page.getByTestId(tid.auth.useEmailInstead);
      try {
        await clickVisible(emailInstead);
      } catch (error) {
        const busy = this.page.getByText(/momentanément surchargé|service is temporarily busy/i);
        if (await busy.isVisible().catch(() => false)) {
          throw new Error(
            'auth UI shows the rate-limit busy message. Deploy /operation/relax-rate-limits and re-run the preprod suite so HTTP auth limiters are skipped for the run.',
          );
        }
        throw error;
      }
    }
    await expect(loginForm).toBeVisible({ timeout: 15_000 });
  }

  /** Create-or-connect password flow: a new address moves to the dedicated
   * CGU step only after its first submission. */
  async submitPasswordCreate(email: string, password = testPassword): Promise<void> {
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    const consent = this.page.getByTestId(tid.auth.consent);
    await expect(consent).toBeVisible({ timeout: 15_000 });
    await checkVisible(consent);
    await clickVisible(this.page.getByTestId(tid.auth.consentSubmit));
  }

  /** Mobile has no header login button: Commandes is the real public entry. */
  async openMobileLoginFromOrders(): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    const ordersTab = this.page.getByTestId(tid.tabBar.orders);
    const mobileLogin = this.page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: /se connecter/i });
    const openLoginAndVerify = async (button: import('patchright/test').Locator): Promise<void> => {
      await clickVisible(button);
      await this.useEmailInstead();
    };
    // The confirmed-order screen replaces the Commandes tab with the
    // anonymous mobile navigation's direct login button. This happens after
    // a guest payment and is the real public entry point on that screen.
    if (await mobileLogin.isVisible().catch(() => false)) {
      await openLoginAndVerify(mobileLogin);
      return;
    }
    // Intro/account pages can hide the bottom bar. Use the burger's visible
    // login item there; never type the /login route as a shortcut.
    if (!(await ordersTab.isVisible().catch(() => false))) {
      const panel = await openMobileNav(this.page);
      const loginItem = panel.locator(
        `[data-testid="${tid.mobileNav.item}"][data-nav-key="login"]`,
      );
      if (await loginItem.isVisible().catch(() => false)) {
        await openLoginAndVerify(loginItem);
        return;
      }
      throw new Error('The mobile customer navigation exposes neither Commandes nor Se connecter.');
    }
    await clickVisible(ordersTab);
    if (await mobileLogin.isVisible().catch(() => false)) {
      await openLoginAndVerify(mobileLogin);
    } else {
      await this.useEmailInstead();
    }
  }

  /** Bottom-bar Commandes (not “Se connecter”) is the authenticated mobile proof. */
  async expectMobileAuthenticated(): Promise<void> {
    await expect(
      this.page
        .getByRole('navigation', { name: 'Navigation principale' })
        .getByRole('button', { name: 'Commandes', exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  }

  /** Create an account from the mobile Commandes → unified-connect path. */
  async registerFromMobileOrders(email: string, password = testPassword): Promise<void> {
    await this.openMobileLoginFromOrders();
    await this.submitPasswordCreate(email, password);
    await expect(this.page.getByTestId(tid.auth.loginForm)).toBeHidden({ timeout: 15_000 });
    await this.expectMobileAuthenticated();
  }

  /** Login using the actual mobile Commandes tab rather than a direct route. */
  async loginFromMobileOrders(email: string, password = testPassword): Promise<void> {
    // A full-document confirmation-link navigation can preserve the server
    // session even though the login form was not rendered again. In that
    // valid state the mobile bottom bar exposes Commandes, not Se connecter.
    const authenticatedOrders = this.page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('button', { name: 'Commandes', exact: true });
    if (await authenticatedOrders.isVisible().catch(() => false)) return;
    await this.openMobileLoginFromOrders();
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    // Commandes opens the mobile login form in place; success does not
    // necessarily change the URL. Prove the form closed and the tab bar
    // swapped Se connecter for Commandes.
    await expect(this.page.getByTestId(tid.auth.loginForm)).toBeHidden({ timeout: 15_000 });
    await this.expectMobileAuthenticated();
  }

  /** Existing shopper: Commandes → passwordless email → mailbox OTP. */
  async loginWithOtpFromMobileOrders(email: string): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await this.openMobileLoginFromOrders();
    await clickVisible(this.page.getByTestId(tid.auth.passwordlessLink));
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    const otp = this.page.getByTestId(tid.auth.connectOtp);
    await expect(otp).toBeVisible({ timeout: 15_000 });
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
      subjectIncludes: 'code de connexion',
    });
    await typeOtpVisible(otp, extractOtpFromMail(mail));
    await clickVisible(this.page.getByTestId(tid.auth.otpSubmit));
    await expect(this.page.getByTestId(tid.auth.loginForm)).toBeHidden({ timeout: 15_000 });
  }

  /** Existing shopper: desktop header modal → passwordless email → mailbox OTP. */
  async loginWithOtpFromDesktopAccountModal(email: string): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await startCustomerJourneyAtRoot(this.page);
    await clickVisible(desktopLoginButton(this.page));
    await this.useEmailInstead();
    await clickVisible(this.page.getByTestId(tid.auth.passwordlessLink));
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    const otp = this.page.getByTestId(tid.auth.connectOtp);
    await expect(otp).toBeVisible({ timeout: 15_000 });
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
      subjectIncludes: 'code de connexion',
    });
    await typeOtpVisible(otp, extractOtpFromMail(mail));
    await clickVisible(this.page.getByTestId(tid.auth.otpSubmit));
    await expect(
      this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible();
  }

  /** Passwordless account-settings step-up: the section auto-mails a code. */
  async unlockSectionWithMailedOtp(unlockButton: Locator, email: string): Promise<void> {
    const sinceMs = Date.now() - 500;
    await clickVisible(unlockButton);
    const dialog = this.page.getByRole('dialog', { name: /déverrouiller/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('input')).toHaveCount(6, { timeout: 15_000 });
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
      subjectIncludes: 'code de connexion',
    });
    await typeOtpVisible(dialog, extractOtpFromMail(mail));
    // Backdrop dismiss uses the same accessible name as the confirm control.
    await clickVisible(dialog.getByRole('button').filter({ hasText: /^déverrouiller$/i }));
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  }

  /** Mobile registration plus the confirmation link delivered to the user. */
  async registerAndConfirmEmailFromMobileOrders(email: string, password = testPassword): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await this.registerFromMobileOrders(email, password);
    const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    const token = extractTokenFromMail(mail);
    // The dump represents the user's mailbox; following its confirmation
    // link is the public email-verification action.
    await this.page.goto(shopPathWithSearch(`/account/confirm-email?token=${encodeURIComponent(token)}`));
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toContainText(
      /confirmé|vérifi|déjà|succès|valid/i,
    );
    // The confirmation route is standalone. Return through the public
    // burger's Gallery item before opening the authenticated account menu.
    const panel = await openMobileNav(this.page);
    await clickVisible(
      panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="gallery"]`),
    );
    await expect(this.page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: 15_000 });
  }

  /** Reach the profile through the authenticated mobile burger menu. */
  async openMobileAccount(): Promise<void> {
    await dismissOnboardingIfPresent(this.page);
    const panel = await openMobileNav(this.page);
    const accountGroup = panel.getByRole('button', { name: /^mon compte$/i });
    if ((await accountGroup.getAttribute('aria-expanded')) !== 'true') {
      await clickMobileNavControl(accountGroup);
      await expect(accountGroup).toHaveAttribute('aria-expanded', 'true');
    }
    const profileLink = panel
      .getByRole('link', { name: /^mon profil$/i })
      .or(panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="account-profile"]`))
      .first();
    await reveal(profileLink);
    // Accordion height animates 0fr → 1fr (250ms). Wait for the open clip
    // to finish so the Link has a real box.
    await this.page.waitForTimeout(300);
    await clickMobileNavControl(profileLink);
    await expect(this.page).toHaveURL(/\/account\/?$/, { timeout: 15_000 });
    await expect(this.page.getByTestId(tid.account.profileForm)).toBeVisible({ timeout: 15_000 });
  }

  async gotoRegister(): Promise<void> {
    await this.page.goto(shopPath('/register'));
    await this.useEmailInstead();
  }

  async gotoLogin(): Promise<void> {
    await this.page.goto(shopPath('/login'));
    await this.useEmailInstead();
  }

  /** Submit the unified email create flow. */
  async register(email: string, password = testPassword): Promise<void> {
    if ((this.page.viewportSize()?.width ?? 1_280) < 768) {
      await this.registerFromMobileOrders(email, password);
      return;
    }
    await this.openDesktopRegisterModal();
    await this.submitPasswordCreate(email, password);
  }

  /**
   * Desktop account entry starts Google-first. This helper intentionally
   * takes the visible email alternative before creating the account.
   */
  async registerFromDesktopAccountModal(email: string, password = testPassword): Promise<void> {
    await this.openDesktopRegisterModal();
    await this.submitPasswordCreate(email, password);
    // Successful modal registration authenticates immediately; the global
    // anonymous-only modal unmounts and the header becomes "Mon compte".
    await expect(
      this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible();
  }

  /** Open the desktop unified connect modal's email alternative. */
  async openDesktopRegisterModal(): Promise<void> {
    await startCustomerJourneyAtRoot(this.page);
    await clickVisible(desktopLoginButton(this.page));
    await this.useEmailInstead();
  }

  /** Submit desktop registration then confirm from the email dump. */
  async registerAndConfirmEmailFromDesktopAccountModal(
    email: string,
    password = testPassword,
  ): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await this.registerFromDesktopAccountModal(email, password);
    const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    const token = extractTokenFromMail(mail);
    await this.page.goto(shopPathWithSearch(`/account/confirm-email?token=${encodeURIComponent(token)}`));
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toContainText(
      /confirmé|vérifi|déjà|succès|valid/i,
    );
  }

  /** Login through the desktop header modal, never the dedicated mobile route. */
  async loginFromDesktopAccountModal(email: string, password = testPassword): Promise<void> {
    await startCustomerJourneyAtRoot(this.page);
    await clickVisible(desktopLoginButton(this.page));
    await this.useEmailInstead();
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    await expect(
      this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    ).toBeVisible();
  }

  /** Follow the authenticated desktop header control into the account area. */
  async openDesktopAccount(): Promise<void> {
    await clickVisible(
      this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }),
    );
    await expect(this.page.getByTestId(tid.account.profileForm)).toBeVisible();
  }

  /** Fill the auth modal (opened from guest checkout / promptAuth). */
  async fillAuthModal(mode: 'login' | 'register', email: string, password = testPassword): Promise<void> {
    await this.useEmailInstead();
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    if (mode === 'register') {
      await checkVisible(this.page.getByTestId(tid.auth.consent));
      await clickVisible(this.page.getByTestId(tid.auth.consentSubmit));
    }
  }

  /**
   * The cart's primary account action is passwordless. New email addresses
   * create an account after OTP validation; registered addresses connect with
   * a login OTP while keeping the same neutral checkout flow.
   */
  async registerFromGuestPrompt(email: string): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await fillVisible(this.page.getByTestId(tid.guest.email), email);
    // The initial checkout card is deliberately email-only. Its account link
    // exposes both password login and the passwordless create-or-connect
    // route; opt into the latter exactly as a guest would.
    await clickVisible(this.page.getByTestId(tid.guest.login));
    await expect(this.page.getByTestId(tid.guest.password)).toBeVisible();
    await clickVisible(this.page.getByTestId(tid.guest.forgot));
    await expect(this.page.getByTestId(tid.guest.password)).toBeHidden();
    await clickVisible(this.page.getByTestId(tid.guest.loginSubmit));
    const otpInput = this.page.getByTestId(tid.guest.otp);
    const accountConsent = this.page.getByTestId('guest-checkout-account-gdpr');
    await Promise.race([
      otpInput.waitFor({ state: 'visible', timeout: 15_000 }),
      accountConsent.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
    if (await accountConsent.isVisible().catch(() => false)) {
      await checkVisible(accountConsent);
      await clickVisible(this.page.getByTestId('guest-checkout-account-consent-submit'));
    }
    await expect(otpInput).toBeVisible({ timeout: 15_000 });
    const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
    await typeOtpVisible(otpInput, extractOtpFromMail(mail));
    // This card shares a sticky desktop aside with the order summary. Use a
    // force click rather than page JavaScript so the interaction stays within
    // Patchright's native execution model.
    await clickVisible(this.page.getByTestId(tid.guest.otpSubmit));
    // The welcome state is intentionally visible briefly before the prompt
    // leaves; the cart itself remains mounted for guest-state reconciliation.
    await expect(this.page.getByTestId(tid.guest.email)).toBeHidden({ timeout: 15_000 });
  }

  /**
   * From cart guest prompt: login. Caller handles merge dialog if shown.
   */
  async loginFromGuestPrompt(email: string, password = testPassword): Promise<void> {
    await fillVisible(this.page.getByTestId(tid.guest.email), email);
    await clickVisible(this.page.getByTestId(tid.guest.login));
    await fillVisible(this.page.getByTestId(tid.guest.password), password);
    await clickVisible(this.page.getByTestId(tid.guest.loginSubmit));
    await expect(this.page.getByTestId(tid.loginMerge.dialog)).toBeVisible({ timeout: 15_000 });
  }

  /** Register, open confirmation link from the email dump, assert verified. */
  async registerAndConfirmEmail(email: string, password = testPassword): Promise<void> {
    const sinceMs = Date.now() - 1_000;
    await this.register(email, password);
    const mail = await waitForMail({
      kind: 'user',
      toIncludes: email,
      sinceMs,
      timeoutMs: 15_000,
    });
    const token = extractTokenFromMail(mail);
    await this.page.goto(shopPathWithSearch(`/account/confirm-email?token=${encodeURIComponent(token)}`));
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toBeVisible({
      timeout: 15_000,
    });
    await expect(this.page.getByTestId(tid.auth.confirmEmailStatus)).toContainText(
      /confirmé|vérifi|déjà|succès|valid/i,
    );
  }

  /** Log out from account shell (confirm dialog). The desktop sidebar's own
   * logout link (account-logout) is CSS-hidden below AccountShell's
   * breakpoint — on mobile, logout instead lives in the burger's "Mon
   * compte" group (MobileNav.tsx). Checked by what's actually visible
   * rather than viewport width, so this works regardless of the caller's
   * exact test viewport. */
  async logout(): Promise<void> {
    const profileForm = this.page.getByTestId(tid.account.profileForm);
    if ((await profileForm.count()) === 0) {
      const desktopAccount = this.page
        .getByRole('banner')
        .getByRole('button', { name: 'Mon compte', exact: true });
      if (await desktopAccount.isVisible().catch(() => false)) {
        await clickVisible(desktopAccount);
      } else {
        await this.openMobileAccount();
      }
    }
    await reveal(profileForm);
    const desktopLogout = this.page.getByTestId(tid.account.logout);
    if (await desktopLogout.isVisible().catch(() => false)) {
      await clickVisible(desktopLogout);
    } else {
      const panel = await openMobileNav(this.page);
      await clickVisible(
        panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="account-logout"]`),
      );
    }
    // The menu callback navigates synchronously, so arm the wait first.
    await Promise.all([
      this.page.waitForURL(
        (url) =>
          url.pathname === '/' ||
          url.pathname === '/fr' ||
          isShopPath(url.pathname, '/home') ||
          isShopPath(url.pathname, '/gallery') ||
          url.pathname === '/home' ||
          url.pathname === '/gallery',
      ),
      clickVisible(this.page.getByTestId(tid.confirm.confirm)),
    ]);
  }

  /** Submit login and wait until we leave the login route. */
  async login(email: string, password = testPassword): Promise<void> {
    await this.gotoLogin();
    await fillVisible(this.page.getByTestId(tid.auth.email), email);
    await fillVisible(this.page.getByTestId(tid.auth.password), password);
    await clickVisible(this.page.getByTestId(tid.auth.submit));
    await this.page.waitForURL((url) => !url.pathname.includes('/login'));
  }

  passwordRule(id: 'minLength' | 'uppercase' | 'lowercase' | 'digit' | 'special') {
    return this.page.getByTestId(tid.auth.passwordRule(id));
  }
}
