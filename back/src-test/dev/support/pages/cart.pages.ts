import type { Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { testCardCvc, testCardExpiry, testCardNumber } from '../env.js';
import {
  checkVisible,
  clickMobileNavControl,
  clickVisible,
  fillVisible,
  openMobileNav,
  reveal,
  startCustomerJourneyAtRoot,
  stripeAuthorizeControl,
} from '../interact.js';
import { actionDeadline, MAX_ACTION_TIMEOUT_MS } from '../timeouts.js';
import { ensureOsFocused, withTestWindowFocus } from '../windowFocus.js';
import { AddressPages } from './address.pages.js';
import { AccountPages } from './account.pages.js';

export class CartPages {
  constructor(private readonly page: Page) {}

  #isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) < 768;
  }

  async goto(): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    if (
      await this.page
        .getByTestId(tid.cart.page)
        .isVisible()
        .catch(() => false)
    )
      return;
    const drawerCheckout = this.page.getByTestId(tid.cart.drawerCheckout);
    if (await drawerCheckout.isVisible().catch(() => false)) {
      try {
        await clickVisible(drawerCheckout);
        await reveal(this.page.getByTestId(tid.cart.page));
        return;
      } catch {
        // The drawer may still be sliding closed after Continuer. Fall
        // through to the header or tab cart control.
      }
    }
    if (this.#isMobile()) {
      const cartTab = this.page.getByTestId(tid.tabBar.cart);
      if (await cartTab.isVisible().catch(() => false)) {
        await clickVisible(cartTab);
      } else {
        const panel = await openMobileNav(this.page);
        await clickMobileNavControl(
          panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="cart"]`),
        );
      }
    } else {
      // CartControl appends ", N article(s)" to the aria-label when the cart
      // has items; gift follow mode stays plain "Ton cadeau".
      await clickVisible(
        this.page.getByRole('banner').getByRole('button', { name: /^(Panier|Ton cadeau)(,|$)/ }),
      );
    }
    await reveal(this.page.getByTestId(tid.cart.page));
  }

  async applyVoucher(code: string): Promise<void> {
    await fillVisible(this.page.getByTestId(tid.cart.voucherInput), code);
    await clickVisible(this.page.getByTestId(tid.cart.voucherApply));
  }

  /** Add a paid cart-carousel accessory and prove the selected pack became a
   * normal customer line (not the separate cart-rule gift line). */
  async addAccessoryFromCarousel(
    productUid: string,
    opts: { packLabel?: string; title?: string } = {},
  ): Promise<Locator> {
    const card = this.page.locator(
      `[data-testid="${tid.cart.accessoryCard}"][data-product-uid="${productUid}"]`,
    );
    await reveal(card);
    const packLabel = opts.packLabel ?? 'x5';
    const pack = card.getByRole('button', { name: packLabel, exact: true });
    const hasPackChoice = await pack.isVisible().catch(() => false);
    if (hasPackChoice) await clickVisible(pack);
    await clickVisible(card.getByRole('button', { name: /ajouter au panier/i }));

    const line = this.page.locator(
      `[data-testid="${tid.cart.accessoryLine}"][data-product-uid="${productUid}"][data-origin="user"]`,
    );
    await expect(line).toBeVisible({ timeout: 15_000 });
    if (opts.title) await expect(line).toContainText(opts.title);
    if (hasPackChoice) await expect(line).toContainText(packLabel);
    return line;
  }

  async selectCourierByCode(code: string): Promise<void> {
    const courierSection = this.page.locator('section[aria-labelledby="cart-courier-heading"]');
    // Couriers load after the cart shell; wait for any option before deciding
    // whether the target is primary or behind "+ autres".
    await expect(courierSection.getByTestId(tid.cart.courierOption).first()).toBeVisible({
      timeout: 15_000,
    });
    const option = this.page.locator(
      `[data-testid="${tid.cart.courierOption}"][data-courier-code="${code}"]`,
    );
    if (!(await option.isVisible().catch(() => false))) {
      const more = courierSection.getByRole('button', { name: /\+ autres/i });
      await expect(more).toBeVisible({ timeout: 15_000 });
      await clickVisible(more);
      const dialog = this.page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      // Overflow entries are labeled with the courier display name (no code).
      const overflowLabel =
        code === 'colissimo-home'
          ? /Colissimo/i
          : code === 'mondial-relay-point'
            ? /Mondial Relay/i
            : code === 'mondial-relay-home'
              ? /Mondial Relay/i
              : code === 'chronopost-home'
                ? /Chronopost/i
                : new RegExp(code.replace(/[-_]/g, '[-_ ]?'), 'i');
      await clickVisible(dialog.getByRole('button', { name: overflowLabel }).first());
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    }
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option).toBeEnabled();
    await reveal(option);
    if (!(await option.isChecked())) await option.check();
    await expect(option).toBeChecked();
  }

  async selectFirstHomeCourier(): Promise<void> {
    const home = this.page.locator(
      `[data-testid="${tid.cart.courierOption}"][data-courier-code="mondial-relay-home"]`,
    );
    await expect(home).toBeVisible({ timeout: 15_000 });
    await expect(home).toBeEnabled();
    await reveal(home);
    if (!(await home.isChecked())) await home.check();
    await expect(home).toBeChecked();
  }

  async selectFirstAddress(): Promise<void> {
    const options = this.page.getByTestId(tid.cart.addressOption);
    const hasSelectedOrEnabledAddress = async (): Promise<boolean> => {
      const count = await options.count();
      for (let index = 0; index < count; index += 1) {
        const option = options.nth(index);
        if (await option.isChecked()) {
          await expect(option).toBeChecked();
          return true;
        }
        if (await option.isEnabled()) {
          await reveal(option);
          await option.check();
          await expect(option).toBeChecked();
          return true;
        }
      }
      return false;
    };

    if (await hasSelectedOrEnabledAddress()) return;

    // Courier imports can change the concrete code used for home delivery.
    // If a stale preference selected a courier that cannot serve this French
    // home address, try the available courier choices until the UI exposes a
    // compatible address. The successful address selection remains asserted.
    const couriers = this.page.getByTestId(tid.cart.courierOption);
    for (let index = 0; index < (await couriers.count()); index += 1) {
      const courier = couriers.nth(index);
      if (!(await courier.isEnabled())) continue;
      await courier.check();
      if (await hasSelectedOrEnabledAddress()) return;
    }

    throw new Error('Aucune adresse de livraison compatible avec le mode de livraison sélectionné.');
  }

  /** Pick a delivery address by visible label; rotates couriers when needed. */
  async selectAddressByLabel(labelPattern: RegExp): Promise<void> {
    const match = () =>
      this.page
        .locator(`label:has([data-testid="${tid.cart.addressOption}"])`)
        .filter({ hasText: labelPattern });

    const selectWhenReady = async (): Promise<boolean> => {
      const count = await match().count();
      for (let index = 0; index < count; index += 1) {
        const label = match().nth(index);
        const option = label.locator(`[data-testid="${tid.cart.addressOption}"]`);
        if (!(await option.isEnabled())) continue;
        await reveal(label);
        await option.check();
        await expect(option).toBeChecked();
        return true;
      }
      return false;
    };

    if (await selectWhenReady()) return;

    const couriers = this.page.getByTestId(tid.cart.courierOption);
    for (let index = 0; index < (await couriers.count()); index += 1) {
      const courier = couriers.nth(index);
      if (!(await courier.isEnabled())) continue;
      await courier.check();
      if (await selectWhenReady()) return;
    }

    throw new Error(`No enabled delivery address matched ${labelPattern}`);
  }

  paymentOverflowMoreLink(): Locator {
    // Courier and payment sections each expose "+ autres"; payment is rendered last.
    return this.page.getByRole('button', { name: /\+ autres/i }).last();
  }

  async openPaymentOverflow(): Promise<void> {
    const more = this.paymentOverflowMoreLink();
    await reveal(more);
    await clickVisible(more);
    await expect(this.page.getByRole('dialog')).toBeVisible();
  }

  async expectBancontactListedInPaymentOverflow(): Promise<void> {
    await this.openPaymentOverflow();
    await expect(
      this.page
        .getByRole('dialog')
        .getByRole('button', { name: /Bancontact/i })
        .first(),
    ).toBeVisible();
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('dialog')).toBeHidden();
  }

  /** Galerie through the header / tab bar, then back to the cart. The SPA
   * stays warm, so the cart repaints from its tab cache before revalidating. */
  async leaveToGalleryAndReturn(): Promise<void> {
    if (this.#isMobile()) {
      await clickVisible(this.page.getByTestId(tid.tabBar.gallery));
    } else {
      await clickVisible(this.page.getByRole('banner').locator('a[href$="/gallery"]:not([data-nav-key])'));
    }
    await reveal(this.page.getByTestId(tid.gallery.page));
    await this.goto();
  }

  /** Cart address row whose summary contains `text`. */
  addressRow(text: string): Locator {
    return this.page
      .getByTestId(tid.cart.addressOption)
      .locator('xpath=ancestor::label[1]')
      .filter({ hasText: text });
  }

  /** Delete icon on the cart address row containing `text`, then confirm. */
  async deleteAddressFromCart(text: string): Promise<void> {
    const row = this.addressRow(text).locator('xpath=ancestor::div[2]');
    await clickVisible(row.getByRole('button', { name: 'Supprimer', exact: true }));
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    await expect(this.addressRow(text)).toHaveCount(0, { timeout: 15_000 });
  }

  /** Guest or logged-in: open cart address modal and save a home livraison. */
  async addHomeAddressFromCart(opts?: {
    recipient?: string;
    line1?: string;
    postal?: string;
    city?: string;
    phone?: string;
    label?: string;
    rememberAddress?: boolean;
  }): Promise<void> {
    const addAddress = this.page.getByTestId(tid.cart.addAddress);
    // OTP authentication can finish while the cart route is still mounted
    // with its guest checkout shell. Re-enter the cart once so the
    // authenticated address controls are rendered before interacting.
    if (!(await addAddress.isVisible().catch(() => false))) {
      // Leave and re-enter through the customer's own navigation so an auth
      // transition cannot be hidden by a direct cart reload.
      await this.leaveToGalleryAndReturn();
    }
    // Adding a home address while Point Relais is the selected (or default)
    // courier opens the Mondial Relay picker instead of the home form.
    await this.selectFirstHomeCourier();
    await clickVisible(addAddress);
    const form = this.page.getByTestId(tid.address.form);
    await reveal(form);
    // Checkout renders a label only when the new address will be retained.
    // These helper-created addresses must remain available for selection.
    const rememberAddress = form.getByRole('checkbox', { name: /mémoriser cette adresse/i });
    if (opts?.rememberAddress === false) {
      await expect(rememberAddress).not.toBeChecked();
    } else {
      await checkVisible(rememberAddress);
    }
    const label = form.getByTestId(tid.address.label);
    if (await label.isVisible().catch(() => false)) {
      await fillVisible(label, opts?.label ?? 'Maison E2E');
    }
    await fillVisible(form.getByTestId(tid.address.recipient), opts?.recipient ?? 'Ada Lovelace');
    await fillVisible(form.getByTestId(tid.address.phone), opts?.phone ?? '0601020304');
    await fillVisible(form.getByTestId(tid.address.line1), opts?.line1 ?? '10 rue de Test');
    await fillVisible(form.getByTestId(tid.address.postal), opts?.postal ?? '75001');
    await fillVisible(form.getByTestId(tid.address.city), opts?.city ?? 'Paris');
    await clickVisible(this.page.getByTestId(tid.address.submit));
    await expect(form).toBeHidden({ timeout: 15_000 });
    const saved = this.page.getByTestId(tid.cart.addressOption).first();
    await expect(saved).toBeVisible({ timeout: 15_000 });
    // `cart-address-option` identifies the radio input itself; its visible
    // address summary is in the wrapping label.
    const savedLabel = saved.locator('xpath=ancestor::label[1]');
    await expect(savedLabel).toContainText(opts?.recipient ?? 'Ada Lovelace');
    await expect(savedLabel).toContainText(opts?.line1 ?? '10 rue de Test');
  }

  /** Select cart "Nouvelle carte" (primary list or payment overflow). */
  async selectNewCard(): Promise<void> {
    const primary = this.page.getByTestId(tid.cart.payNewCard);
    if (await primary.isVisible().catch(() => false)) {
      await checkVisible(primary);
      return;
    }
    await this.openPaymentOverflow();
    await clickVisible(
      this.page
        .getByRole('dialog')
        .getByRole('button', { name: /Nouvelle carte bancaire/i })
        .first(),
    );
    await checkVisible(this.page.getByTestId(tid.cart.payNewCard));
  }

  /**
   * Profile SetupIntent path (account payment methods). Used when a race or
   * multi-attempt flow needs a remembered card before opening the pay sheet.
   * Cart checkout itself collects a new card in the pay sheet via
   * {@link selectNewCard}.
   */
  async addSavedTestCardFromProfile(
    cardholder = 'Ada Lovelace',
    cardNumber?: string,
  ): Promise<void> {
    const account = new AccountPages(this.page);
    await account.gotoPayments();
    await clickVisible(this.page.getByTestId(tid.account.addCard));
    await expect(this.page.getByTestId(tid.card.modal)).toBeVisible({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
    await fillVisible(this.page.getByTestId(tid.card.cardholder), cardholder);
    await this.fillStripePaymentElement(cardNumber);
    await clickVisible(this.page.getByTestId(tid.card.submit));
    await expect(this.page.getByTestId(tid.card.modal)).toBeHidden({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
    await this.goto();
  }

  async selectPaypal(): Promise<void> {
    await checkVisible(this.page.getByTestId(tid.cart.payPaypal));
  }

  async selectBancontact(): Promise<void> {
    const primary = this.page.getByTestId(tid.cart.payBancontact);
    if (await primary.isVisible().catch(() => false)) {
      await checkVisible(primary);
      return;
    }
    await this.openPaymentOverflow();
    await clickVisible(
      this.page
        .getByRole('dialog')
        .getByRole('button', { name: /Bancontact/i })
        .first(),
    );
    await checkVisible(this.page.getByTestId(tid.cart.payBancontact));
  }

  async selectSavedCard(): Promise<void> {
    await checkVisible(this.page.getByTestId(tid.cart.payCard).first());
  }

  async payWithCard(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.cart.payCard).first());
  }

  async payWithPaypal(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.cart.payPaypal));
  }

  async payWithBancontact(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.cart.payBancontact));
  }

  async openPayConfirm(): Promise<void> {
    const pay = this.page.getByTestId(tid.cart.paySubmit);
    await reveal(pay);
    await expect(pay).toBeEnabled({ timeout: 15_000 });
    await pay.click();
    const confirm = this.page.getByTestId(tid.cart.confirmPay);
    const error = this.page
      .getByTestId(tid.cart.confirmError)
      .or(this.page.getByTestId(tid.cart.paymentError));
    await expect(confirm.or(error).first()).toBeVisible({ timeout: 15_000 });
    if (!(await confirm.isVisible())) {
      throw new Error(`checkout payment intent was rejected: ${(await error.first().innerText()).trim()}`);
    }
  }

  async confirmPay(): Promise<void> {
    const pay = this.page.getByTestId(tid.cart.confirmPay);
    await reveal(pay);
    await expect(pay).toBeEnabled({ timeout: 15_000 });
    await clickVisible(pay);
  }

  /** Wait until order success UI (cart page or checkout return). Returns order number. */
  async expectOrderSuccess(): Promise<string> {
    await expect(this.page.getByTestId(tid.cart.orderSuccess)).toBeVisible({ timeout: 15_000 });
    const number = this.page.getByTestId(tid.cart.orderNumber);
    await expect(number).not.toBeEmpty();
    return (await number.innerText()).trim();
  }

  /** A voucher-covered zero total is an order path of its own: the shared
   * Payer button confirms directly, with no Stripe method or confirmation. */
  async completeFreeOrderToSuccess(): Promise<string> {
    const pay = this.page.getByTestId(tid.cart.paySubmit);
    await reveal(pay);
    await expect(pay).toBeEnabled({ timeout: 15_000 });
    await expect(pay).toContainText(/0[,.]00\s*€/);
    await pay.click();
    return await this.expectOrderSuccess();
  }

  /** Guest zero-total path: identity/CGU remain mandatory even though no
   * payment method is needed. */
  async completeGuestFreeOrderToSuccess(email: string): Promise<string> {
    await this.#fillGuestCheckoutIdentity(email);
    return await this.completeFreeOrderToSuccess();
  }

  async fillGuestCheckoutIdentity(email: string): Promise<void> {
    await this.#fillGuestCheckoutIdentity(email);
  }

  /** Email + guest CGU on Identification. The consent input is clipped by
   * its custom row and suppresses mouse focus so a label click does not
   * steal the email field; Patchright `check()` / label click is unstable
   * here. Keyboard Space on the input is the same path as a shopper. */
  async #fillGuestCheckoutIdentity(email: string): Promise<void> {
    // Filling a card scrolls the left column; the recap then pins
    // (`position: fixed`). Patchright's trial click hangs on that pinned
    // email field. Scroll to the top so the identification card is in
    // normal flow, which is also how a shopper reaches it.
    await this.page.evaluate(() => {
      window.scrollTo(0, 0);
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    });
    await fillVisible(this.page.getByTestId(tid.guest.email), email);
    const consent = this.page.getByTestId(tid.guest.consent);
    await reveal(consent);
    if (!(await consent.isChecked())) {
      await consent.focus();
      await consent.press('Space');
    }
    await expect(consent).toBeChecked();
  }

  /**
   * Confirm PayPal or Bancontact: Stripe opens its test authorize page
   * (same tab or popup). Scroll to "Authorize Test Payment", click success,
   * wait for order UI.
   */
  async completePaypalSuccessFlow(): Promise<string> {
    return this.completeRedirectPaymentSuccessFlow();
  }

  async completeBancontactSuccessFlow(): Promise<string> {
    await this.fillStripeRedirectBillingNameIfPresent();
    return this.completeRedirectPaymentSuccessFlow();
  }

  async completeRedirectPaymentSuccessFlow(): Promise<string> {
    const context = this.page.context();
    const opened: Page[] = [];
    const onPage = (p: Page) => {
      opened.push(p);
    };
    context.on('page', onPage);

    try {
      await this.confirmPay();

      let authorized = false;
      const deadline = actionDeadline();
      while (Date.now() < deadline) {
        if (
          await this.page
            .getByTestId(tid.cart.orderSuccess)
            .isVisible()
            .catch(() => false)
        ) {
          return await this.expectOrderSuccess();
        }

        for (const target of [this.page, ...opened]) {
          if (target.isClosed()) continue;
          const control = stripeAuthorizeControl(target);
          if (await control.isVisible().catch(() => false)) {
            await control.scrollIntoViewIfNeeded();
            await expect(control).toBeVisible();
            await control.click();
            authorized = true;
            break;
          }
          // Stripe can keep the PayPal sandbox flow in its embedded frame
          // rather than opening a top-level return page.
          for (const frame of target.frames()) {
            const frameControl = frame
              .getByRole('link', { name: /authorize test payment|autoriser le paiement|autoriser/i })
              .or(
                frame.getByRole('button', {
                  name: /authorize test payment|autoriser le paiement|autoriser/i,
                }),
              )
              .first();
            if (await frameControl.isVisible().catch(() => false)) {
              await frameControl.scrollIntoViewIfNeeded();
              await frameControl.click();
              authorized = true;
              break;
            }
          }
          if (authorized) break;
        }
        if (authorized) break;
        await this.page.waitForTimeout(300);
      }

      if (!authorized) {
        throw new Error(
          `PayPal/Bancontact Stripe authorize control did not appear within ${MAX_ACTION_TIMEOUT_MS}ms`,
        );
      }

      return await this.expectOrderSuccess();
    } finally {
      context.off('page', onPage);
    }
  }

  async addFirstCarouselAccessory(): Promise<void> {
    const card = this.page.getByTestId(tid.cart.accessoryCard).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    const uid = await card.getAttribute('data-product-uid');
    if (!uid) throw new Error('accessory carousel has no product uid');
    await this.addAccessoryFromCarousel(uid);
  }

  async selectGooglePay(): Promise<void> {
    await checkVisible(this.page.getByTestId(tid.cart.payGooglePay));
  }

  /**
   * Google Pay uses Stripe Express Checkout. Headed Chrome is required.
   * Fail clearly when the wallet sheet never appears (common in automation).
   */
  async completeGooglePaySuccessFlow(): Promise<string> {
    await this.selectGooglePay();
    await this.openPayConfirm();
    const confirm = this.page.getByTestId(tid.cart.confirmPay);
    await expect(confirm).toBeVisible({ timeout: 15_000 });
    const deadline = actionDeadline();
    while (Date.now() < deadline) {
      if (
        await this.page
          .getByTestId(tid.cart.orderSuccess)
          .isVisible()
          .catch(() => false)
      ) {
        return await this.expectOrderSuccess();
      }
      for (const frame of this.page.frames()) {
        const wallet = frame
          .getByRole('button', { name: /google pay|acheter|pay/i })
          .or(
            frame.locator(
              '[data-testid="google-pay-button"], .gpay-button, button[aria-label*="Google Pay"]',
            ),
          )
          .first();
        if (await wallet.isVisible().catch(() => false)) {
          await wallet.click();
          break;
        }
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error(
      'Google Pay wallet sheet did not appear. Preprod Google Pay needs headed Chrome and a usable Payment Request sheet.',
    );
  }

  async addMondialRelayPickupFromCart(postalCode = '75001'): Promise<void> {
    await this.selectCourierByCode('mondial-relay-point');
    await clickVisible(this.page.getByTestId(tid.cart.addAddress));
    const addresses = new AddressPages(this.page);
    await addresses.completeMondialRelayPicker(postalCode);
    const form = this.page.getByTestId(tid.address.form);
    await expect(form).toBeVisible({ timeout: 15_000 });
    await fillVisible(form.getByTestId(tid.address.recipient), 'Ada Lovelace');
    await fillVisible(form.getByTestId(tid.address.phone), '0601020304');
    await clickVisible(this.page.getByTestId(tid.address.submit));
    await expect(form).toBeHidden({ timeout: 15_000 });
  }

  /**
   * Pay with a new card collected in the confirm sheet (no prior SetupIntent).
   * Returns the confirmed order number.
   */
  async addTestCardAndPayToSuccess(
    cardholder = 'Ada Lovelace',
    opts?: { rememberCard?: boolean; cardNumber?: string },
  ): Promise<string> {
    await this.selectNewCard();
    await this.openPayConfirm();
    await this.#fillNewCardPaySheet(cardholder, opts);
    await this.confirmPay();
    return await this.expectOrderSuccess();
  }

  /** Guest checkout: identity/CGU first, then new-card pay sheet. */
  async addGuestCardAndPayToSuccess(
    email: string,
    opts?: { rememberAddress?: boolean; rememberCard?: boolean; cardNumber?: string },
  ): Promise<string> {
    await this.selectNewCard();
    await this.#fillGuestCheckoutIdentity(email);
    await this.openPayConfirm();
    await this.#fillNewCardPaySheet('Ada Lovelace', opts);
    await this.confirmPay();
    return await this.expectOrderSuccess();
  }

  async #fillNewCardPaySheet(
    cardholder: string,
    opts?: { rememberCard?: boolean; cardNumber?: string },
  ): Promise<void> {
    await expect(this.page.getByTestId(tid.cart.newCardConfirm)).toBeVisible({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
    await fillVisible(this.page.getByTestId(tid.cart.newCardCardholder), cardholder);
    await this.fillStripePaymentElement(opts?.cardNumber);
    const rememberCard = this.page.getByTestId(tid.cart.newCardRemember);
    if (await rememberCard.isVisible().catch(() => false)) {
      if (opts?.rememberCard === true) {
        await rememberCard.check();
        await expect(rememberCard).toBeChecked();
      } else {
        await expect(rememberCard).not.toBeChecked();
      }
    } else if (opts?.rememberCard === true) {
      throw new Error('new-card remember checkbox was not visible');
    }
  }

  /** Merge guest cart into the existing account cart (LoginMergeDialog). */
  async mergeGuestIntoExistingCart(): Promise<void> {
    await reveal(this.page.getByTestId(tid.loginMerge.dialog));
    await clickVisible(this.page.getByTestId(tid.loginMerge.merge));
    const firstCart = this.page.getByTestId(tid.loginMerge.cart).first();
    if (await firstCart.isVisible().catch(() => false)) {
      await clickVisible(firstCart);
    }
    await clickVisible(this.page.getByTestId(tid.loginMerge.continue));
    await expect(this.page.getByTestId(tid.loginMerge.dialog)).toBeHidden({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  /** Keep the anonymous cart as a distinct named cart after login. */
  async createCartFromGuestCart(name: string): Promise<void> {
    const dialog = this.page.getByTestId(tid.loginMerge.dialog);
    await reveal(dialog);
    await checkVisible(this.page.getByTestId(tid.loginMerge.create));
    await fillVisible(dialog.locator('input[name="cart-name"]'), name);
    await clickVisible(this.page.getByTestId(tid.loginMerge.continue));
    await expect(dialog).toBeHidden({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  /** Create a second cart via the switcher (+ tile). */
  async createNamedCart(name: string): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.cart.create));
    await fillVisible(this.page.getByTestId(tid.cart.nameInput), name);
    await clickVisible(this.page.getByTestId(tid.cart.nameConfirm));
    await expect(this.page.getByTestId(tid.cart.nameInput)).toBeHidden({ timeout: 15_000 });
  }

  /** Activate a non-active cart tile (first match). */
  async switchToOtherCart(): Promise<void> {
    const tile = this.page.getByTestId(tid.cart.switch).first();
    await clickVisible(tile);
    await this.page.waitForTimeout(500);
  }

  /** Delete one nail-set card and confirm the remove dialog. */
  async removeNailByUid(productUid: string): Promise<void> {
    await this.clickNailDelete(productUid);
    const dialog = this.page.getByRole('dialog', { name: /retirer cet article/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await clickVisible(dialog.getByRole('button', { name: /^Supprimer$/i }));
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(
      this.page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${productUid}"]`),
    ).toHaveCount(0);
  }

  async clickNailDelete(productUid: string): Promise<void> {
    const line = this.page.locator(`[data-testid="${tid.cart.line}"][data-product-uid="${productUid}"]`);
    await reveal(line);
    await clickVisible(line.getByRole('button', { name: /^Supprimer$/i }));
  }

  giftCancelConfirm(): Locator {
    return this.page.getByRole('dialog', { name: /annuler ce cadeau/i });
  }

  async dismissGiftCancelConfirm(): Promise<void> {
    const dialog = this.giftCancelConfirm();
    await clickVisible(dialog.locator('[data-modal-close]'));
    await expect(dialog).toHaveCount(0);
  }

  async confirmGiftCancelFromModal(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    await expect(this.giftCancelConfirm()).toHaveCount(0);
  }

  /** Expect the cart payment error (e.g. size_unavailable). */
  async expectPaymentError(pattern: RegExp): Promise<void> {
    const err = this.page.getByTestId(tid.cart.paymentError);
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err).toContainText(pattern);
  }

  /** Click Payer when create-intent should fail (OOS race). */
  async attemptPayExpectError(pattern: RegExp): Promise<void> {
    const pay = this.page.getByTestId(tid.cart.paySubmit);
    await reveal(pay);
    await expect(pay).toBeEnabled({ timeout: MAX_ACTION_TIMEOUT_MS });
    await pay.click();
    // Card/PayPal confirm dialogs surface intent errors inline; some paths
    // also set the page-level payment notice.
    const dialogError = this.page.getByTestId(tid.cart.confirmError);
    const pageError = this.page.getByTestId(tid.cart.paymentError);
    const checkoutError = dialogError
      .or(pageError)
      .or(this.page.getByRole('dialog', { name: /impossible de préparer le paiement/i }))
      .first();
    await expect(checkoutError).toBeVisible({ timeout: 15_000 });
    await expect(checkoutError).toContainText(pattern);
  }

  /** Bancontact confirm dialog collects first/last name before Continuer. */
  async fillStripeRedirectBillingNameIfPresent(firstName = 'Ada', lastName = 'Lovelace'): Promise<void> {
    const first = this.page.getByTestId(tid.cart.bancontactFirstName);
    const last = this.page.getByTestId(tid.cart.bancontactLastName);
    if (await first.isVisible().catch(() => false)) {
      await first.fill(firstName);
      await last.fill(lastName);
      return;
    }
    // Legacy Stripe Payment Element name field (iframe) — keep as fallback.
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      for (const frame of this.page.frames()) {
        const candidate = frame
          .locator(
            'input[name="name"], input[autocomplete="name"], [data-elements-stable-field-name="billingName"]',
          )
          .first();
        if (await candidate.isVisible().catch(() => false)) {
          await this.#fillStripeField(candidate, `${firstName} ${lastName}`, /Ada Lovelace/);
          return;
        }
      }
      await this.page.waitForTimeout(100);
    }
  }

  /** Fill Stripe Payment Element card fields (test mode 4242…). */
  async fillStripePaymentElement(
    number = testCardNumber,
    expiry = testCardExpiry,
    cvc = testCardCvc,
  ): Promise<void> {
    await withTestWindowFocus(this.page, () => this.#fillStripePaymentElement(number, expiry, cvc));
  }

  async #fillStripePaymentElement(
    number: string,
    expiry: string,
    cvc: string,
  ): Promise<void> {
    const paymentElement = this.page.getByTestId(tid.card.paymentElement);
    if (await paymentElement.count()) await reveal(paymentElement);

    // Stripe mounts its fields in cross-origin iframes and can briefly
    // remount them while the modal settles. Find the live frame by the field
    // itself instead of taking the first matching iframe; the first iframe is
    // not a stable contract and can otherwise receive the next keystrokes in
    // the wrong field.
    const numberInput = await this.#findStripeField(
      'input[name="number"], input[autocomplete="cc-number"], [data-elements-stable-field-name="cardNumber"], input[placeholder*="1234"]',
      'card number',
    );
    // Stripe formats card numbers with spaces. Verify the actual digits that
    // were requested, not only the usual 4242 happy-path card: stock-race
    // tests intentionally use a decline card too.
    const numberDigits = number.replace(/\D/g, '');
    await this.#fillStripeField(
      numberInput,
      number,
      new RegExp(`^${numberDigits.split('').join('\\s*')}$`),
      MAX_ACTION_TIMEOUT_MS,
    );

    const exp = await this.#findStripeField(
      'input[name="expiry"], input[name="exp-date"], input[autocomplete="cc-exp"], [data-elements-stable-field-name="cardExpiry"]',
      'card expiry',
    );
    await this.#fillStripeField(exp, expiry, /12\s*\/?\s*34/);

    const cvcInput = await this.#findStripeField(
      'input[name="cvc"], input[autocomplete="cc-csc"], [data-elements-stable-field-name="cardCvc"]',
      'card security code',
    );
    await this.#fillStripeField(cvcInput, cvc, new RegExp(`^${cvc}$`));
  }

  async #findStripeField(selector: string, label: string): Promise<Locator> {
    const deadline = Date.now() + MAX_ACTION_TIMEOUT_MS;
    while (Date.now() < deadline) {
      for (const frame of this.page.frames()) {
        const candidate = frame.locator(selector).first();
        if (await candidate.isVisible().catch(() => false)) return candidate;
      }
      await this.page.waitForTimeout(100);
    }
    throw new Error(`Stripe ${label} input did not become visible within ${MAX_ACTION_TIMEOUT_MS}ms`);
  }

  /** Stripe remounts its iframe fields during the modal entrance animation.
   * Do not allow a test to submit until the live field has retained its value. */
  async #fillStripeField(
    input: ReturnType<ReturnType<Page['frameLocator']>['locator']>,
    value: string,
    expected: RegExp,
    timeout = 10_000,
  ): Promise<void> {
    await expect(input).toBeVisible({ timeout });
    await expect(input).toBeEnabled({ timeout });
    await input.scrollIntoViewIfNeeded();
    await withTestWindowFocus(input.page(), async () => {
      await ensureOsFocused(input);
      await input.fill(value);
      await expect(input).toHaveValue(expected, { timeout });
    });
  }

  /** @deprecated Prefer fillStripePaymentElement */
  async fillStripeTestCard(
    number = testCardNumber,
    expiry = testCardExpiry.replace('/', ''),
    cvc = testCardCvc,
  ): Promise<void> {
    await this.fillStripePaymentElement(
      number,
      expiry.length === 4 ? `${expiry.slice(0, 2)}/${expiry.slice(2)}` : expiry,
      cvc,
    );
  }
}
