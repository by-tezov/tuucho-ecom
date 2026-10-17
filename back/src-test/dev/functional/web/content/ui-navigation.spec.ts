// Desktop carousel and lightbox navigation coverage.
import { test, expect } from '../../../support/fixtures.js';
import type { Locator, Page } from 'patchright/test';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { tid } from '../../../support/selectors.js';
import { clickVisible, reveal } from '../../../support/interact.js';
import { shopPath } from '../../../support/shopPath.js';

async function openSeededProduct(page: Page, productUid: string): Promise<Locator> {
  await page.goto(shopPath(`/creations/${productUid.toLowerCase()}`));
  const product = page.getByTestId(tid.product.page);
  await expect(product).toHaveAttribute('data-product-uid', productUid, { timeout: 10_000 });
  return product;
}

async function loadedPhotoSource(image: Locator): Promise<string> {
  await expect(image).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(() => image.evaluate((node) => {
      const photo = node as HTMLImageElement;
      return photo.complete && photo.naturalWidth > 0;
    }))
    .toBe(true);
  const src = await image.getAttribute('src');
  expect(src).toBeTruthy();
  return src!;
}

/** Real press → drag → release so mouse and touch exercise the same Pointer Events path. */
async function dragHorizontally(
  page: Page,
  target: Locator,
  direction: 'next' | 'previous',
): Promise<void> {
  await reveal(target);
  const box = await target.boundingBox();
  if (!box) throw new Error('carousel gesture target has no bounding box');
  const startX = box.x + box.width * 0.62;
  const endX = startX + (direction === 'next' ? -1 : 1) * box.width * 0.42;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(endX, y, { steps: 12 });
  await page.mouse.up();
}

async function openFeatured(page: Page) {
  await page.goto(shopPath('/home'));
  const section = page.getByTestId(tid.home.featured);
  await expect(section).toBeVisible({ timeout: 15_000 });
  await reveal(section);
  const track = page.getByTestId(tid.home.featuredTrack);
  await expect(track).toBeVisible();
  await expect(page.getByTestId(tid.home.featuredCard).first()).toBeVisible();
  return track;
}

test.describe('Desktop UI navigation: carousel and lightbox', () => {
  test('accueil featured: next and previous scroll', async ({ page }) => {
    const track = await openFeatured(page);
    const next = page.getByTestId(tid.home.featuredNext);
    const prev = page.getByTestId(tid.home.featuredPrev);
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();
    const before = await track.evaluate((el) => (el as HTMLElement).scrollLeft);
    await clickVisible(next);
    await expect.poll(async () => track.evaluate((el) => (el as HTMLElement).scrollLeft)).toBeGreaterThan(before);
    await clickVisible(prev);
    await expect.poll(async () => track.evaluate((el) => (el as HTMLElement).scrollLeft)).toBeLessThanOrEqual(before + 2);
  });

  test('accueil featured: zoom lightbox opens', async ({ page }) => {
    await openFeatured(page);
    const zoom = page.getByTestId(tid.home.featuredZoom).first();
    await expect(zoom).toBeVisible();
    await clickVisible(zoom);
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeVisible();
    await clickVisible(page.getByTestId(tid.gallery.lightboxClose));
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeHidden();
  });

  test('accueil featured: CTA opens gallery', async ({ page }) => {
    await openFeatured(page);
    await clickVisible(page.getByTestId(tid.home.featuredCta));
    await expect(page).toHaveURL(/\/gallery/);
  });

  test('product photo slider: advances by buttons, drag, and dots', async ({ page }) => {
    const card = await openSeededProduct(page, E2E_PRODUCT_UIDS.A1);
    await reveal(card, { block: 'center' });

    const next = card.getByTestId(tid.gallery.carouselNext);
    await expect(next).toBeVisible({ timeout: 10_000 });
    const counter = card.getByTestId(tid.gallery.carouselCounter);
    const firstPhoto = await loadedPhotoSource(
      card.locator(`[data-testid="${tid.gallery.carouselImage}"][data-photo-index="0"]`),
    );
    await expect(counter).toContainText(/1\s*\/\s*3/);
    // The card's own slide transition can leave the button mid-animation —
    // reveal() above settles scroll position, this settles the card itself.
    await expect(next).toBeEnabled();
    await clickVisible(next);
    await expect(counter).toContainText(/2\s*\/\s*3/);
    const secondPhoto = await loadedPhotoSource(
      card.locator(`[data-testid="${tid.gallery.carouselImage}"][data-photo-index="1"]`),
    );
    expect(secondPhoto).not.toBe(firstPhoto);

    await dragHorizontally(page, card.getByTestId(tid.gallery.carousel), 'next');
    await expect(counter).toContainText(/3\s*\/\s*3/);
    const thirdPhoto = await loadedPhotoSource(
      card.locator(`[data-testid="${tid.gallery.carouselImage}"][data-photo-index="2"]`),
    );
    expect(thirdPhoto).not.toBe(secondPhoto);
    expect(thirdPhoto).not.toBe(firstPhoto);

    await clickVisible(card.getByTestId(tid.gallery.carouselDot).first());
    await expect(counter).toContainText(/1\s*\/\s*3/);
    await expect(
      card.locator(`[data-testid="${tid.gallery.carouselImage}"][data-photo-index="0"]`),
    ).toHaveAttribute('src', firstPhoto);
  });

  test('product single-photo item: hides carousel controls', async ({ page }) => {
    const singlePhotoCard = await openSeededProduct(page, E2E_PRODUCT_UIDS.A2);
    await expect(singlePhotoCard.getByTestId(tid.gallery.carouselImage)).toHaveCount(1);
    await expect(singlePhotoCard.getByTestId(tid.gallery.carouselNext)).toHaveCount(0);
    await expect(singlePhotoCard.getByTestId(tid.gallery.carouselDot)).toHaveCount(0);
  });

  test('lightbox modal zoom: buttons and mouse drag show every distinct photo', async ({ page }) => {
    const card = await openSeededProduct(page, E2E_PRODUCT_UIDS.A1);
    await clickVisible(card.getByTestId(tid.gallery.carouselImage).first());
    await reveal(page.getByTestId(tid.gallery.lightbox));

    const next = page.getByTestId(tid.gallery.lightboxNext);
    await expect(next).toBeVisible({ timeout: 10_000 });
    const lightbox = page.getByTestId(tid.gallery.lightbox);
    const counter = page.getByTestId(tid.gallery.lightboxCounter);
    const firstPhoto = await loadedPhotoSource(
      lightbox.locator(`[data-testid="${tid.gallery.lightboxImage}"][data-photo-index="0"]`),
    );
    await expect(counter).toContainText(/1\s*\/\s*3/);
    await clickVisible(next);
    await expect(counter).toContainText(/2\s*\/\s*3/);
    const secondPhoto = await loadedPhotoSource(
      lightbox.locator(`[data-testid="${tid.gallery.lightboxImage}"][data-photo-index="1"]`),
    );
    expect(secondPhoto).not.toBe(firstPhoto);

    await dragHorizontally(
      page,
      lightbox.getByTestId(tid.gallery.lightboxGestureSurface),
      'next',
    );
    await expect(counter).toContainText(/3\s*\/\s*3/);
    const thirdPhoto = await loadedPhotoSource(
      lightbox.locator(`[data-testid="${tid.gallery.lightboxImage}"][data-photo-index="2"]`),
    );
    expect(thirdPhoto).not.toBe(secondPhoto);
    expect(thirdPhoto).not.toBe(firstPhoto);

    await clickVisible(page.getByTestId(tid.gallery.lightboxPrev));
    await expect(counter).toContainText(/2\s*\/\s*3/);
    await expect(
      lightbox.locator(`[data-testid="${tid.gallery.lightboxImage}"][data-photo-index="1"]`),
    ).toHaveAttribute('src', secondPhoto);
    await clickVisible(page.getByTestId(tid.gallery.lightboxClose));
    await expect(page.getByTestId(tid.gallery.lightbox)).toBeHidden();
  });

});

const DESKTOP = { width: 1_280, height: 900 };

function desktopMainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: /navigation principale/i });
}

/** Collection / Composition may be top-level links or folded under Produits. */
async function clickDesktopProductLink(page: Page, label: RegExp): Promise<void> {
  const nav = desktopMainNav(page);
  const direct = nav.getByRole('link', { name: label });
  if ((await direct.count()) > 0) {
    await clickVisible(direct.first());
    return;
  }
  const products = nav.getByRole('button', { name: /^produits$/i });
  await expect(products).toBeVisible();
  if ((await products.getAttribute('aria-expanded')) !== 'true') {
    await clickVisible(products);
    await expect(products).toHaveAttribute('aria-expanded', 'true');
  }
  await clickVisible(nav.getByRole('link', { name: label }));
}

async function clickDesktopGuideLink(page: Page, label: RegExp): Promise<void> {
  const nav = desktopMainNav(page);
  const guides = nav.getByRole('button', { name: /^guides$/i });
  await expect(guides).toBeVisible();
  if ((await guides.getAttribute('aria-expanded')) !== 'true') {
    await clickVisible(guides);
    await expect(guides).toHaveAttribute('aria-expanded', 'true');
  }
  await clickVisible(nav.getByRole('link', { name: label }));
}

const HEADER_DESTINATIONS: Array<{
  title: string;
  label: RegExp;
  kind: 'product' | 'guide';
  url: RegExp;
  destination: string;
}> = [
  { title: 'Collection', label: /^collection$/i, kind: 'product', url: /\/gallery$/, destination: tid.gallery.page },
  { title: 'Composition', label: /^composition$/i, kind: 'product', url: /\/gallery-nail$/, destination: tid.compose.page },
  { title: 'Formes (capsules)', label: /^formes et longueurs$/i, kind: 'guide', url: /\/capsules$/, destination: 'page-h' },
];

test.describe('Desktop UI navigation: header menu', () => {
  for (const entry of HEADER_DESTINATIONS) {
    test(`header: ${entry.title} opens`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await page.goto(shopPath('/home'));
      await expect(desktopMainNav(page)).toBeVisible();
      if (entry.kind === 'product') await clickDesktopProductLink(page, entry.label);
      else await clickDesktopGuideLink(page, entry.label);
      await expect(page).toHaveURL(entry.url);
      await expect(page.getByTestId(entry.destination).or(page.locator(`#${entry.destination}`))).toBeVisible();
    });
  }
});
