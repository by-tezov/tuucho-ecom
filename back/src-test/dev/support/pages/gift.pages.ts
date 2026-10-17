import type { BrowserContext, Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { loadTestEnv, testGiftPin } from '../env.js';
import {
  checkVisible,
  clickUnobscured,
  clickVisible,
  closeMobileNavIfOpen,
  fillVisible,
  reveal,
  skipOnboardingOnContext,
  startCustomerJourneyAtRoot,
  typeOtpVisible,
} from '../interact.js';
import { tid } from '../selectors.js';
import { AddressPages } from './address.pages.js';
import { CartPages } from './cart.pages.js';
import { GalleryPages } from './gallery.pages.js';

export type GiftSurface = 'web' | 'mobile';

const BUDGET_PRESETS = [15, 25, 40, 60, 90] as const;
const ACCESSORY_PRESETS = [3, 5] as const;

export function giftSurfaceFromTitle(title: string): GiftSurface {
  return /\bmobile\b/i.test(title) ? 'mobile' : 'web';
}

export async function openPeerShopPage(
  page: Page,
  surface: GiftSurface,
): Promise<{ page: Page; context: BrowserContext; close: () => Promise<void> }> {
  const viewport = surface === 'mobile' ? { width: 390, height: 633 } : { width: 1280, height: 864 };
  const browser = page.context().browser();
  if (!browser) throw new Error('functional browser is unavailable');
  const context = await browser.newContext({
    baseURL: loadTestEnv().frontBaseUrl,
    viewport,
    locale: 'fr-FR',
    ignoreHTTPSErrors: true,
  });
  await skipOnboardingOnContext(context);
  const peer = await context.newPage();
  return {
    page: peer,
    context,
    close: async () => {
      await context.close();
    },
  };
}

/** Second Chrome tab: shared origin lock, empty sessionStorage. */
export async function openOriginBlockedShopPage(
  from: Page,
  surface: GiftSurface,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const originBlock = await from.evaluate(() => window.localStorage.getItem('psn-gift-lock-v1'));
  if (!originBlock) throw new Error('receiver tab has no gift origin block');
  const viewport = surface === 'mobile' ? { width: 390, height: 633 } : { width: 1280, height: 864 };
  const browser = from.context().browser();
  if (!browser) throw new Error('functional browser is unavailable');
  const context = await browser.newContext({
    baseURL: loadTestEnv().frontBaseUrl,
    viewport,
    locale: 'fr-FR',
    ignoreHTTPSErrors: true,
  });
  await skipOnboardingOnContext(context);
  await context.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('psn-gift-lock-v1', value);
    } catch {
      // Private mode / quota.
    }
  }, originBlock);
  const peer = await context.newPage();
  return {
    page: peer,
    close: async () => {
      await context.close();
    },
  };
}

export class GiftPages {
  constructor(readonly page: Page) {}

  async openOffrirFromNav(): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    // Offrir is a header control on every breakpoint (desktop nav, or the
    // trailing CTA beside the burger). It is not in the mobile drawer.
    await closeMobileNavIfOpen(this.page);
    const offerLink = this.page
      .getByRole('banner')
      .getByRole('link', { name: 'Offrir', exact: true })
      .filter({ visible: true })
      .first();
    await expect(offerLink).toBeVisible({ timeout: 15_000 });
    const form = this.page.getByTestId(tid.gift.createForm);
    const submit = this.page.getByTestId(tid.gift.createSubmit);
    const name = this.page.locator('#gift-giver-name');
    const onCreatePage = async (): Promise<boolean> =>
      /\/gift\/?$/.test(new URL(this.page.url()).pathname) &&
      (await form.isVisible().catch(() => false)) === true &&
      (await submit.isEnabled().catch(() => false)) === true;
    const deadline = Date.now() + 15_000;
    while (!(await onCreatePage()) && Date.now() < deadline) {
      await closeMobileNavIfOpen(this.page);
      if ((await offerLink.isVisible().catch(() => false)) === true) {
        await clickVisible(offerLink);
      }
      await this.page.waitForTimeout(250);
    }
    await expect(this.page).toHaveURL(/\/gift\/?$/, { timeout: 15_000 });
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(name).toBeVisible({ timeout: 15_000 });
    await expect(submit).toBeEnabled({ timeout: 15_000 });
  }

  async submitCreate(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.gift.createSubmit));
  }

  async expectFieldError(testId: string, pattern: RegExp): Promise<void> {
    const error = this.page.getByTestId(testId);
    await expect(error).toBeVisible();
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText(pattern);
  }

  async fillGuestIdentity(opts: {
    email: string;
    giverName?: string;
    receiverName?: string;
    comment?: string;
  }): Promise<void> {
    await fillVisible(this.page.getByTestId(tid.gift.giverEmail), opts.email);
    await fillVisible(this.page.getByTestId(tid.gift.giverName), opts.giverName ?? 'Marc');
    await fillVisible(this.page.getByTestId(tid.gift.receiverName), opts.receiverName ?? 'Julie');
    await fillVisible(this.page.getByTestId(tid.gift.giverComment), opts.comment ?? 'Pour toi');
  }

  async fillSignedInIdentity(opts: { giverName?: string; receiverName?: string; comment?: string }): Promise<void> {
    // Same fields as the guest form, minus email. Do not nest under
    // `gift-create-form`: a remount after auth hydrates can make that
    // parent locator miss `#gift-giver-name` on a narrow viewport.
    const name = this.page.locator('#gift-giver-name');
    const receiver = this.page.getByTestId(tid.gift.receiverName);
    const comment = this.page.getByTestId(tid.gift.giverComment);
    await expect(name).toBeVisible({ timeout: 15_000 });
    await expect(receiver).toBeVisible({ timeout: 15_000 });
    await expect(comment).toBeVisible({ timeout: 15_000 });
    await fillVisible(name, opts.giverName ?? 'Marc');
    await fillVisible(receiver, opts.receiverName ?? 'Julie');
    await fillVisible(comment, opts.comment ?? 'Pour toi');
  }

  async fillPins(pin: string, confirm = pin): Promise<void> {
    await typeOtpVisible(this.page.getByTestId(tid.gift.createPin), pin);
    await typeOtpVisible(this.page.getByTestId(tid.gift.createPinConfirm), confirm);
  }

  async acceptGdpr(): Promise<void> {
    const box = this.page.getByTestId(tid.gift.gdpr);
    if (!(await box.isChecked())) {
      await checkVisible(box);
    }
    await expect(box).toBeChecked();
  }

  async setHidePrices(hide: boolean): Promise<void> {
    const box = this.page.getByTestId(tid.gift.hidePrices);
    const checked = await box.isChecked();
    if (checked !== hide) {
      await clickUnobscured(box);
    }
    if (hide) await expect(box).toBeChecked();
    else await expect(box).not.toBeChecked();
  }

  async enableAccessories(): Promise<void> {
    const box = this.page.getByTestId(tid.gift.allowAccessories);
    if (!(await box.isChecked())) {
      await clickUnobscured(box);
    }
    await expect(box).toBeChecked();
  }

  async #chooseStepperPreset(stepperId: string, euros: number, chipGroupName: RegExp): Promise<void> {
    const chip = this.page.getByRole('group', { name: chipGroupName }).getByRole('button', {
      name: `${euros} €`,
      exact: true,
    });
    if (await chip.isVisible().catch(() => false)) {
      await clickVisible(chip);
      return;
    }
    const stepper = this.page.locator(`#${stepperId}`);
    await clickVisible(stepper.getByRole('button', { name: /\d[\d\s]*€/ }));
    await clickVisible(this.page.getByRole('listbox').getByRole('option', { name: `${euros} €`, exact: true }));
  }

  async chooseBudgetPreset(euros: number): Promise<void> {
    await this.#chooseStepperPreset('gift-max-budget', euros, /budget pour les sets/i);
  }

  async setNailBudget(euros: number): Promise<void> {
    if ((BUDGET_PRESETS as readonly number[]).includes(euros)) {
      await this.chooseBudgetPreset(euros);
      return;
    }
    const start = BUDGET_PRESETS.find((preset) => preset >= euros) ?? BUDGET_PRESETS[BUDGET_PRESETS.length - 1];
    await this.chooseBudgetPreset(start);
    const delta = euros - start;
    const label = delta < 0 ? /diminuer le budget/i : /augmenter le budget/i;
    const button = this.page.locator('#gift-max-budget').getByRole('button', { name: label });
    for (let i = 0; i < Math.abs(delta); i += 1) {
      await clickVisible(button);
    }
  }

  async setAccessoryBudgetPreset(euros: number): Promise<void> {
    if (!(ACCESSORY_PRESETS as readonly number[]).includes(euros)) {
      throw new Error(`no accessory preset ${euros}`);
    }
    await this.#chooseStepperPreset('gift-max-accessory-budget', euros, /budget accessoires/i);
  }

  async expectBudgetIncreaseDisabled(): Promise<void> {
    await expect(this.page.locator('#gift-max-budget').getByRole('button', { name: /augmenter le budget/i })).toBeDisabled();
  }

  async expectAccessoryIncreaseDisabled(): Promise<void> {
    await expect(
      this.page.locator('#gift-max-accessory-budget').getByRole('button', { name: /augmenter le budget/i }),
    ).toBeDisabled();
  }

  async completeValidGuestForm(opts: {
    email: string;
    hidePrices?: boolean;
    accessories?: boolean;
    accessoryEuros?: number;
    budgetEuros?: number;
    pin?: string;
  }): Promise<void> {
    await this.fillGuestIdentity({ email: opts.email });
    await this.setNailBudget(opts.budgetEuros ?? 15);
    await this.setHidePrices(opts.hidePrices !== false);
    if (opts.accessories) {
      await this.enableAccessories();
      await this.setAccessoryBudgetPreset(opts.accessoryEuros ?? 3);
    }
    await this.fillPins(opts.pin ?? testGiftPin);
    await this.acceptGdpr();
  }

  async completeValidSignedInForm(opts: {
    hidePrices?: boolean;
    accessories?: boolean;
    accessoryEuros?: number;
    budgetEuros?: number;
    pin?: string;
  }): Promise<void> {
    await this.fillSignedInIdentity({});
    await this.setNailBudget(opts.budgetEuros ?? 15);
    await this.setHidePrices(opts.hidePrices !== false);
    if (opts.accessories) {
      await this.enableAccessories();
      await this.setAccessoryBudgetPreset(opts.accessoryEuros ?? 3);
    }
    await this.fillPins(opts.pin ?? testGiftPin);
    await this.acceptGdpr();
  }

  async expectGuestCreated(): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.createCheckEmail)).toBeVisible({ timeout: 15_000 });
    await this.expectCreatedCardAndPin();
  }

  async expectSignedInCreated(): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.createReady)).toBeVisible({ timeout: 15_000 });
    await this.expectCreatedCardAndPin();
  }

  async expectCreatedCardAndPin(pin = testGiftPin, receiverName = 'Julie'): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.createdPin)).toHaveText(pin);
    const card = this.page.getByTestId(tid.gift.shareCardPreview);
    await expect(card).toBeVisible();
    await expect(card).toContainText(receiverName);
  }

  async chooseShareCardStyle(label: string): Promise<void> {
    const swatch = this.page.locator(`button[aria-pressed][aria-label="${label}"]`);
    if ((await swatch.isVisible().catch(() => false)) === true) {
      await clickVisible(swatch);
      return;
    }
    await clickVisible(this.page.getByTestId(tid.gift.shareCardStyle));
    await clickVisible(this.page.getByRole('listbox').getByRole('option', { name: label, exact: true }));
  }

  async expectShareCardStyle(label: string): Promise<void> {
    const swatch = this.page.locator(`button[aria-pressed="true"][aria-label="${label}"]`);
    if ((await swatch.isVisible().catch(() => false)) === true) {
      await expect(swatch).toBeVisible();
      return;
    }
    await expect(this.page.getByTestId(tid.gift.shareCardStyle)).toContainText(label);
  }

  async expectCommentLines(count: number): Promise<void> {
    const comment = this.page.getByTestId(tid.gift.giverComment);
    await expect
      .poll(async () => (await comment.inputValue()).split(/\n/).length)
      .toBe(count);
  }

  async pasteComment(value: string): Promise<void> {
    const comment = this.page.getByTestId(tid.gift.giverComment);
    await reveal(comment);
    await comment.click({ trial: true, timeout: 10_000 });
    await comment.fill(value);
  }

  async unlockPin(pin: string): Promise<void> {
    const blocked = this.page.getByTestId(tid.gift.pinBlockedCta);
    const pinGroup = this.page.getByTestId(tid.gift.pinInput);
    await expect(blocked.or(pinGroup).first()).toBeVisible({ timeout: 15_000 });
    if ((await pinGroup.isVisible().catch(() => false)) !== true) {
      await clickVisible(blocked);
    }
    await expect(pinGroup).toBeVisible({ timeout: 15_000 });
    await typeOtpVisible(pinGroup, pin);
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    const pinError = this.page.getByTestId(tid.gift.pinError);
    // Confirm returns before unlockGiftPin + lock mint finish. The banner is
    // already visible on `/gift/:token` (URL token), so wait until this attempt
    // actually settles: wrong-PIN error, or the modal gone after a mint.
    await expect
      .poll(
        async () => {
          if (await pinError.isVisible().catch(() => false)) return 'error';
          if ((await pinGroup.isVisible().catch(() => false)) !== true) return 'closed';
          return 'pending';
        },
        { timeout: 15_000 },
      )
      .not.toBe('pending');
  }

  /** Gallery (selecting) or cart (follow), with a minted tab lock, not the PIN URL. */
  async expectReceiverUnlocked(): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.pinInput)).toHaveCount(0);
    await expect(
      this.page.getByTestId(tid.gallery.page).or(this.page.getByTestId(tid.cart.page)).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.gift.lockBanner)).toBeVisible({ timeout: 15_000 });
  }

  async expectPinWrong(): Promise<void> {
    const error = this.page.getByTestId(tid.gift.pinError);
    await expect(error).toBeVisible();
    await expect(error).toContainText(/pas le bon/i);
  }

  async expectContinueNotice(): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.continueNotice)).toBeVisible({ timeout: 15_000 });
  }

  async expectGone(): Promise<void> {
    await expect(this.page.getByTestId(tid.gift.goneTitle)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.gift.goneTitle)).toContainText(/n’est plus disponible/i);
  }

  async expectNoCourierFees(): Promise<void> {
    const couriers = this.page.getByTestId(tid.cart.courierOption);
    await expect(couriers.first()).toBeVisible({ timeout: 15_000 });
    const count = await couriers.count();
    for (let index = 0; index < count; index += 1) {
      await expect(couriers.nth(index)).not.toContainText(/€/);
    }
  }

  async openReceiverUrl(url: string): Promise<void> {
    await this.page.goto(url);
    await expect(
      this.page
        .getByTestId(tid.gift.pinBlockedCta)
        .or(this.page.getByTestId(tid.gift.pinInput))
        .or(this.page.getByTestId(tid.gift.goneTitle))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  async enterReceiverWithPin(url: string, pin = testGiftPin): Promise<void> {
    await this.openReceiverUrl(url);
    await this.unlockPin(pin);
    await this.expectReceiverUnlocked();
  }

  async openGiverUrl(url: string, pin = testGiftPin): Promise<void> {
    await this.page.goto(url);
    const pinInput = this.page.getByTestId(tid.gift.pinInput);
    const cart = this.page.getByTestId(tid.cart.page);
    const gone = this.page.getByTestId(tid.gift.goneTitle);
    const merge = this.page.getByTestId(tid.loginMerge.dialog);
    await expect(pinInput.or(cart).or(gone)).toBeVisible({ timeout: 15_000 });
    if (await gone.isVisible().catch(() => false)) return;
    if (!(await cart.isVisible().catch(() => false))) {
      await this.unlockPin(pin);
    }
    await expect(cart.or(merge).or(gone)).toBeVisible({ timeout: 15_000 });
    if (await gone.isVisible().catch(() => false)) return;
    if (await merge.isVisible().catch(() => false)) {
      await clickVisible(this.page.getByTestId(tid.loginMerge.continue));
      await expect(merge).toBeHidden({ timeout: 15_000 });
    }
    await reveal(cart);
  }

  async addSeededSetAndGoToCart(productUid: string): Promise<void> {
    const gallery = new GalleryPages(this.page);
    await gallery.goto();
    await gallery.addSeededProduct(productUid, { shapeKey: 'amande', size: 'M' });
    const drawerCheckout = this.page.getByTestId(tid.cart.drawerCheckout);
    if (await drawerCheckout.isVisible().catch(() => false)) {
      await clickVisible(drawerCheckout);
    } else {
      await new CartPages(this.page).goto();
    }
    await reveal(this.page.getByTestId(tid.cart.page));
  }

  async saveHomeDestination(): Promise<void> {
    const cart = new CartPages(this.page);
    await cart.selectFirstHomeCourier();
    await clickVisible(this.page.getByTestId(tid.gift.addAddress));
    const form = this.page.getByTestId(tid.address.form);
    await reveal(form);
    await fillVisible(form.getByTestId(tid.address.recipient), 'Julie Test');
    await fillVisible(form.getByTestId(tid.address.phone), '0601020305');
    await fillVisible(form.getByTestId(tid.address.line1), '12 rue des Fleurs');
    await fillVisible(form.getByTestId(tid.address.postal), '75011');
    await fillVisible(form.getByTestId(tid.address.city), 'Paris');
    await clickVisible(this.page.getByTestId(tid.address.submit));
    await expect(form).toBeHidden({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.cart.page)).toContainText('Julie Test', { timeout: 15_000 });
    await expect(this.page.getByTestId(tid.cart.page)).toContainText('12 rue des Fleurs');
    await expect(this.savedAddressLabel()).toBeVisible({ timeout: 15_000 });
  }

  savedAddressLabel(): Locator {
    // `cart-address-option` is the hidden radio. Visible copy lives on the label.
    return this.page.getByTestId(tid.cart.addressOption).first().locator('xpath=ancestor::label[1]');
  }

  async confirmReceiverChoice(email = 'julie.receiver@example.com'): Promise<void> {
    await this.page.getByTestId(tid.gift.receiverEmail).fill(email);
    await clickVisible(this.page.getByTestId(tid.gift.receiverConfirm));
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    await this.expectChoiceLocked();
  }

  async expectChoiceLocked(): Promise<void> {
    const follow = this.page.getByTestId(tid.gift.followPage);
    await expect(follow).toBeVisible({ timeout: 15_000 });
    await expect(follow).toContainText(/choix est verrouillé/i);
  }

  async unlockGiverCart(): Promise<void> {
    const unlock = this.page.getByTestId(tid.gift.unlockCart);
    // Activating the gift cart shows "Chargement du panier…" and unmounts
    // this control. A one-shot check during that modal skips the click, and
    // the locked cart that follows has no line delete.
    await expect(this.page.locator('[role="alertdialog"][aria-busy="true"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(unlock.or(this.page.getByTestId(tid.cart.voucherInput)).first()).toBeVisible({
      timeout: 15_000,
    });
    if (await unlock.isVisible().catch(() => false)) {
      await clickVisible(unlock);
      await expect(unlock).toHaveCount(0, { timeout: 15_000 });
    }
    await expect(this.page.getByTestId(tid.cart.voucherInput)).toBeVisible({ timeout: 15_000 });
    await expect(this.savedAddressLabel()).toBeVisible({ timeout: 15_000 });
    await expect(
      this.page.locator(`[data-testid="${tid.cart.courierOption}"][data-courier-code="mondial-relay-home"]`),
    ).toBeChecked({ timeout: 15_000 });
  }

  async cancelOfferFromCart(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.gift.cancelOffer));
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    await expect(this.page.getByTestId(tid.gift.cancelOffer)).toHaveCount(0);
  }

  addressPages(): AddressPages {
    return new AddressPages(this.page);
  }

  cartPages(): CartPages {
    return new CartPages(this.page);
  }

  galleryPages(): GalleryPages {
    return new GalleryPages(this.page);
  }
}
