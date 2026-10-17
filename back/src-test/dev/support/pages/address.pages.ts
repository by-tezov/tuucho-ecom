import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../selectors.js';
import { clickMobileNavControl, clickVisible, fillVisible, openMobileNav, reveal } from '../interact.js';
import { MAX_ACTION_TIMEOUT_MS } from '../timeouts.js';
import { shopPath } from '../shopPath.js';

export class AddressPages {
  constructor(private readonly page: Page) {}

  #isMobile(): boolean {
    return (this.page.viewportSize()?.width ?? 1_280) < 768;
  }

  async openAddHomeFromAccount(): Promise<void> {
    if (this.#isMobile()) {
      const panel = await openMobileNav(this.page);
      const group = panel.getByRole('button', { name: /^mon compte$/i });
      const addresses = panel.locator(
        `[data-testid="${tid.mobileNav.item}"][data-nav-key="account-addresses"]`,
      );
      // Accordion children sit in a 0fr→1fr grid. aria-expanded can flip before
      // the track has height, so Playwright still reports the link as hidden.
      if ((await group.getAttribute('aria-expanded')) !== 'true') {
        await clickMobileNavControl(group);
        await expect(group).toHaveAttribute('aria-expanded', 'true');
      }
      await expect(addresses).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
      await addresses.evaluate((el: HTMLElement) => {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      await clickMobileNavControl(addresses);
      await reveal(this.page.getByTestId(tid.account.addressesPage));
      await clickVisible(this.page.getByTestId(tid.account.addAddress));
      await reveal(this.page.getByTestId(tid.address.form));
      return;
    }
    const accountNav = this.page.getByTestId(tid.account.nav);
    if ((await accountNav.count()) === 0) {
      await clickVisible(this.page.getByRole('banner').getByRole('button', { name: 'Mon compte', exact: true }));
      await expect(accountNav).toBeVisible();
    }
    await clickVisible(accountNav.locator(`a[href="${shopPath('/account/addresses')}"]`));
    await reveal(this.page.getByTestId(tid.account.addressesPage));
    await clickVisible(this.page.getByTestId(tid.account.addAddress));
    await reveal(this.page.getByTestId(tid.address.form));
  }

  async fillHomeAddress(opts: {
    recipient: string;
    line1: string;
    postal: string;
    city: string;
    phone?: string;
    label?: string;
    company?: string;
    line2?: string;
    notes?: string;
  }): Promise<void> {
    const form = this.page.getByTestId(tid.address.form);
    await reveal(form);
    if (opts.label) await fillVisible(form.getByTestId(tid.address.label), opts.label);

    if (opts.company) {
      await clickVisible(form.getByTestId(tid.address.addCompany));
      await fillVisible(form.getByTestId(tid.address.company), opts.company);
    }

    await fillVisible(form.getByTestId(tid.address.recipient), opts.recipient);
    if (opts.phone) await fillVisible(form.getByTestId(tid.address.phone), opts.phone);
    await fillVisible(form.getByTestId(tid.address.line1), opts.line1);

    if (opts.line2) {
      await clickVisible(form.getByTestId(tid.address.addLine2));
      await fillVisible(form.getByTestId(tid.address.line2), opts.line2);
    }

    await fillVisible(form.getByTestId(tid.address.postal), opts.postal);
    await fillVisible(form.getByTestId(tid.address.city), opts.city);

    if (opts.notes) {
      await clickVisible(form.getByTestId(tid.address.addNotes));
      await fillVisible(form.getByTestId(tid.address.notes), opts.notes);
    }
  }

  async submitAddress(): Promise<void> {
    await clickVisible(this.page.getByTestId(tid.address.submit));
    await expect(this.page.getByTestId(tid.address.form)).toBeHidden({ timeout: 15_000 });
    // AddressFormModal reclaims its history-back overlay on a deferred
    // tick. Wait until that entry is gone before the next navigation —
    // otherwise history.back() can cancel Galerie and dismiss the cart drawer.
    await this.page
      .waitForFunction(
        () => {
          const state = window.history.state;
          return !(state && typeof state === 'object' && 'pamOverlayId' in state);
        },
        { timeout: 5_000 },
      )
      .catch(() => undefined);
    await this.page.waitForTimeout(50);
  }

  /** Account → add livraison → Point relais → search postal → pick first → confirm → save. */
  async addMondialRelayPickup(postalCode = '75001'): Promise<void> {
    await this.openAddHomeFromAccount();
    await clickVisible(this.page.getByTestId(tid.address.deliveryPickup));
    const pointName = await this.completeMondialRelayPicker(postalCode);
    const form = this.page.getByTestId(tid.address.form);
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(form.getByTestId(tid.address.label)).toHaveValue('');
    await fillVisible(form.getByTestId(tid.address.recipient), 'Ada Lovelace');
    await fillVisible(form.getByTestId(tid.address.phone), '0601020304');
    await clickVisible(form.getByTestId(tid.address.addNotes));
    await fillVisible(
      form.getByTestId(tid.address.notes),
      'Laisser au point relais si absent',
    );
    await this.submitAddress();
    await expect(this.page.getByText(pointName, { exact: true })).toBeVisible({
      timeout: MAX_ACTION_TIMEOUT_MS,
    });
  }

  /** Mondial Relay widget: wait for MR script, search, pick first selectable point. */
  async completeMondialRelayPicker(postalCode = '75001'): Promise<string> {
    await expect(this.page.getByTestId(tid.mondial.page)).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    await expect(this.page.locator('.MR-Widget')).toBeAttached({ timeout: MAX_ACTION_TIMEOUT_MS });

    await fillVisible(this.page.getByTestId(tid.mondial.search), postalCode);
    await expect(this.page.getByTestId(tid.mondial.country)).toHaveValue('FR');

    const point = this.page.locator('.MRW-RList .PR-List-Item:not(.PR-Disabled)').first();
    await reveal(point);
    await expect(point).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    const pointNameNode = point.locator('.PR-Name').first();
    await expect(pointNameNode).toBeVisible({ timeout: MAX_ACTION_TIMEOUT_MS });
    const pointName = (await pointNameNode.innerText()).trim().replace(/^\d+\s*-\s*/, '');
    if (!pointName) throw new Error('Mondial Relay returned a selectable point without a name.');
    await point.click();

    const selection = this.page.locator('[aria-live="polite"]');
    await expect(selection.locator('strong')).toHaveText(pointName, { timeout: MAX_ACTION_TIMEOUT_MS });
    const confirm = this.page.getByTestId(tid.mondial.confirm);
    await reveal(confirm);
    await expect(confirm).toBeEnabled({ timeout: 15_000 });
    await confirm.click();
    return pointName;
  }

  async addHomeLivraison(): Promise<void> {
    await this.openAddHomeFromAccount();
    await this.fillHomeAddress({
      label: 'Maison E2E',
      recipient: 'Ada Lovelace',
      phone: '0601020304',
      line1: '10 rue de Test',
      postal: '75001',
      city: 'Paris',
    });
    await this.submitAddress();
    await expect(this.page.getByText(/Maison E2E.*Ada Lovelace.*10 rue de Test/i)).toBeVisible();
  }

  /** Full home address: raison sociale + complément + information complémentaire. */
  async addHomeLivraisonFull(): Promise<void> {
    await this.openAddHomeFromAccount();
    await this.fillHomeAddress({
      label: 'Bureau E2E',
      company: 'Lumen',
      recipient: 'Ada Lovelace',
      phone: '0601020304',
      line1: '10 rue de Test',
      line2: 'Bâtiment B — 3e étage',
      postal: '75001',
      city: 'Paris',
      notes: 'Sonner à l’interphone « Pam »',
    });
    await this.submitAddress();
    await expect(this.page.getByText(/Bureau E2E.*Lumen.*Bâtiment B/i)).toBeVisible();
  }
}
