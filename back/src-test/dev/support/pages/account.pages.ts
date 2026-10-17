import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { clickMobileNavControl, clickVisible, fillVisible, openMobileNav, reveal } from '../interact.js';
import { shopPath } from '../shopPath.js';

export class AccountPages {
  constructor(private readonly page: Page) {}

  #isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) < 768;
  }

  async #openAccountShell(): Promise<void> {
    if ((await this.page.getByTestId(tid.account.nav).count()) > 0) return;
    await clickVisible(this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }));
    await expect(this.page.getByTestId(tid.account.nav)).toBeVisible();
  }

  async #openTab(path: string): Promise<void> {
    if (this.#isMobile()) {
      const navKey: Record<string, string> = {
        '/account': 'account-profile',
        '/account/addresses': 'account-addresses',
        '/account/payment-methods': 'account-payment',
        '/orders': 'orders-active',
        '/orders/history': 'orders-history',
      };
      const key = navKey[path];
      if (!key) throw new Error(`No mobile navigation key for ${path}`);
      const panel = await openMobileNav(this.page);
      const group = panel.getByRole('button', {
        name: key.startsWith('account-') ? /^mon compte$/i : /^commandes$/i,
      });
      if ((await group.getAttribute('aria-expanded')) !== 'true') {
        await clickMobileNavControl(group);
        await expect(group).toHaveAttribute('aria-expanded', 'true');
      }
      await this.page.waitForTimeout(300);
      await clickMobileNavControl(panel.locator(`[data-testid="${tid.mobileNav.item}"][data-nav-key="${key}"]`));
      return;
    }
    await this.#openAccountShell();
    await clickVisible(this.page.getByTestId(tid.account.nav).locator(`a[href="${shopPath(path)}"]`));
  }

  async gotoProfile(): Promise<void> {
    await this.#openTab('/account');
    await reveal(this.page.getByTestId(tid.account.profileForm));
  }

  async fillProfile(firstName: string, lastName: string, phone: string): Promise<void> {
    await fillVisible(this.page.getByTestId(tid.account.firstName), firstName);
    await fillVisible(this.page.getByTestId(tid.account.lastName), lastName);
    await fillVisible(this.page.getByTestId(tid.account.phone), phone);
    await clickVisible(this.page.getByTestId(tid.account.saveProfile));
  }

  async gotoAddresses(): Promise<void> {
    await this.#openTab('/account/addresses');
    await reveal(this.page.getByTestId(tid.account.addressesPage));
  }

  async gotoPayments(): Promise<void> {
    await this.#openTab('/account/payment-methods');
    await reveal(this.page.getByTestId(tid.account.paymentPage));
  }

  async gotoOrders(): Promise<void> {
    await this.#openTab('/orders');
    await reveal(this.page.getByTestId(tid.orders.list));
  }

  async gotoHistory(): Promise<void> {
    await this.#openTab('/orders/history');
    await reveal(this.page.getByTestId(tid.orders.historyList));
  }

  /** Locate an order card by order number on the current orders/history page. */
  orderCard(orderNumber: string) {
    return this.page.locator(
      `[data-testid="${tid.orders.item}"][data-order-number="${orderNumber}"]`,
    );
  }

  async expectOrderStatus(
    orderNumber: string,
    status: 'confirmed' | 'in_preparation' | 'to_send' | 'sent' | 'disponible' | 'received' | 'cancelled',
    label: RegExp,
  ): Promise<void> {
    const card = this.orderCard(orderNumber);
    // The order list remounts just after checkout navigation. A visibility
    // assertion follows that replacement node; a separate scroll action can
    // hold a stale DOM handle between those two renders.
    await expect(card).toBeVisible();
    await expect(card.getByTestId(tid.orders.itemNumber)).toHaveText(orderNumber);
    const badge = card.getByTestId(tid.orders.itemStatus);
    await expect(badge).toHaveAttribute('data-order-status', status);
    await expect(badge).toContainText(label);
  }

  /** Reload orders (or history) so CLI status changes appear in the UI. */
  async reloadOrders(): Promise<void> {
    await this.page.reload();
    const list = this.page
      .getByTestId(tid.orders.list)
      .or(this.page.getByTestId(tid.orders.historyList));
    await reveal(list.first());
  }

  /** Customer self-cancel from active orders (confirmed + authorized only).
   * Cancelling shows a success notice that waits for Continue (no timed
   * redirect, RGAA 13.1), then the app navigates to /orders/history, where
   * the same order (now cancelled) legitimately re-renders with the
   * identical orders-item testid/order number. orderCard() isn't scoped to a
   * list container, so it would still match there; scope this wait to the
   * active orders list specifically so it reads "left the active list", not
   * "no longer exists anywhere". */
  async cancelOrder(orderNumber: string): Promise<void> {
    const card = this.orderCard(orderNumber);
    await reveal(card, { block: 'center', holdMs: 400 });
    await clickVisible(card.getByTestId(tid.orders.cancel));
    await clickVisible(this.page.getByTestId(tid.confirm.confirm));
    await clickVisible(this.page.getByTestId(tid.confirm.status).getByTestId(tid.confirm.confirm));
    const cardInActiveList = this.page
      .getByTestId(tid.orders.list)
      .locator(`[data-testid="${tid.orders.item}"][data-order-number="${orderNumber}"]`);
    await expect(cardInActiveList).toHaveCount(0, { timeout: 15_000 });
  }

  async expectCancelAvailable(orderNumber: string, available: boolean): Promise<void> {
    const card = this.orderCard(orderNumber);
    await reveal(card, { block: 'center' });
    const cancel = card.getByTestId(tid.orders.cancel);
    if (available) {
      await expect(cancel).toBeVisible();
    } else {
      await expect(cancel).toHaveCount(0);
    }
  }
}
