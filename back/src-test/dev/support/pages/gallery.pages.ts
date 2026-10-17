import type { Locator, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { E2E_PRODUCT_UIDS, type E2eProductUid } from '../catalog.js';
import {
  clickUnobscured,
  clickVisible,
  clickMobileNavControl,
  dismissOnboardingIfPresent,
  openMobileNav,
  prepareHumanPointer,
  reveal,
  startCustomerJourneyAtRoot,
} from '../interact.js';
import { withTestWindowFocus } from '../windowFocus.js';

const GALLERY_BROWSE_TIMEOUT_MS = 90_000;
const GALLERY_WHEEL_PAUSE_MS = 220;
const GALLERY_LOAD_PAUSE_MS = 450;
const GALLERY_STALL_ROUNDS_BEFORE_END = 10;

export class GalleryPages {
  constructor(private readonly page: Page) {}

  #isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) < 768;
  }

  async #galleryPageVisible(): Promise<boolean> {
    return this.page
      .getByTestId(tid.gallery.page)
      .isVisible()
      .catch(() => false);
  }

  async #onGallery(): Promise<boolean> {
    if (!(await this.#galleryPageVisible())) return false;
    const url = this.page.url();
    return /\/gallery\/?$/.test(url) || /\/gift\/(?!giver\/)[A-Fa-f0-9]{64}/i.test(url);
  }

  async #closeMobileNavIfOpen(): Promise<void> {
    if (!this.#isMobile()) return;
    const panel = this.page.getByTestId(tid.mobileNav.panel);
    if (!(await panel.isVisible().catch(() => false))) return;
    await this.page.keyboard.press('Escape');
    if (await panel.isVisible().catch(() => false)) {
      const toggle = this.page.getByTestId(tid.mobileNav.toggle);
      if ((await toggle.getAttribute('aria-expanded')) === 'true') {
        await clickVisible(toggle);
      }
    }
    await expect(panel).toBeHidden({ timeout: 3_000 });
  }

  async #openGalleryFromNav(): Promise<void> {
    if (this.#isMobile()) {
      const galleryTab = this.page.getByTestId(tid.tabBar.gallery);
      if (await galleryTab.isVisible().catch(() => false)) {
        await clickVisible(galleryTab);
      } else {
        // Account and intro pages hide the bottom tab bar, but Gallery is
        // still a first-class destination in the customer burger menu.
        const panel = await openMobileNav(this.page);
        await clickMobileNavControl(
          panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="gallery"]`),
        );
      }
    } else {
      await clickVisible(
        this.page.getByRole('banner').locator('a[href$="/gallery"]:not([data-nav-key])'),
      );
    }
    await reveal(this.page.getByTestId(tid.gallery.page));
    if (!(await this.page.getByTestId(tid.gift.lockBanner).isVisible().catch(() => false))) {
      await expect(this.page).toHaveURL(/\/gallery\/?$/);
    }
    await this.#closeMobileNavIfOpen();
  }

  async goto(): Promise<void> {
    if (this.page.url() === 'about:blank') await startCustomerJourneyAtRoot(this.page);
    await dismissOnboardingIfPresent(this.page);
    // Address/auth overlays reclaim their history entry on the next task.
    // Keep re-opening Collection until that reclaim has finished, otherwise
    // browsing starts on Mes adresses with the burger still open.
    await expect(async () => {
      if (!(await this.#onGallery())) await this.#openGalleryFromNav();
      await this.#closeMobileNavIfOpen();
      expect(await this.#onGallery()).toBe(true);
    }).toPass({ timeout: 8_000, intervals: [400, 400, 500] });
  }

  cards() {
    return this.page.getByTestId(tid.gallery.card);
  }

  cardByUid(productUid: string) {
    return this.page.locator(`[data-testid="${tid.gallery.card}"][data-product-uid="${productUid}"]`);
  }

  /** Hover a rendered card so a wheel gesture scrolls the document. */
  async #aimPointerAtGallery(): Promise<void> {
    const viewport = this.page.viewportSize() ?? { width: 1_280, height: 720 };
    const box = await this.cards().first().boundingBox();
    if (box) {
      const x = box.x + Math.min(Math.max(box.width / 2, 24), box.width - 24);
      const y = Math.min(Math.max(box.y + Math.min(80, box.height / 2), 80), viewport.height - 80);
      await this.page.mouse.move(x, y);
      return;
    }
    await this.page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height * 0.58));
  }

  async #blockingShopModal(): Promise<boolean> {
    return (await this.page.locator('dialog[open][aria-modal="true"]').count()) > 0;
  }

  async #scrollGalleryToTop(): Promise<void> {
    await prepareHumanPointer(this.page);
    await this.#aimPointerAtGallery();
    await this.page.keyboard.press('Home');
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
    if ((await this.#galleryScrollMetrics()).y <= 4) return;
    if (await this.#blockingShopModal()) {
      throw new Error('gallery scroll is blocked by a modal');
    }
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }

  async #galleryScrollMetrics(): Promise<{ y: number; maxY: number; height: number }> {
    return this.page.evaluate(() => {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      return { y: window.scrollY, maxY: Math.max(0, height - window.innerHeight), height };
    });
  }

  async #scrollGalleryDown(distance: number): Promise<void> {
    await prepareHumanPointer(this.page);
    const before = await this.#galleryScrollMetrics();
    await this.#aimPointerAtGallery();
    await this.page.mouse.wheel(0, distance);
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
    // A few pixels is not a step. An unfocused or covered window can report a
    // tiny wheel delta and then leave the infinite-scroll latch closed.
    const traveled = Math.min(Math.max(distance * 0.6, 80), 160);
    if ((await this.#galleryScrollMetrics()).y > before.y + traveled) return;

    await this.page.keyboard.press('PageDown');
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
    if ((await this.#galleryScrollMetrics()).y > before.y + traveled) return;

    if (await this.#blockingShopModal()) {
      throw new Error('gallery scroll is blocked by a modal');
    }
    await this.page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'instant' }), distance);
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
  }

  /** Drop the last virtual row, then return to the end so GalleryGrid asks
   * for the next page. A 180px nudge stays inside the overscan and does not. */
  async #rearmGalleryLoadMore(viewportHeight: number): Promise<void> {
    const release = viewportHeight + 1_200;
    await this.page.evaluate((dy) => window.scrollBy({ top: -dy, behavior: 'instant' }), release);
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
    await this.page.evaluate(() => {
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      window.scrollTo({ top: height, behavior: 'instant' });
    });
    await this.page.waitForTimeout(GALLERY_LOAD_PAUSE_MS);
  }

  async #visibleProductUids(): Promise<string[]> {
    // One snapshot. The grid is virtualized, so reading nth(i) one locator at
    // a time lets a recycled row detach and the next getAttribute wait out.
    const testId = tid.gallery.card;
    return this.page.evaluate((id) => {
      const uids: string[] = [];
      const nodes = document.querySelectorAll(`[data-testid="${CSS.escape(id)}"]`);
      for (const node of nodes) {
        const uid = node.getAttribute('data-product-uid');
        if (uid) uids.push(uid);
      }
      return uids;
    }, testId);
  }

  async #feedResultCount(): Promise<number | null> {
    const labelled = this.page.getByTestId(tid.gallery.resultCount);
    const label =
      (await labelled.count()) > 0
        ? labelled
        : this.page.locator('[aria-live="polite"]').filter({ hasText: /\d+\s+réalisations?/i });
    const text = (await label.first().textContent().catch(() => null))?.trim() ?? '';
    const match = /^(\d+)/.exec(text);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  async #nudgeLastCard(): Promise<void> {
    const last = this.cards().last();
    if ((await last.count()) === 0) return;
    await last.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  }

  /** Reveal a mounted virtualized card, or null if that UID is not in the window. */
  async #mountedCard(productUid: string): Promise<Locator | null> {
    const card = this.cardByUid(productUid);
    if ((await card.count()) === 0) return null;
    await reveal(card, { block: 'center' });
    return card;
  }

  /** Find a known E2E set by scrolling the gallery the way a customer would.
   * Keep this window in front for the whole browse: a covered window does not
   * mount the next virtualized rows, so the feed looks finished early. */
  async findSeededCard(productUid: string): Promise<Locator> {
    return withTestWindowFocus(this.page, () => this.#browseToSeededCard(productUid));
  }

  async #browseToSeededCard(productUid: string): Promise<Locator> {
    await this.goto();
    await expect(this.cards().first()).toBeVisible();
    await this.#scrollGalleryToTop();
    await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);

    const seen = new Set<string>();
    const deadline = Date.now() + GALLERY_BROWSE_TIMEOUT_MS;
    let idleRounds = 0;
    while (Date.now() < deadline) {
      if (!(await this.#onGallery())) await this.goto();
      for (const uid of await this.#visibleProductUids()) seen.add(uid);
      if (seen.has(productUid)) {
        const card = await this.#mountedCard(productUid);
        if (card) return card;
      }

      const before = seen.size;
      const viewportHeight = this.page.viewportSize()?.height ?? 720;
      await this.#scrollGalleryDown(Math.max(240, Math.floor(viewportHeight * 0.45)));
      await this.#nudgeLastCard();
      await this.page.waitForTimeout(GALLERY_LOAD_PAUSE_MS);

      for (const uid of await this.#visibleProductUids()) seen.add(uid);
      if (seen.has(productUid)) {
        const card = await this.#mountedCard(productUid);
        if (card) return card;
      }

      const total = await this.#feedResultCount();
      if (seen.size > before) {
        idleRounds = 0;
        continue;
      }
      idleRounds += 1;
      // Sitting on the last loaded row keeps the infinite-scroll latch
      // closed. Overscan is two rows, so a short nudge still renders that
      // row. Leave it, then come back to the end so the next page can load.
      await prepareHumanPointer(this.page);
      if (await this.#blockingShopModal()) {
        throw new Error('gallery scroll is blocked by a modal');
      }
      await this.#rearmGalleryLoadMore(viewportHeight);
      if (total != null && seen.size >= total) break;
      if (total == null && idleRounds >= GALLERY_STALL_ROUNDS_BEFORE_END) break;
    }
    throw new Error(
      `Seeded product ${productUid} was not reachable by scrolling the gallery (seen ${seen.size}).`,
    );
  }

  /** Open a known E2E set through its visible gallery title link. */
  async openZoom(index = 0): Promise<void> {
    const card = this.cards().nth(index);
    await reveal(card, { block: 'center' });
    // Prefer the dedicated zoom control (mobile purchase-row affordance).
    // Falling back to a photo tap covers desktop cards where the zoom
    // button is CSS-hidden and the carousel owns the open gesture.
    // Never click the title (gallery-card-link): that is the SEO
    // /creations/* route, not the PhotoLightbox.
    const zoom = card.getByTestId(tid.gallery.zoom);
    if (await zoom.isVisible().catch(() => false)) {
      await clickVisible(zoom);
    } else {
      await clickVisible(card.getByTestId(tid.gallery.carouselImage).first());
    }
    await reveal(this.page.getByTestId(tid.gallery.lightbox));
  }

  async #dismissDrawerOrLightbox(): Promise<void> {
    const drawer = this.page.getByTestId(tid.cart.drawer);
    const cont = this.page.getByTestId(tid.cart.drawerContinue);
    if (await cont.isVisible().catch(() => false)) {
      await clickVisible(cont);
    } else if (await drawer.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
    }
    // Continuer starts a 400ms exit transition. The checkout CTA stays in
    // the DOM until that finishes, so later cart.goto() must not treat it
    // as a live shortcut.
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    if (
      await this.page
        .getByTestId(tid.gallery.lightbox)
        .isVisible()
        .catch(() => false)
    ) {
      await this.page.keyboard.press('Escape');
    }
  }

  /** Reveal the mobile product controls with the sheet gesture offered by
   * the UI. The collapsed sheet deliberately keeps size/quantity below its
   * sticky purchase row, so scrolling its hidden DOM would not be a customer
   * action and can make the footer receive a tap intended for a size chip.
   * The drag starts on the title: an upward move on the sheet body grows it,
   * and a button would refuse that gesture. */
  async #expandMobileLightbox(lightbox: Locator): Promise<void> {
    await prepareHumanPointer(this.page);
    const title = lightbox.getByRole('heading').first();
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    if (!box) throw new Error('The mobile product sheet title has no draggable bounds.');
    const x = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endY = Math.max(40, startY - Math.round((this.page.viewportSize()?.height ?? 633) * 0.45));
    await this.page.mouse.move(x, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(x, endY, { steps: 12 });
    await this.page.mouse.up();
  }

  /** Desktop Ajouter is on the card, and it mounts only after stock and the
   * cart are ready. Virtualized rows are recycled, so the button is taken
   * from the page, not from a card index saved a moment earlier. */
  async #addFromDesktopCards(count: number, opts: { dismissDrawer?: boolean }): Promise<void> {
    let added = 0;
    let skipped = 0;
    while (added < count && skipped < 8) {
      const addBtn = this.page.getByTestId(tid.gallery.addToCart).nth(skipped);
      await expect(addBtn).toBeVisible();
      await expect(addBtn).toBeEnabled();
      await clickVisible(addBtn);
      const drawer = this.page.getByTestId(tid.cart.drawer);
      await expect(drawer).toBeVisible({ timeout: 8_000 });
      if (
        await this.page
          .getByTestId(tid.cart.drawerError)
          .isVisible()
          .catch(() => false)
      ) {
        await this.#dismissDrawerOrLightbox();
        skipped += 1;
        continue;
      }
      await expect(this.page.getByTestId(tid.cart.drawerSuccess)).toBeVisible({ timeout: 5_000 });
      added += 1;
      // Advance past this card so the next add is a different product (same
      // card again would only bump quantity on one cart line).
      skipped += 1;
      const moreToAdd = added < count;
      if (moreToAdd || opts.dismissDrawer !== false) {
        await this.#dismissDrawerOrLightbox();
        if (moreToAdd) await expect(this.page.getByTestId(tid.cart.drawer)).toBeHidden();
      }
    }
    expect(added, `expected to add ${count} in-stock product(s), added ${added}`).toBe(count);
  }

  /**
   * Add in-stock products. Skips sold-out cards (drawer error notice).
   * On mobile the card CTA is hidden — uses lightbox instead.
   */
  async addFirstAvailableToCart(count = 1, opts: { dismissDrawer?: boolean } = {}): Promise<void> {
    const mobile = (await this.page.viewportSize())?.width ?? 1280;
    const useLightbox = mobile <= 700;
    if (!useLightbox) {
      await this.#addFromDesktopCards(count, opts);
      return;
    }
    let added = 0;
    const total = await this.cards().count();

    for (let i = 0; i < total && added < count; i++) {
      const card = this.cards().nth(i);
      await reveal(card);

      const sizeButtons = card.getByTestId(tid.gallery.size);
      const sizeCount = await sizeButtons.count();
      for (let s = 0; s < sizeCount; s++) {
        const chip = sizeButtons.nth(s);
        if (!(await chip.isVisible().catch(() => false))) continue;
        const muted = await chip.evaluate((el) => /\b\w*[Mm]uted\b/.test(el.className));
        if (!muted) {
          await clickVisible(chip);
          break;
        }
      }

      // Sold-out cards can legitimately have no carousel/zoom mounted. Skip
      // those cards before opening the mobile lightbox and keep searching
      // for the first product that can actually be added.
      const hasZoom = (await card.getByTestId(tid.gallery.zoom).count()) > 0;
      const hasPhoto = (await card.getByTestId(tid.gallery.carouselImage).count()) > 0;
      if (!hasZoom && !hasPhoto) continue;
      await this.openZoom(i);
      const add = this.page.getByTestId(tid.gallery.lightboxAdd);
      await clickVisible(add);

      const drawer = this.page.getByTestId(tid.cart.drawer);
      await expect(drawer).toBeVisible({ timeout: 8_000 });

      if (
        await this.page
          .getByTestId(tid.cart.drawerError)
          .isVisible()
          .catch(() => false)
      ) {
        await this.#dismissDrawerOrLightbox();
        continue;
      }

      await expect(this.page.getByTestId(tid.cart.drawerSuccess)).toBeVisible({ timeout: 5_000 });
      added += 1;
      // Leave the last drawer open only when the caller wants that
      // confirmation. Continuer must run between adds: the open drawer
      // intercepts the next card, which is also what a shopper does.
      const moreToAdd = added < count;
      if (moreToAdd || opts.dismissDrawer !== false) {
        await this.#dismissDrawerOrLightbox();
        if (moreToAdd) await expect(this.page.getByTestId(tid.cart.drawer)).toBeHidden();
      }
    }

    expect(added, `expected to add ${count} in-stock product(s), added ${added}`).toBe(count);
  }

  /** Open the card's PhotoLightbox (never the SEO /creations title link),
   * pick shape/size, and add. Desktop and mobile share this path: the title
   * is crawl-only; shop flows zoom the card instead. */
  async #addSeededProductFromLightbox(
    productUid: string,
    shapeKey: string,
    size: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const lightbox = await this.openZoomForUid(productUid);
      await this.#selectLightboxShape(lightbox, shapeKey);
      await this.ensureLightboxSheetExpanded();
      const sizeChip = lightbox
        .locator(`[data-testid="${tid.gallery.size}"][data-size="${size}"]`)
        .filter({ visible: true })
        .first();
      await clickVisible(sizeChip);
      await expect(sizeChip).toHaveAttribute('aria-pressed', 'true');
      await dismissOnboardingIfPresent(this.page);
      const add = this.page.getByTestId(tid.gallery.lightboxAdd);
      await expect(add).toBeEnabled();
      await clickUnobscured(add);
      const drawer = this.page.getByTestId(tid.cart.drawer);
      const adding = this.page.getByRole('alertdialog', { name: /ajout au panier/i });
      const added = await drawer
        .or(adding)
        .first()
        .isVisible()
        .catch(() => false);
      if (added) return;
      if (attempt === 0 && !(await this.#onGallery())) {
        await this.goto();
        continue;
      }
      await expect(drawer.or(adding).first()).toBeVisible({ timeout: 15_000 });
      return;
    }
  }

  /**
   * ShapeTag shows only the active shape; other keys live in a body-portaled
   * listbox (`gallery-shape-option`). Click the visible tag only when the
   * active key differs from the requested one.
   */
  async #selectLightboxShape(lightbox: Locator, shapeKey: string): Promise<void> {
    const shapeTag = lightbox
      .getByTestId(tid.gallery.shape)
      .filter({ visible: true })
      .first();
    await reveal(shapeTag);
    if ((await shapeTag.getAttribute('data-shape-key')) === shapeKey) return;
    await clickVisible(shapeTag);
    const option = this.page
      .locator(`[data-testid="${tid.gallery.shapeOption}"][data-shape-key="${shapeKey}"]`)
      .filter({ visible: true })
      .first();
    await clickVisible(option);
    await expect(shapeTag).toHaveAttribute('data-shape-key', shapeKey);
  }

  /** Find a seeded product, then add the requested shape/size via lightbox. */
  async addSeededProduct(
    productUid: E2eProductUid | string,
    opts: { shapeKey?: string; size?: string; dismissDrawer?: boolean } = {},
  ): Promise<void> {
    const shapeKey = opts.shapeKey ?? 'amande';
    const size = opts.size ?? 'M';
    const dismissDrawer = opts.dismissDrawer ?? true;

    await this.#addSeededProductFromLightbox(productUid, shapeKey, size);

    const drawer = this.page.getByTestId(tid.cart.drawer);
    const adding = this.page.getByRole('alertdialog', { name: /ajout au panier/i });
    await expect(drawer.or(adding).first()).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    if (
      await this.page
        .getByTestId(tid.cart.drawerError)
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error(`Failed to add ${productUid} ${shapeKey}/${size} — drawer error`);
    }
    await expect(this.page.getByTestId(tid.cart.drawerSuccess)).toBeVisible({ timeout: 5_000 });
    await this.page.waitForTimeout(400);
    if (dismissDrawer) {
      await this.#dismissDrawerOrLightbox();
      await expect(this.page.getByTestId(tid.cart.drawer)).toBeHidden();
      await expect(this.page.getByTestId(tid.gallery.lightbox)).toBeHidden();
    }
  }

  async toggleFavorite(index = 0): Promise<void> {
    const card = this.cards().nth(index);
    await reveal(card);
    await clickVisible(card.getByTestId(tid.gallery.favorite));
  }

  async showFavoritesOnly(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.gallery.favoritesOnly));
  }

  async showUserLibraryOnly(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.gallery.userLibraryOnly));
  }

  /** Same breakpoint as PhotoLightbox / QuantityControl — not the 768px tab bar. */
  #isLightboxSheetViewport(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) <= 1023;
  }

  quantityTrigger(scope: Locator = this.page.getByTestId(tid.gallery.lightbox)) {
    // Accessible name is "Quantité, N" so the visible count stays in the name.
    return scope.getByRole('button', { name: /^quantité, \d+$/i });
  }

  quantityList() {
    return this.page.getByRole('listbox', { name: /^quantité$/i });
  }

  async openZoomForUid(productUid: string): Promise<Locator> {
    const lightbox = this.page.getByTestId(tid.gallery.lightbox);
    // Virtualized gallery cards often fail Patchright's scrollIntoViewIfNeeded
    // stability loop on mobile. findSeededCard already scrolled the card into
    // the feed — click via bounding box / mouse instead of reveal().
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await lightbox.isVisible().catch(() => false)) {
        await expect(lightbox).toBeVisible();
        return lightbox;
      }
      const card = await this.findSeededCard(productUid);
      await prepareHumanPointer(this.page);
      await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
      if (await lightbox.isVisible().catch(() => false)) {
        await expect(lightbox).toBeVisible();
        return lightbox;
      }
      const zoom = card.getByTestId(tid.gallery.zoom);
      const photo = card.getByTestId(tid.gallery.carouselImage).first();
      let box = await zoom.boundingBox();
      if (!box || box.width <= 0) box = await photo.boundingBox();
      if (!box) {
        await this.page.evaluate(() => window.scrollBy({ top: -120, behavior: 'instant' }));
        await this.page.waitForTimeout(GALLERY_LOAD_PAUSE_MS);
        continue;
      }
      const viewport = this.page.viewportSize();
      if (viewport && (box.y < 8 || box.y + box.height > viewport.height - 8)) {
        await this.page.evaluate(
          ({ top }) => window.scrollBy({ top, behavior: 'instant' }),
          { top: box.y - viewport.height / 2 },
        );
        await this.page.waitForTimeout(GALLERY_WHEEL_PAUSE_MS);
        box = (await zoom.boundingBox()) ?? (await photo.boundingBox());
        if (!box) continue;
      }
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      try {
        await expect(lightbox).toBeVisible({ timeout: 3_000 });
        return lightbox;
      } catch {
        // Tap may have been eaten by carousel drag; retry from a fresh find.
      }
    }
    throw new Error(`could not open zoom for ${productUid}`);
  }

  async ensureLightboxSheetExpanded(): Promise<void> {
    if (!this.#isLightboxSheetViewport()) return;
    await this.#expandMobileLightbox(this.page.getByTestId(tid.gallery.lightbox));
  }

  async openQuantityPicker(scope: Locator): Promise<Locator> {
    await clickUnobscured(this.quantityTrigger(scope));
    const list = this.quantityList();
    await expect(list).toBeVisible();
    return list;
  }

  async chooseQuantity(value: number): Promise<void> {
    const list = this.quantityList();
    await expect(list).toBeVisible();
    await clickUnobscured(list.getByRole('option', { name: String(value), exact: true }));
    await expect(list).toBeHidden();
  }

  async openSizeRequestFromUnavailableSize(size: string): Promise<Locator> {
    await this.ensureLightboxSheetExpanded();
    const lightbox = this.page.getByTestId(tid.gallery.lightbox);
    await clickUnobscured(
      lightbox
        .locator(`[data-testid="${tid.gallery.size}"][data-size="${size}"]`)
        .filter({ visible: true })
        .first(),
    );
    const modal = this.page.getByTestId(tid.gallery.sizeRequestModal);
    await expect(modal).toBeVisible();
    return modal;
  }

  /** Dimmed area of Demande ta taille (not the sheet body). */
  async closeSizeRequestByBackdrop(): Promise<void> {
    const modal = this.page.getByTestId(tid.gallery.sizeRequestModal);
    await expect(modal).toBeVisible();
    const dialog = this.page.getByRole('dialog', { name: /^Demande ta taille$/i });
    await expect(dialog).toBeVisible();
    // The backdrop control is aria-hidden (the panel's Fermer and Escape
    // already close the dialog). It is not in the accessibility tree, so
    // hit the full-screen button itself. Top edge stays on that control,
    // not on the sheet.
    const dismiss = dialog.locator('button[aria-hidden="true"]');
    await prepareHumanPointer(this.page);
    await dismiss.click({ position: { x: 24, y: 24 }, timeout: 10_000 });
    await expect(modal).toBeHidden();
  }

  async closeSizeRequestByCloseButton(): Promise<void> {
    const modal = this.page.getByTestId(tid.gallery.sizeRequestModal);
    await expect(modal).toBeVisible();
    await clickVisible(modal.getByRole('button', { name: /^Fermer$/i }));
    await expect(modal).toBeHidden();
  }

  /**
   * Regression: after Demande ta taille, closing zoom must not open another
   * lightbox (click-through / leftover history.back).
   */
  async assertSizeRequestThenLightboxClosesOnce(
    dismiss: 'backdrop' | 'close',
    unavailableSize = 'XS',
  ): Promise<void> {
    await this.openZoomForUid(E2E_PRODUCT_UIDS.OOS);
    await expect(this.page.getByTestId(tid.gallery.lightbox)).toHaveCount(1);
    await this.openSizeRequestFromUnavailableSize(unavailableSize);
    if (dismiss === 'backdrop') {
      await this.closeSizeRequestByBackdrop();
    } else {
      await this.closeSizeRequestByCloseButton();
    }
    await expect(this.page.getByTestId(tid.gallery.sizeRequestModal)).toHaveCount(0);
    await expect(this.page.getByTestId(tid.gallery.lightbox)).toHaveCount(1);

    await clickVisible(this.page.getByTestId(tid.gallery.lightboxClose));
    await expect(this.page.getByTestId(tid.gallery.lightbox)).toHaveCount(0);
    // Leftover pointer / history must not revive zoom or Demande.
    await this.page.waitForTimeout(400);
    await expect(this.page.getByTestId(tid.gallery.lightbox)).toHaveCount(0);
    await expect(this.page.getByTestId(tid.gallery.sizeRequestModal)).toHaveCount(0);
  }

  /** Public gallery count from the "N réalisations" live region. */
  async realisationCount(): Promise<number> {
    await this.goto();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const total = await this.#feedResultCount();
      if (total != null && total > 0) return total;
      await this.page.waitForTimeout(250);
    }
    throw new Error('gallery did not expose a réalisation count');
  }

  /**
   * Scroll the live feed from the top and remember UIDs in first-seen order
   * until `limit` unique cards have appeared (or the grid stalls).
   */
  async collectFeedUids(limit: number): Promise<string[]> {
    return withTestWindowFocus(this.page, () => this.#collectFeedUids(limit));
  }

  async #collectFeedUids(limit: number): Promise<string[]> {
    await this.goto();
    const ordered: string[] = [];
    const seen = new Set<string>();
    const deadline = Date.now() + GALLERY_BROWSE_TIMEOUT_MS;
    let idleRounds = 0;
    while (Date.now() < deadline && ordered.length < limit) {
      if (!(await this.#onGallery())) await this.goto();
      for (const uid of await this.#visibleProductUids()) {
        if (seen.has(uid)) continue;
        seen.add(uid);
        ordered.push(uid);
        if (ordered.length >= limit) return ordered;
      }
      const before = ordered.length;
      const viewportHeight = this.page.viewportSize()?.height ?? 720;
      await this.#scrollGalleryDown(Math.max(240, Math.floor(viewportHeight * 0.45)));
      await this.#nudgeLastCard();
      await this.page.waitForTimeout(GALLERY_LOAD_PAUSE_MS);
      if (ordered.length > before) {
        idleRounds = 0;
        continue;
      }
      idleRounds += 1;
      await prepareHumanPointer(this.page);
      if (await this.#blockingShopModal()) {
        throw new Error('gallery scroll is blocked by a modal');
      }
      await this.#rearmGalleryLoadMore(viewportHeight);
      if (idleRounds >= GALLERY_STALL_ROUNDS_BEFORE_END) break;
    }
    return ordered;
  }

  async #randomAvailableLightboxSize(lightbox: Locator): Promise<string> {
    await this.ensureLightboxSheetExpanded();
    const chips = lightbox.getByTestId(tid.gallery.size).filter({ visible: true });
    await expect(chips.first()).toBeVisible({ timeout: 15_000 });
    const count = await chips.count();
    const available: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const chip = chips.nth(i);
      const inStockAttr = await chip.getAttribute('data-in-stock');
      const className = (await chip.getAttribute('class')) ?? '';
      const disabled = (await chip.getAttribute('aria-disabled')) === 'true';
      const unavailable =
        inStockAttr === 'false' ||
        disabled ||
        /unavailable/i.test(className) ||
        /\b\w*[Mm]uted\b/.test(className);
      const size = await chip.getAttribute('data-size');
      if (inStockAttr === 'true' && size) {
        available.push(size);
        continue;
      }
      if (!unavailable && size) available.push(size);
    }
    if (available.length === 0) {
      throw new Error('product has no in-stock size in the lightbox');
    }
    return available[Math.floor(Math.random() * available.length)]!;
  }

  /** Add a live catalogue set: open mobile lightbox, pick a random in-stock size. */
  async addLiveProduct(productUid: string, opts: { dismissDrawer?: boolean } = {}): Promise<void> {
    const dismissDrawer = opts.dismissDrawer ?? true;
    const lightbox = await this.openZoomForUid(productUid);
    const size = await this.#randomAvailableLightboxSize(lightbox);
    const sizeChip = lightbox
      .locator(`[data-testid="${tid.gallery.size}"][data-size="${size}"]`)
      .filter({ visible: true })
      .first();
    await clickVisible(sizeChip);
    await expect(this.page.getByTestId(tid.gallery.sizeRequestModal)).toBeHidden();
    await expect(sizeChip).toHaveAttribute('aria-pressed', 'true');
    await dismissOnboardingIfPresent(this.page);
    const add = this.page.getByTestId(tid.gallery.lightboxAdd);
    await expect(add).toBeEnabled();
    await clickUnobscured(add);
    const drawer = this.page.getByTestId(tid.cart.drawer);
    const adding = this.page.getByRole('alertdialog', { name: /ajout au panier/i });
    await expect(drawer.or(adding).first()).toBeVisible({ timeout: 15_000 });
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    if (
      await this.page
        .getByTestId(tid.cart.drawerError)
        .isVisible()
        .catch(() => false)
    ) {
      throw new Error(`Failed to add live product ${productUid} size ${size}`);
    }
    await expect(this.page.getByTestId(tid.cart.drawerSuccess)).toBeVisible({ timeout: 5_000 });
    await this.page.waitForTimeout(400);
    if (dismissDrawer) {
      await this.#dismissDrawerOrLightbox();
      await expect(this.page.getByTestId(tid.cart.drawer)).toBeHidden();
      await expect(this.page.getByTestId(tid.gallery.lightbox)).toBeHidden();
    }
  }

  /**
   * Pick the first, middle, and last réalisations (from the gallery count),
   * add each with a random available size, and on the last add leave the
   * drawer so the caller can Finaliser ma commande.
   */
  async addTopMiddleBottomToCart(opts: { checkoutFromDrawer?: boolean } = {}): Promise<void> {
    const total = await this.realisationCount();
    if (total < 3) throw new Error(`gallery has ${total} réalisations; need at least 3`);
    const indices = [0, Math.floor((total - 1) / 2), total - 1];
    const needed = indices[indices.length - 1]! + 1;
    const uids = await this.collectFeedUids(needed);
    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i]!;
      const uid = uids[index];
      if (!uid) {
        throw new Error(`gallery feed ended at ${uids.length} cards; needed index ${index}`);
      }
      const last = i === indices.length - 1;
      await this.addLiveProduct(uid, {
        dismissDrawer: !(last && opts.checkoutFromDrawer),
      });
      if (last && opts.checkoutFromDrawer) {
        await clickVisible(this.page.getByTestId(tid.cart.drawerCheckout));
        await expect(this.page.getByTestId(tid.cart.page)).toBeVisible({ timeout: 15_000 });
      }
    }
  }
}
