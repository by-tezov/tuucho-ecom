import { test, expect } from '../../../support/fixtures.js';
import { uniqueEmail } from '../../../support/api.js';
import { testPassword } from '../../../support/env.js';
import { E2E_PRODUCT_UIDS } from '../../../support/catalog.js';
import { AuthPages } from '../../../support/pages/auth.pages.js';
import { AddressPages } from '../../../support/pages/address.pages.js';
import { GalleryPages } from '../../../support/pages/gallery.pages.js';
import { CartPages } from '../../../support/pages/cart.pages.js';
import { AccountPages } from '../../../support/pages/account.pages.js';
import { tid } from '../../../support/selectors.js';
import { setOrderStatus } from '../../../support/ops.js';
import { clickVisible, fillVisible, reveal } from '../../../support/interact.js';

test.describe('Mobile order address revisions', () => {
  test('mobile bottom sheet: keeps the current home address and auto-selects a remembered compatible replacement', async ({
    page,
  }) => {
    const auth = new AuthPages(page);
    await auth.registerFromMobileOrders(uniqueEmail('mobile-order-address-revision'), testPassword);
    await auth.openMobileAccount();

    const addresses = new AddressPages(page);
    await addresses.addHomeLivraison();
    const gallery = new GalleryPages(page);
    await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });
    const cart = new CartPages(page);
    await cart.goto();
    await cart.selectFirstHomeCourier();
    await cart.selectFirstAddress();
    const orderNumber = await cart.addTestCardAndPayToSuccess('Révision mobile E2E');

    const account = new AccountPages(page);
    await account.gotoOrders();
    await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
    const card = account.orderCard(orderNumber);
    await reveal(card, { block: 'center' });
    await clickVisible(card.getByRole('button', { name: /modifier les adresses/i }));

    const modal = page.getByRole('dialog', { name: /modifier les adresses/i });
    await expect(modal).toBeVisible({ timeout: 15_000 });
    // Mobile uses the application bottom-sheet shape (its lower corners are
    // square), not the rounded desktop dialog shape.
    await expect(modal).toHaveCSS('border-bottom-left-radius', '0px');

    const current = modal.getByRole('radio', { name: /10 rue de test/i });
    await expect(current).toBeChecked();
    await clickVisible(modal.getByRole('button', { name: /ajouter une adresse/i }).first());
    const form = page.getByTestId(tid.address.form);
    await reveal(form);
    await form.getByRole('checkbox', { name: /mémoriser cette adresse/i }).check();
    await fillVisible(form.getByTestId(tid.address.label), 'Maison mobile mémorisée');
    await fillVisible(form.getByTestId(tid.address.recipient), 'Ada Lovelace');
    await fillVisible(form.getByTestId(tid.address.phone), '0601020304');
    await fillVisible(form.getByTestId(tid.address.line1), '25 rue Mobile');
    await fillVisible(form.getByTestId(tid.address.postal), '75001');
    await fillVisible(form.getByTestId(tid.address.city), 'Paris');
    await form.getByRole('checkbox', { name: /mémoriser cette adresse/i }).check();
    await clickVisible(form.getByTestId(tid.address.submit));
    await expect(form).toBeHidden({ timeout: 15_000 });

    const replacement = modal.getByRole('radio', { name: /25 rue mobile/i });
    await expect(replacement).toBeChecked();
    await expect(current).toBeVisible();
    await clickVisible(modal.getByRole('button', { name: /^enregistrer$/i }));
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await expect(card).toContainText('25 rue Mobile');

    await setOrderStatus(orderNumber, 'cancelled');
  });
});
