import type { Page } from 'patchright/test';
import { expect } from 'patchright/test';
import { tid } from '../../dev/support/selectors.js';
import { reveal } from '../../dev/support/interact.js';

function parseEuroAmount(text: string): number {
  const match = text.match(/(\d+[,.]\d{2})/);
  if (!match) throw new Error(`could not parse euro amount from "${text}"`);
  return Number(match[1].replace(',', '.'));
}

function loyaltyValuePer100(): number {
  const parsed = Number(process.env.LOYALTY_VALUE_PER_100 ?? '10');
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`LOYALTY_VALUE_PER_100 is not a usable rate: ${process.env.LOYALTY_VALUE_PER_100}`);
  }
  return parsed;
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function expectedLoyaltyEarnFromMerchandise(merchandise: number): number {
  return Math.round(((merchandise * loyaltyValuePer100()) / 100) * 100) / 100;
}

/** Compare the on-page cagnotte to LOYALTY_VALUE_PER_100 of sous-total minus the volume remise. */
export async function expectCartLoyaltyEarnMatchesMerchandise(page: Page): Promise<void> {
  await expect(async () => {
    const merchandise = parseEuroAmount(await page.getByTestId(tid.cart.subtotal).innerText());
    const discount = page.getByTestId(tid.cart.rulesDiscount);
    const remise = (await discount.count()) === 0 ? 0 : parseEuroAmount(await discount.innerText());
    const paid = Math.round((merchandise - remise) * 100) / 100;
    const expected = expectedLoyaltyEarnFromMerchandise(paid);
    const expectedCents = toCents(expected);
    const earn = page.getByTestId(tid.cart.loyaltyEarn);
    if (expectedCents === 0) {
      await expect(earn).toHaveCount(0);
      return;
    }
    await reveal(earn);
    await expect(earn).toBeVisible();
    const displayed = parseEuroAmount(await earn.innerText());
    const displayedCents = toCents(displayed);
    if (displayedCents !== expectedCents) {
      throw new Error(
        `cagnotte ${displayed.toFixed(2)} € (${displayedCents} cents) != expected ${expected.toFixed(2)} € (${expectedCents} cents) from merchandise ${merchandise.toFixed(2)} € after volume remise ${remise.toFixed(2)} € (paid ${paid.toFixed(2)} €) at ${loyaltyValuePer100()}/100`,
      );
    }
  }).toPass();
}
