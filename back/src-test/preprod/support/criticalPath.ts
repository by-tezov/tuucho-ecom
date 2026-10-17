import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { uniqueEmail } from '../../dev/support/api.js';
import { testPassword } from '../../dev/support/env.js';
import { expectCartLoyaltyEarnMatchesMerchandise as expectEarn } from './loyalty.js';
import { AuthPages } from '../../dev/support/pages/auth.pages.js';
import { AddressPages } from '../../dev/support/pages/address.pages.js';
import { CartPages } from '../../dev/support/pages/cart.pages.js';
import { GalleryPages } from '../../dev/support/pages/gallery.pages.js';
import { extractGuestManageToken, extractTokenFromMail, waitForMail } from '../../dev/support/mail.js';
import { initVoucher } from '../../dev/support/ops.js';
import { tid } from '../../dev/support/selectors.js';
import { startCustomerJourneyAtRoot } from '../../dev/support/interact.js';
import { shopPathWithSearch } from '../../dev/support/shopPath.js';

export type PreprodPayment = 'card' | 'paypal' | 'google_pay' | 'bancontact';
export type PreprodCourier = 'colissimo-home' | 'mondial-relay-point';

export const MOBILE = { width: 390, height: 633 };

export async function registerConfirmAndLogin(page: Page): Promise<{ email: string }> {
  const email = uniqueEmail('preprod-auth');
  const auth = new AuthPages(page);
  const sinceMs = Date.now() - 1_000;
  await auth.registerFromMobileOrders(email, testPassword);
  const mail = await waitForMail({ kind: 'user', toIncludes: email, sinceMs, timeoutMs: 15_000 });
  const token = extractTokenFromMail(mail);
  await page.goto(shopPathWithSearch(`/account/confirm-email?token=${encodeURIComponent(token)}`));
  await expect(page.getByTestId(tid.auth.confirmEmailStatus)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(tid.auth.confirmEmailStatus)).toContainText(
    /confirmé|vérifi|déjà|succès|valid/i,
  );
  await auth.logout();
  await auth.loginFromMobileOrders(email, testPassword);
  await auth.expectMobileAuthenticated();
  return { email };
}

export async function fillGalleryCartFromDrawer(page: Page): Promise<CartPages> {
  await startCustomerJourneyAtRoot(page);
  const gallery = new GalleryPages(page);
  await gallery.addTopMiddleBottomToCart({ checkoutFromDrawer: true });
  const cart = new CartPages(page);
  await expect(page.getByTestId(tid.cart.page)).toBeVisible({ timeout: 15_000 });
  await cart.addFirstCarouselAccessory();
  await expectEarn(page);
  return cart;
}

export async function chooseDelivery(
  page: Page,
  courier: PreprodCourier,
  opts: { guest: boolean },
): Promise<void> {
  const cart = new CartPages(page);
  if (courier === 'mondial-relay-point') {
    if (opts.guest) {
      await cart.addMondialRelayPickupFromCart();
    } else {
      await cart.selectCourierByCode('mondial-relay-point');
      await cart.selectFirstAddress();
    }
    return;
  }
  await cart.selectCourierByCode('colissimo-home');
  if (opts.guest) {
    await cart.addHomeAddressFromCart();
  } else {
    await cart.selectFirstAddress();
  }
}

export async function applyAmountVoucher(page: Page, euros: number): Promise<string> {
  const name = `preprod-${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  const result = await initVoucher(name, { kind: 'amount', amount: euros }, { quantity: 1 });
  const code = String(result.code ?? '');
  if (!code) throw new Error(`voucher init returned no code: ${JSON.stringify(result)}`);
  const cart = new CartPages(page);
  await cart.applyVoucher(code);
  await expect(page.getByTestId(tid.cart.voucherSuccess)).toBeVisible({ timeout: 15_000 });
  const voucherRow = page.getByText(new RegExp(`Code promo\\s*:\\s*${code}`, 'i'));
  await expect(voucherRow).toBeVisible();
  await expect(voucherRow.locator('..')).toContainText(new RegExp(`[−-]\\s*${euros}[,.]00`));
  return code;
}

export async function payOrder(
  page: Page,
  payment: PreprodPayment,
  opts: { guest?: boolean; email?: string } = {},
): Promise<string> {
  const cart = new CartPages(page);
  if (payment === 'card') {
    if (opts.guest) {
      if (!opts.email) throw new Error('guest card pay needs an email');
      return cart.addGuestCardAndPayToSuccess(opts.email);
    }
    return cart.addTestCardAndPayToSuccess();
  }
  if (opts.guest) {
    if (!opts.email) throw new Error('guest redirect pay needs an email');
    await cart.fillGuestCheckoutIdentity(opts.email);
  }
  if (payment === 'paypal') {
    await cart.selectPaypal();
    await cart.openPayConfirm();
    return cart.completePaypalSuccessFlow();
  }
  if (payment === 'bancontact') {
    await cart.selectBancontact();
    await cart.openPayConfirm();
    return cart.completeBancontactSuccessFlow();
  }
  return cart.completeGooglePaySuccessFlow();
}

export async function confirmGuestOrderMail(page: Page, email: string, sinceMs: number): Promise<void> {
  const mail = await waitForMail({
    kind: 'user',
    toIncludes: email,
    sinceMs,
    timeoutMs: 15_000,
  });
  const token = extractGuestManageToken(mail);
  await page.goto(shopPathWithSearch(`/account/manage-order?token=${encodeURIComponent(token)}`));
  await expect(page.getByTestId(tid.orders.list).or(page.getByTestId(tid.orders.item)).first()).toBeVisible({
    timeout: 15_000,
  });
}

export async function prepareConnectedShopper(page: Page, courier: PreprodCourier): Promise<{ email: string }> {
  const { email } = await registerConfirmAndLogin(page);
  const auth = new AuthPages(page);
  await auth.openMobileAccount();
  const addresses = new AddressPages(page);
  if (courier === 'mondial-relay-point') {
    await addresses.addMondialRelayPickup();
  } else {
    await addresses.addHomeLivraison();
  }
  return { email };
}

export { uniqueEmail };
