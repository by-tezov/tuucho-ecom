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
import { clickVisible, fillVisible, reveal, viewOrdersControl } from '../../../support/interact.js';

async function createConfirmedHomeOrder(page: import('patchright/test').Page): Promise<string> {
  const auth = new AuthPages(page);
  await auth.registerFromDesktopAccountModal(uniqueEmail('order-address-revision'), testPassword);
  await auth.openDesktopAccount();

  const addresses = new AddressPages(page);
  await addresses.addHomeLivraison();
  const gallery = new GalleryPages(page);
  await gallery.addSeededProduct(E2E_PRODUCT_UIDS.A1, { shapeKey: 'amande', size: 'M' });

  const cart = new CartPages(page);
  await cart.goto();
  await cart.selectFirstHomeCourier();
  await cart.selectFirstAddress();
  return cart.addTestCardAndPayToSuccess('Révision E2E');
}

async function fillOrderAddressForm(
  page: import('patchright/test').Page,
  label: string,
  line1: string,
  remember: boolean,
): Promise<void> {
  const form = page.getByTestId(tid.address.form);
  await reveal(form);
  const rememberBox = form.getByRole('checkbox', { name: /mémoriser cette adresse/i });
  // Checkout only asks for a reusable-address label once “remember” is
  // selected. A one-time billing address deliberately has no saved label.
  if (remember) {
    await rememberBox.check();
    await fillVisible(form.getByTestId(tid.address.label), label);
  } else {
    await expect(rememberBox).not.toBeChecked();
  }
  await fillVisible(form.getByTestId(tid.address.recipient), 'Ada Lovelace');
  await fillVisible(form.getByTestId(tid.address.phone), '0601020304');
  await fillVisible(form.getByTestId(tid.address.line1), line1);
  await fillVisible(form.getByTestId(tid.address.postal), '75001');
  await fillVisible(form.getByTestId(tid.address.city), 'Paris');
  await clickVisible(form.getByTestId(tid.address.submit));
  await expect(form).toBeHidden({ timeout: 15_000 });
}

async function openRevisionModal(page: import('patchright/test').Page) {
  const orderNumber = await createConfirmedHomeOrder(page);
  await clickVisible(viewOrdersControl(page));
  const account = new AccountPages(page);
  await account.expectOrderStatus(orderNumber, 'confirmed', /confirmée/i);
  const card = account.orderCard(orderNumber);
  await reveal(card, { block: 'center' });
  await clickVisible(card.getByRole('button', { name: /modifier les adresses/i }));
  const modal = page.getByRole('dialog', { name: /modifier les adresses/i });
  await expect(modal).toBeVisible({ timeout: 15_000 });
  return { orderNumber, card, modal };
}

async function closeRevisionModal(
  modal: import('patchright/test').Locator,
): Promise<void> {
  await clickVisible(modal.getByRole('button', { name: /^fermer$/i }));
  await expect(modal).toBeHidden({ timeout: 15_000 });
}

async function addRememberedShipping(page: import('patchright/test').Page, modal: import('patchright/test').Locator) {
  const originalShipping = modal.getByRole('radio', { name: /10 rue de test/i });
  await expect(originalShipping).toBeChecked();
  await clickVisible(modal.getByRole('button', { name: /ajouter une adresse/i }).first());
  await fillOrderAddressForm(page, 'Maison révision mémorisée', '20 rue de Révision', true);
  return originalShipping;
}

test.describe('Order address revisions', () => {
  test('web order address: a remembered shipping replacement auto-selects', async ({ page }) => {
    const { orderNumber, modal } = await openRevisionModal(page);
    const originalShipping = await addRememberedShipping(page, modal);
    const rememberedShipping = modal.getByRole('radio', { name: /20 rue de révision/i });
    await expect(rememberedShipping).toBeChecked();
    await expect(originalShipping).toBeVisible();
    await closeRevisionModal(modal);
    await setOrderStatus(orderNumber, 'cancelled');
  });

  test('web order address: a one-time billing address is selectable', async ({ page }) => {
    const { orderNumber, modal } = await openRevisionModal(page);
    await addRememberedShipping(page, modal);
    const sameAsShipping = modal.getByRole('checkbox', { name: /même adresse que la livraison/i });
    await sameAsShipping.uncheck();
    await clickVisible(modal.getByRole('button', { name: /ajouter une adresse/i }).last());
    await fillOrderAddressForm(page, 'Facturation ponctuelle', '30 rue de Facturation', false);
    await expect(modal.getByRole('radio', { name: /30 rue de facturation/i })).toBeChecked();
    await closeRevisionModal(modal);
    await setOrderStatus(orderNumber, 'cancelled');
  });

  test('web order address: reverse history lists the prior shipping and billing snapshots', async ({
    page,
  }) => {
    const { orderNumber, card, modal } = await openRevisionModal(page);
    await addRememberedShipping(page, modal);
    const sameAsShipping = modal.getByRole('checkbox', { name: /même adresse que la livraison/i });
    await sameAsShipping.uncheck();
    await clickVisible(modal.getByRole('button', { name: /ajouter une adresse/i }).last());
    await fillOrderAddressForm(page, 'Facturation ponctuelle', '30 rue de Facturation', false);
    await clickVisible(modal.getByRole('button', { name: /^enregistrer$/i }));
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await expect(card).toContainText('20 rue de Révision');
    await expect(card).toContainText('30 rue de Facturation');
    await clickVisible(card.getByRole('button', { name: /historique \(2\)/i }));
    const history = page.getByRole('dialog', { name: /historique des modifications/i });
    await expect(history).toBeVisible({ timeout: 15_000 });
    const entries = history.locator('li');
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toContainText(/adresse de facturation.*#2/i);
    await expect(entries.nth(0)).toContainText(/identique à la livraison/i);
    await expect(entries.nth(0)).toContainText(/intégrité \(rév\. 2\)/i);
    await expect(entries.nth(1)).toContainText(/adresse de livraison.*#1/i);
    await expect(entries.nth(1)).toContainText('10 rue de Test');
    await expect(entries.nth(1)).toContainText(/intégrité \(rév\. 1\)/i);
    await setOrderStatus(orderNumber, 'cancelled');
  });
});
