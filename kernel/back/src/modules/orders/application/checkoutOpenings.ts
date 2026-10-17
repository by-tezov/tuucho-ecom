import { applyFilters, CORE_OPENING_FILTERS, type CheckoutQuote } from '@tuucho/plugin-sdk';
import { roundMoney } from '../../commerce/domain/checkoutMoney.js';
import type { PricedCheckout } from './pricing/checkoutPricingTypes.js';

export type CheckoutReserveState = {
  ok: boolean;
  reason?: string;
  priced: PricedCheckout;
};

export type CheckoutConfirmState = {
  ok: boolean;
  reason?: string;
};

/** Kernel totals are merchandise + shipping − rules + plugin extraLines. */
export function quoteTotalFromExtraLines(quote: {
  merchandiseSubtotal: number;
  shippingFee: number;
  rulesItemDiscount: number;
  extraLines?: Array<{ amount: number }>;
}): number {
  const extras = (quote.extraLines ?? []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return roundMoney(quote.merchandiseSubtotal + quote.shippingFee - quote.rulesItemDiscount + extras);
}

/** Quote → lines → totals. Kernel total is always extraLines, never voucher/loyalty names. */
export async function applyCheckoutQuoteFilters(
  quote: CheckoutQuote,
  ctx: Record<string, unknown>,
): Promise<CheckoutQuote> {
  let next = await applyFilters<CheckoutQuote>(CORE_OPENING_FILTERS.checkoutQuote, quote, ctx);
  next.items = await applyFilters(CORE_OPENING_FILTERS.checkoutLines, next.items ?? [], {
    ...ctx,
    quote: next,
  });
  next.total = quoteTotalFromExtraLines(next);
  next = await applyFilters<CheckoutQuote>(CORE_OPENING_FILTERS.checkoutTotals, next, ctx);
  next.total = quoteTotalFromExtraLines(next);
  return next;
}

export async function runCheckoutPrepare(ctx: Record<string, unknown>): Promise<Record<string, unknown>> {
  return applyFilters(CORE_OPENING_FILTERS.checkoutPrepare, ctx, ctx);
}

export async function runCheckoutReserve(
  priced: PricedCheckout,
  ctx: Record<string, unknown>,
): Promise<CheckoutReserveState> {
  return applyFilters<CheckoutReserveState>(
    CORE_OPENING_FILTERS.checkoutReserve,
    { ok: true, priced },
    ctx,
  );
}

export async function runCheckoutConfirm(ctx: Record<string, unknown>): Promise<CheckoutConfirmState> {
  return applyFilters<CheckoutConfirmState>(CORE_OPENING_FILTERS.checkoutConfirm, { ok: true }, ctx);
}

/** Purpose-agnostic hold release: reservations, blocked review, account delete. */
export async function runCheckoutRelease(ctx: Record<string, unknown>): Promise<Record<string, unknown>> {
  return applyFilters(CORE_OPENING_FILTERS.checkoutRelease, ctx, ctx);
}

export function pluginBags(plugins: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return Object.values(plugins ?? {}).filter(
    (bag): bag is Record<string, unknown> => Boolean(bag) && typeof bag === 'object' && !Array.isArray(bag),
  );
}

/** First plugin bag that stored an applied code-offer (vouchers write `applied`). */
export function appliedCodeFromPlugins(plugins: Record<string, unknown> | undefined): Record<string, unknown> | null {
  for (const bag of pluginBags(plugins)) {
    const applied = bag.applied;
    if (applied && typeof applied === 'object' && !Array.isArray(applied) && 'code' in applied) {
      return applied as Record<string, unknown>;
    }
    if (typeof bag.code === 'string' && typeof bag.discount === 'number') return bag;
  }
  return null;
}
