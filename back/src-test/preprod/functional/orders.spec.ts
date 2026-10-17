import { test, expect } from '../../dev/support/fixtures.js';
import { uniqueEmail } from '../../dev/support/api.js';
import { AccountPages } from '../../dev/support/pages/account.pages.js';
import { clickVisible, viewOrdersControl } from '../../dev/support/interact.js';
import { tid } from '../../dev/support/selectors.js';
import {
  MOBILE,
  applyAmountVoucher,
  chooseDelivery,
  confirmGuestOrderMail,
  fillGalleryCartFromDrawer,
  payOrder,
  prepareConnectedShopper,
  type PreprodCourier,
  type PreprodPayment,
} from '../support/criticalPath.js';

const CASES: Array<{
  title: string;
  guest: boolean;
  payment: PreprodPayment;
  courier: PreprodCourier;
  voucher?: boolean;
}> = [
  { title: 'connected card + Colissimo + voucher', guest: false, payment: 'card', courier: 'colissimo-home', voucher: true },
  { title: 'connected PayPal + Mondial Relay', guest: false, payment: 'paypal', courier: 'mondial-relay-point' },
  { title: 'connected Google Pay + Colissimo', guest: false, payment: 'google_pay', courier: 'colissimo-home' },
  { title: 'connected Bancontact + Mondial Relay', guest: false, payment: 'bancontact', courier: 'mondial-relay-point' },
  { title: 'guest card + Mondial Relay + voucher', guest: true, payment: 'card', courier: 'mondial-relay-point', voucher: true },
  { title: 'guest PayPal + Colissimo', guest: true, payment: 'paypal', courier: 'colissimo-home' },
  { title: 'guest Google Pay + Mondial Relay', guest: true, payment: 'google_pay', courier: 'mondial-relay-point' },
  { title: 'guest Bancontact + Colissimo', guest: true, payment: 'bancontact', courier: 'colissimo-home' },
];

test.describe('Preprod mobile orders', () => {
  for (const scenario of CASES) {
    test(`mobile ${scenario.title}: the order is paid`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      const guestEmail = scenario.guest ? uniqueEmail('preprod-guest') : undefined;
      if (!scenario.guest) {
        await prepareConnectedShopper(page, scenario.courier);
      }
      await fillGalleryCartFromDrawer(page);
      await chooseDelivery(page, scenario.courier, { guest: scenario.guest });
      if (scenario.voucher) {
        await applyAmountVoucher(page, 5);
      }
      const sinceMs = Date.now() - 1_000;
      const orderNumber = await payOrder(page, scenario.payment, {
        guest: scenario.guest,
        email: guestEmail,
      });
      expect(orderNumber.length).toBeGreaterThan(3);
      if (scenario.guest && guestEmail) {
        await confirmGuestOrderMail(page, guestEmail, sinceMs);
        return;
      }
      await clickVisible(viewOrdersControl(page.getByTestId(tid.cart.orderSuccess)));
      const account = new AccountPages(page);
      await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    });
  }
});
