import type { APIRequestContext, Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { uniqueEmail } from './api.js';
import {
  TEST_GIFT_PIN,
  extractGiftGiverToken,
  loadGiverPortal,
  waitForGiftShareMail,
  type GiftPortal,
} from './gift.js';
import { decodeQrFromDataUri, expectGiftShareCardMail, tryDecodeQrFromPdf } from './gift-qr.js';
import { GiftPages, type GiftSurface } from './pages/gift.pages.js';
import { AuthPages } from './pages/auth.pages.js';
import { shopPath } from './shopPath.js';
import { startCustomerJourneyAtRoot } from './interact.js';
import { testPassword } from './env.js';
import { tid } from './selectors.js';

export interface CreatedShopOffer {
  email: string;
  sinceMs: number;
  offerId: string;
  giverToken: string;
  giverPath: string;
  receiverUrl: string;
  portal: GiftPortal;
}

export async function createGuestOfferFromShop(
  page: Page,
  request: APIRequestContext,
  opts: {
    hidePrices?: boolean;
    accessories?: boolean;
    accessoryEuros?: number;
    budgetEuros?: number;
  } = {},
): Promise<CreatedShopOffer> {
  const email = uniqueEmail('gift-marc');
  const sinceMs = Date.now() - 1_000;
  await startCustomerJourneyAtRoot(page);
  const gift = new GiftPages(page);
  await gift.openOffrirFromNav();
  await gift.completeValidGuestForm({ email, ...opts });
  await gift.submitCreate();
  await gift.expectGuestCreated();
  return finishCreatedOffer(request, email, sinceMs);
}

export async function registerMarcAndCreateOffer(
  page: Page,
  request: APIRequestContext,
  surface: GiftSurface,
  opts: {
    hidePrices?: boolean;
    accessories?: boolean;
    accessoryEuros?: number;
    budgetEuros?: number;
  } = {},
): Promise<CreatedShopOffer> {
  const email = uniqueEmail('gift-marc-auth');
  const sinceMs = Date.now() - 1_000;
  const auth = new AuthPages(page);
  if (surface === 'mobile') {
    await auth.registerFromMobileOrders(email, testPassword);
    // LoginPage navigates away from /login after onSuccess. Clicking Offrir
    // before that replace lands, then loses the create form.
    await expect(page).not.toHaveURL(/\/login\/?/, { timeout: 15_000 });
    await expect(page.getByTestId(tid.gallery.page)).toBeVisible({ timeout: 15_000 });
  } else {
    await auth.registerFromDesktopAccountModal(email, testPassword);
  }
  const gift = new GiftPages(page);
  await gift.openOffrirFromNav();
  await expect(page.getByTestId('gift-giver-email')).toHaveCount(0);
  await expect(page.locator('#gift-giver-name')).toBeVisible({ timeout: 15_000 });
  await gift.completeValidSignedInForm(opts);
  await gift.submitCreate();
  await gift.expectSignedInCreated();
  return finishCreatedOffer(request, email, sinceMs);
}

async function finishCreatedOffer(
  request: APIRequestContext,
  email: string,
  sinceMs: number,
): Promise<CreatedShopOffer> {
  const shareMail = await waitForGiftShareMail(email, sinceMs);
  expect(shareMail.html).not.toContain(TEST_GIFT_PIN);
  const giverToken = extractGiftGiverToken(shareMail.html);
  const portal = await loadGiverPortal(request, giverToken);
  const shareCard = portal.shareCard;
  if (!shareCard?.receiverUrl || !shareCard.qrDataUri) {
    throw new Error('giver portal has no share card QR');
  }
  const { pdfPath } = await expectGiftShareCardMail(shareMail, {
    pin: TEST_GIFT_PIN,
    receiverUrl: shareCard.receiverUrl,
  });
  const fromPdf = await tryDecodeQrFromPdf(pdfPath);
  const fromUri = await decodeQrFromDataUri(shareCard.qrDataUri);
  expect(fromUri).toBe(shareCard.receiverUrl);
  if (fromPdf) expect(fromPdf).toBe(shareCard.receiverUrl);
  const receiverUrl = shareCard.receiverUrl;

  const offerId = portal.id ?? portal.offerId;
  if (!offerId) throw new Error('giver portal has no offer id');

  return {
    email,
    sinceMs,
    offerId,
    giverToken,
    giverPath: shopPath(`/gift/giver/${giverToken}`),
    receiverUrl,
    portal,
  };
}
