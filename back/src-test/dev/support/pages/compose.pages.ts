import type { Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { E2E_LENGTH, E2E_PRODUCT_UIDS, E2E_TITLES, E2E_VARIATION, type E2eProductUid } from '../catalog.js';
import {
  clickVisible,
  clickMobileNavControl,
  dismissOnboardingIfPresent,
  fillVisible,
  openMobileNav,
  reveal,
  startCustomerJourneyAtRoot,
} from '../interact.js';
import { shopPath, shopPathWithSearch } from '../shopPath.js';
import { actionDeadline, MAX_ACTION_TIMEOUT_MS } from '../timeouts.js';
import { GalleryPages } from './gallery.pages.js';

export type CompositionFinger =
  | 'left-thumb'
  | 'left-index'
  | 'left-middle'
  | 'left-ring'
  | 'left-pinky'
  | 'right-thumb'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky';

export const LEFT_HAND_FINGERS: CompositionFinger[] = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'left-thumb',
];

export const ALL_FINGERS: CompositionFinger[] = [
  ...LEFT_HAND_FINGERS,
  'right-thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
];

/** Euro amount as shown by pamsurin-front `formatPrice` (`4.00 €`). */
export function euro(amount: number): string {
  return `${(Math.round(amount * 100) / 100).toFixed(2)} €`;
}

export class ComposePages {
  constructor(private readonly page: Page) {}

  #isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) < 768;
  }

  async goto(): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    await dismissOnboardingIfPresent(this.page);
    if (this.#isMobile()) {
      if (await this.page.getByTestId(tid.tabBar.compose).isVisible().catch(() => false)) {
        await clickVisible(this.page.getByTestId(tid.tabBar.compose));
      } else {
        const panel = await openMobileNav(this.page);
        await clickMobileNavControl(
          panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="gallery-nail"]`),
        );
      }
    } else {
      const navLink = this.page
        .getByRole('banner')
        .locator('a[href$="/gallery-nail"], a[data-nav-key="gallery-nail"]')
        .first();
      if (await navLink.isVisible().catch(() => false)) {
        await clickVisible(navLink);
      } else {
        await this.page.goto(shopPath('/gallery-nail'));
      }
    }
    await reveal(this.page.getByTestId(tid.compose.page));
    // A gift receiver keeps `/gift/<token>` in the address bar while the shop
    // page underneath is the composer.
    const path = new URL(this.page.url()).pathname;
    if (!/\/gift\/(?!giver(?:\/|$))[^/]+\/?$/.test(path)) {
      await expect(this.page).toHaveURL(/\/gallery-nail\/?/);
    }
  }

  /** Open the composer already focused on one nail (share / product CTA). */
  async gotoWithProduct(productUid: string): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    await this.page.goto(shopPathWithSearch(`/gallery-nail?product=${encodeURIComponent(productUid)}`));
    await reveal(this.page.getByTestId(tid.compose.page));
    await expect(this.page.getByTestId(tid.gallery.lightbox)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
  }

  cardByUid(productUid: string) {
    return this.page.locator(
      `[data-testid="${tid.gallery.card}"][data-product-uid="${productUid}"]`,
    );
  }

  async #findNailCard(productUid: string): Promise<Locator> {
    await expect(this.page.getByTestId(tid.compose.page)).toBeVisible();
    const deadline = actionDeadline();
    while (Date.now() < deadline) {
      const card = this.cardByUid(productUid);
      if (await card.isVisible().catch(() => false)) {
        await reveal(card, { block: 'center' });
        return card;
      }
      await this.page.evaluate(() => window.scrollBy({ top: 280, behavior: 'instant' }));
      await this.page.waitForTimeout(200);
    }
    throw new Error(`Nail ${productUid} was not visible on /gallery-nail`);
  }

  async #selectShape(scope: Locator, shapeKey: string): Promise<void> {
    const shapeTag = scope.getByTestId(tid.gallery.shape).filter({ visible: true }).first();
    if (!(await shapeTag.isVisible().catch(() => false))) return;
    if ((await shapeTag.getAttribute('data-shape-key')) === shapeKey) return;
    await clickVisible(shapeTag);
    const option = this.page
      .locator(`[data-testid="${tid.gallery.shapeOption}"][data-shape-key="${shapeKey}"]`)
      .filter({ visible: true })
      .first();
    await clickVisible(option);
    await expect(shapeTag).toHaveAttribute('data-shape-key', shapeKey);
  }

  async #selectVariation(scope: Locator, variationKey: string): Promise<void> {
    const tag = scope.getByTestId(tid.compose.variation).filter({ visible: true }).first();
    if (!(await tag.isVisible().catch(() => false))) {
      throw new Error(`Expected a variation picker for option ${variationKey}`);
    }
    if ((await tag.getAttribute('data-variation-key')) === variationKey) return;
    await clickVisible(tag);
    const option = this.page
      .locator(`[data-testid="${tid.compose.variationOption}"][data-variation-key="${variationKey}"]`)
      .filter({ visible: true })
      .first();
    await clickVisible(option);
    await expect(tag).toHaveAttribute('data-variation-key', variationKey);
  }

  async #pickFinger(finger: CompositionFinger): Promise<void> {
    const lightbox = this.page.getByTestId(tid.gallery.lightbox);
    const target = lightbox
      .locator(`[data-testid="${tid.compose.handFinger}"][data-hand-finger="${finger}"]`)
      .filter({ visible: true })
      .first();
    await clickVisible(target);
    await expect(target).toHaveAttribute('aria-pressed', 'true');
  }

  /**
   * Open the nail zoom, optionally set shape/variation, choose a finger, and
   * place the nail into the composition carousel.
   */
  async addNail(
    productUid: E2eProductUid | string,
    finger: CompositionFinger,
    opts: { shapeKey?: string; variationKey?: string } = {},
  ): Promise<void> {
    const shapeKey = opts.shapeKey ?? 'amande';
    const card = await this.#findNailCard(productUid);
    const addBtn = card.getByTestId(tid.compose.addToComposition);
    if (await addBtn.isVisible().catch(() => false)) {
      await clickVisible(addBtn);
    } else {
      // Mobile purchase row hides Ajouter; the zoom control opens the same lightbox.
      await clickVisible(card.getByTestId(tid.gallery.zoom));
    }
    const lightbox = this.page.getByTestId(tid.gallery.lightbox);
    await expect(lightbox).toBeVisible({ timeout: 10_000 });
    await new GalleryPages(this.page).ensureLightboxSheetExpanded();
    await this.#selectShape(lightbox, shapeKey);
    if (opts.variationKey) await this.#selectVariation(lightbox, opts.variationKey);
    await this.#pickFinger(finger);
    await clickVisible(this.page.getByTestId(tid.compose.lightboxAdd));
    await expect(lightbox).toBeHidden({ timeout: 10_000 });
    await expect(
      this.page.locator(`[data-testid="${tid.compose.finger}"][data-finger="${finger}"]`),
    ).toBeVisible({ timeout: 10_000 });
  }

  async addNails(
    placements: Array<{
      uid: E2eProductUid | string;
      finger: CompositionFinger;
      shapeKey?: string;
      variationKey?: string;
    }>,
  ): Promise<void> {
    for (const placement of placements) {
      await this.addNail(placement.uid, placement.finger, {
        shapeKey: placement.shapeKey,
        variationKey: placement.variationKey,
      });
    }
  }

  nailCard(finger: CompositionFinger) {
    return this.page
      .locator(`[data-testid="${tid.compose.nailCard}"]`)
      .filter({ has: this.page.locator(`[data-finger="${finger}"]`) });
  }

  async removeNail(finger: CompositionFinger): Promise<void> {
    const card = this.nailCard(finger);
    await reveal(card);
    await clickVisible(card.getByRole('button', { name: /Retirer/i }));
    await expect(this.page.locator(`[data-testid="${tid.compose.finger}"][data-finger="${finger}"]`)).toHaveCount(
      0,
    );
  }

  async changeNailShape(finger: CompositionFinger, shapeKey: string): Promise<void> {
    const card = this.nailCard(finger);
    await reveal(card);
    await this.#selectShape(card, shapeKey);
  }

  async changeNailVariation(finger: CompositionFinger, variationKey: string): Promise<void> {
    const card = this.nailCard(finger);
    await reveal(card);
    await this.#selectVariation(card, variationKey);
  }

  async expectDesignPlaced(productUid: string): Promise<void> {
    const card = await this.#findNailCard(productUid);
    await expect(card).toHaveAttribute('data-placed', 'true');
  }

  async expectUnavailableStamp(finger: CompositionFinger, size: string): Promise<void> {
    const stamp = this.nailCard(finger).getByTestId(tid.compose.unavailableStamp);
    await expect(stamp).toBeVisible();
    await expect(stamp).toContainText(new RegExp(`taille\\s*${size}`, 'i'));
    await expect(stamp).toContainText(/indisponible/i);
  }

  async expectNoUnavailableStamp(finger: CompositionFinger): Promise<void> {
    await expect(this.nailCard(finger).getByTestId(tid.compose.unavailableStamp)).toHaveCount(0);
  }

  sizeChip(size: 'XS' | 'S' | 'M' | 'L') {
    return this.page.locator(`[data-testid="${tid.compose.sizeChip}"][data-size="${size}"]`);
  }

  async openSizeRequest(): Promise<Locator> {
    await clickVisible(this.page.getByTestId(tid.compose.sizeRequest));
    const modal = this.page.getByTestId(tid.compose.sizeRequestModal);
    await expect(modal).toBeVisible({ timeout: 10_000 });
    return modal;
  }

  /** Guest "Demande ta taille": email, optional note, then send. */
  async submitSizeRequest(modal: Locator, opts: { email: string; comment?: string }): Promise<void> {
    await fillVisible(modal.locator('input[type="email"]'), opts.email);
    if (opts.comment) {
      await clickVisible(modal.getByTestId(tid.cart.sizeRequestCommentToggle));
      await fillVisible(modal.getByTestId(tid.cart.sizeRequestComment), opts.comment);
    }
    await clickVisible(modal.getByTestId(tid.cart.sizeRequestSend));
    await expect(modal.getByTestId(tid.cart.sizeRequestOk)).toBeVisible({ timeout: 15_000 });
  }

  async setSize(size: 'XS' | 'S' | 'M' | 'L'): Promise<void> {
    const chip = this.page.locator(`[data-testid="${tid.compose.sizeChip}"][data-size="${size}"]`);
    if (await chip.count()) {
      await clickVisible(chip.first());
    } else {
      await clickVisible(this.page.getByTestId(tid.compose.sizeChip).filter({ hasText: size }));
    }
  }

  async setQuantity(quantity: number): Promise<void> {
    const root = this.page.getByTestId(tid.compose.page);
    const group = root.getByRole('group', { name: /^Quantité$/i });
    if (await group.isVisible().catch(() => false)) {
      const increase = group.getByRole('button', { name: /Augmenter/i });
      const decrease = group.getByRole('button', { name: /Diminuer|Réduire/i });
      for (let i = 0; i < 20; i += 1) {
        const text = (await group.innerText()).replace(/\s+/g, ' ');
        const match = text.match(/\b(\d+)\b/);
        const current = match ? Number(match[1]) : 1;
        if (current === quantity) return;
        if (current < quantity) await clickVisible(increase);
        else await clickVisible(decrease);
      }
      throw new Error(`Could not set composition quantity to ${quantity}`);
    }
    // Accessible name = label + visible count ("Quantité, 2").
    const trigger = root.getByRole('button', { name: /^Quantité, \d+$/i });
    if ((await trigger.innerText()).trim() === String(quantity)) return;
    await clickVisible(trigger);
    const list = this.page.getByRole('listbox', { name: /^Quantité$/i });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await clickVisible(list.getByRole('option', { name: String(quantity), exact: true }));
    await expect(list).toBeHidden({ timeout: 10_000 });
  }

  async expectTotal(amount: number): Promise<void> {
    await expect(this.page.getByTestId(tid.compose.total)).toContainText(euro(amount));
  }

  async submit(opts: { dismissDrawer?: boolean } = {}): Promise<void> {
    const dismissDrawer = opts.dismissDrawer ?? true;
    await clickVisible(this.page.getByTestId(tid.compose.submit));
    const drawer = this.page.getByTestId(tid.cart.drawer);
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(tid.compose.drawerLine).first()).toBeVisible();
    if (dismissDrawer) {
      await clickVisible(this.page.getByTestId(tid.cart.drawerContinue));
      await expect(drawer).toBeHidden({ timeout: 10_000 });
    }
  }

  async submitAndGoToCart(): Promise<void> {
    await this.submit({ dismissDrawer: false });
    await clickVisible(this.page.getByTestId(tid.cart.drawerCheckout));
    await reveal(this.page.getByTestId(tid.cart.page));
  }

  cartComposition(index = 0) {
    return this.page.getByTestId(tid.compose.cartLine).nth(index);
  }

  async expectCartGoods(amount: number): Promise<void> {
    await expect(this.page.getByTestId(tid.cart.subtotal)).toContainText(euro(amount));
  }

  async expectCartCompositionCount(count: number): Promise<void> {
    await expect(this.page.getByTestId(tid.compose.cartLine)).toHaveCount(count);
  }

  async increaseCartQuantity(index = 0): Promise<void> {
    const line = this.cartComposition(index);
    await reveal(line);
    const trigger = line.getByRole('button', { name: /^Quantité, \d+$/i });
    await clickVisible(trigger);
    const list = this.page.getByRole('listbox', { name: /^Quantité$/i });
    await expect(list).toBeVisible({ timeout: 10_000 });
    await clickVisible(list.getByRole('option', { name: '2', exact: true }));
    await expect(list).toBeHidden();
  }

  async changeCartSize(size: 'XS' | 'S' | 'M' | 'L', index = 0): Promise<void> {
    const line = this.cartComposition(index);
    await clickVisible(line.getByTestId(tid.compose.cartSize));
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await clickVisible(dialog.getByRole('button', { name: size, exact: true }));
    await clickVisible(dialog.getByRole('button', { name: /^Remplacer$/i }));
    await expect(line.getByTestId(tid.compose.cartSize)).toContainText(size);
  }

  async startEdit(index = 0): Promise<void> {
    const line = this.cartComposition(index);
    await clickVisible(line.getByRole('button', { name: /Changer la taille ou la forme/i }));
    const confirm = this.page.getByRole('dialog', { name: /Modifier ce set/i });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await clickVisible(confirm.getByRole('button', { name: /Continuer/i }));
    await reveal(this.page.getByTestId(tid.compose.page));
    await expect(this.page).toHaveURL(/composition=/);
  }

  async expectForcedEditRedirect(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: /en cours de modification/i });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await clickVisible(dialog.getByRole('button', { name: /J’ai compris|J'ai compris/i }));
    await reveal(this.page.getByTestId(tid.compose.page));
    await expect(this.page).toHaveURL(/composition=/);
  }

  async cancelEdit(): Promise<void> {
    await clickVisible(this.page.getByRole('button', { name: /Annuler la modification/i }));
    await reveal(this.page.getByTestId(tid.cart.page));
  }

  async updateCartFromComposer(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.compose.submit));
    await reveal(this.page.getByTestId(tid.cart.page));
  }

  async moveToWishlist(index = 0): Promise<void> {
    const line = this.cartComposition(index);
    await clickVisible(line.getByRole('button', { name: /Plus tard|Wish List|wishlist/i }).first());
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await clickVisible(dialog.getByRole('button', { name: /Mettre dans la Wish List/i }));
    await expect(line).toHaveCount(0, { timeout: 15_000 });
  }

  async activateWishlistCart(): Promise<void> {
    const tile = this.page
      .getByTestId(tid.cart.switch)
      .filter({ hasText: /Wish List/i })
      .first();
    await clickVisible(tile);
    await expect(this.page.getByTestId(tid.compose.cartLine).first()).toBeVisible({ timeout: 15_000 });
  }

  async deleteCartComposition(index = 0): Promise<void> {
    const line = this.cartComposition(index);
    const compositionId = await line.getAttribute('data-composition-id');
    await clickVisible(line.getByRole('button', { name: /^Supprimer$/i }).first());
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const remove = dialog.getByRole('button', { name: /Supprimer|Retirer/i }).last();
    await clickVisible(remove);
    if (compositionId) {
      await expect(
        this.page.locator(`[data-testid="${tid.compose.cartLine}"][data-composition-id="${compositionId}"]`),
      ).toHaveCount(0, { timeout: MAX_ACTION_TIMEOUT_MS });
    } else {
      await expect(line).toHaveCount(0, { timeout: MAX_ACTION_TIMEOUT_MS });
    }
  }

  async deleteFromDrawer(): Promise<void> {
    const before = await this.page.getByTestId(tid.compose.drawerLine).count();
    const drawerLine = this.page.getByTestId(tid.compose.drawerLine).first();
    await expect(drawerLine).toBeVisible();
    await clickVisible(drawerLine.getByRole('button', { name: /^Supprimer$/i }));
    await expect(this.page.getByTestId(tid.compose.drawerLine)).toHaveCount(Math.max(0, before - 1), {
      timeout: 10_000,
    });
  }

  async expectDrawerRemoveAbsent(): Promise<void> {
    const drawerLine = this.page.getByTestId(tid.compose.drawerLine).first();
    await expect(drawerLine).toBeVisible();
    await expect(drawerLine.getByRole('button', { name: /^Supprimer$/i })).toHaveCount(0);
  }

  /** Convenience: one nail of NAIL_A on the left thumb. */
  async buildOneNail(opts: { quantity?: number; size?: 'XS' | 'S' | 'M' | 'L' } = {}): Promise<void> {
    await this.addNail(E2E_PRODUCT_UIDS.NAIL_A, 'left-thumb');
    if (opts.size) await this.setSize(opts.size);
    if (opts.quantity && opts.quantity !== 1) await this.setQuantity(opts.quantity);
  }

  async buildOneHand(): Promise<void> {
    await this.addNails(LEFT_HAND_FINGERS.map((finger) => ({ uid: E2E_PRODUCT_UIDS.NAIL_A, finger })));
  }

  async buildOnePerHand(): Promise<void> {
    await this.addNails([
      { uid: E2E_PRODUCT_UIDS.NAIL_A, finger: 'left-thumb' },
      { uid: E2E_PRODUCT_UIDS.NAIL_B, finger: 'right-thumb' },
    ]);
  }

  async buildIncompleteThree(): Promise<void> {
    await this.addNails([
      { uid: E2E_PRODUCT_UIDS.NAIL_A, finger: 'left-thumb' },
      { uid: E2E_PRODUCT_UIDS.NAIL_A, finger: 'left-index' },
      { uid: E2E_PRODUCT_UIDS.NAIL_B, finger: 'left-middle' },
    ]);
  }

  /** Four nails: under the seeded tip-pot / volume `minNails` of 5. */
  async buildFourNails(): Promise<void> {
    await this.addNails(
      LEFT_HAND_FINGERS.slice(0, 4).map((finger) => ({ uid: E2E_PRODUCT_UIDS.NAIL_A, finger })),
    );
  }

  async buildFullSetWithPremiumVariation(): Promise<void> {
    const placements = ALL_FINGERS.map((finger, index) =>
      index === 0
        ? {
            uid: E2E_PRODUCT_UIDS.NAIL_V,
            finger,
            variationKey: E2E_VARIATION.PREMIUM,
          }
        : { uid: E2E_PRODUCT_UIDS.NAIL_A, finger },
    );
    await this.addNails(placements);
  }

  nailTitle(uid: E2eProductUid): string {
    return E2E_TITLES[uid];
  }

  defaultLength(): string {
    return E2E_LENGTH;
  }
}
