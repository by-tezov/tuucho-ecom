/** Optional plugin-method dispatch. Callers name methods, never plugin ids. */
import { listedPluginServices, peekPluginService } from '@tuucho/plugin-sdk';
import { ensurePluginsLoaded } from './loadPluginRuntime.js';

type PluginFn = (...args: unknown[]) => unknown;

export function peekPluginMethod(method: string): PluginFn | undefined {
  for (const pluginId of listedPluginServices()) {
    const fn = peekPluginService<Record<string, PluginFn>>(pluginId)?.[method];
    if (typeof fn === 'function') return fn;
  }
  return undefined;
}

export async function callPluginMethod(method: string, ...args: unknown[]): Promise<any> {
  await ensurePluginsLoaded();
  const fn = peekPluginMethod(method);
  if (!fn) return undefined;
  return fn(...args);
}

async function call(method: string, ...args: unknown[]): Promise<any> {
  return callPluginMethod(method, ...args);
}

export function isGiftFailure(error: unknown): error is { code: string; httpStatus: number; extras?: unknown } {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      'httpStatus' in error &&
      typeof (error as { httpStatus: unknown }).httpStatus === 'number',
  );
}

export type CartRuleRow = {
  id: string;
  code: string;
  kind: string;
  enabled: boolean;
  priority: number;
  forbid_voucher: boolean;
  params: unknown;
};

export type EvaluatedCartRules = {
  shippingFee: number;
  rulesItemDiscount: number;
  forbidVoucher: boolean;
  gifts: unknown[];
  snapshot: object;
};

export async function syncGiftLinesForCart(...args: unknown[]): Promise<void> {
  await call('syncGiftLinesForCart', ...args);
}

export async function syncGiftLinesForActiveCart(...args: unknown[]): Promise<void> {
  await call('syncGiftLinesForActiveCart', ...args);
}

export async function listCartRules(...args: unknown[]): Promise<CartRuleRow[]> {
  return ((await call('listCartRules', ...args)) as CartRuleRow[] | undefined) ?? [];
}

export async function getCartRuleByCode(...args: unknown[]): Promise<CartRuleRow | undefined> {
  return (await call('getCartRuleByCode', ...args)) as CartRuleRow | undefined;
}

export async function upsertCartRule(...args: unknown[]): Promise<CartRuleRow> {
  return (await call('upsertCartRule', ...args)) as CartRuleRow;
}

export async function deleteCartRule(...args: unknown[]): Promise<any> {
  return call('deleteCartRule', ...args);
}

export async function setCartRuleEnabled(...args: unknown[]): Promise<any> {
  return call('setCartRuleEnabled', ...args);
}

export async function evaluateCartRules(...args: unknown[]): Promise<EvaluatedCartRules> {
  const value = (await call('evaluateCartRules', ...args)) as EvaluatedCartRules | undefined;
  return (
    value ?? {
      shippingFee: 0,
      rulesItemDiscount: 0,
      forbidVoucher: false,
      gifts: [],
      snapshot: {},
    }
  );
}

export async function giftRuleProductUid(...args: unknown[]): Promise<string | null> {
  const value = await call('giftRuleProductUid', ...args);
  return typeof value === 'string' ? value : null;
}

export async function holdVoucher(...args: unknown[]): Promise<any> {
  return call('holdVoucher', ...args);
}

export async function holdVoucherForGuest(...args: unknown[]): Promise<any> {
  return call('holdVoucherForGuest', ...args);
}

export async function lockVouchersForCheckout(...args: unknown[]): Promise<any> {
  return call('lockVouchersForCheckout', ...args);
}

export async function lockVoucherForGuestCheckout(...args: unknown[]): Promise<any> {
  return call('lockVoucherForGuestCheckout', ...args);
}

export async function consumeVoucherHold(...args: unknown[]): Promise<any> {
  return call('consumeVoucherHold', ...args);
}

export async function consumeVoucherHoldForGuest(...args: unknown[]): Promise<any> {
  return call('consumeVoucherHoldForGuest', ...args);
}

export async function releaseVoucherHoldsForReservations(...args: unknown[]): Promise<any> {
  return call('releaseVoucherHoldsForReservations', ...args);
}

export async function extendVoucherHoldsForReservation(...args: unknown[]): Promise<any> {
  return call('extendVoucherHoldsForReservation', ...args);
}

export async function voucherOfferDescription(...args: unknown[]): Promise<any> {
  return call('voucherOfferDescription', ...args);
}

export async function listVouchers(...args: unknown[]): Promise<any> {
  return call('listVouchers', ...args);
}

export async function upsertVoucher(...args: unknown[]): Promise<any> {
  return call('upsertVoucher', ...args);
}

export async function deleteVoucher(...args: unknown[]): Promise<any> {
  return call('deleteVoucher', ...args);
}

export async function deleteAllVouchers(...args: unknown[]): Promise<any> {
  return call('deleteAllVouchers', ...args);
}

export async function generateUniqueVoucherCode(...args: unknown[]): Promise<any> {
  return call('generateUniqueVoucherCode', ...args);
}

export function normalizeVoucherCode(value: unknown): string {
  return String(value ?? '').trim();
}

export async function listVoucherOfferTypeLabels(...args: unknown[]): Promise<any> {
  return call('listVoucherOfferTypeLabels', ...args);
}

export async function syncVoucherOfferTypeLabels(...args: unknown[]): Promise<any> {
  return call('syncVoucherOfferTypeLabels', ...args);
}

export type VoucherDesiredState = {
  offer: any;
  [key: string]: any;
};
export type VoucherOfferType = string;
export type VoucherOfferTypeLabels = Record<string, any>;

export async function createLoyaltyHold(...args: unknown[]): Promise<any> {
  return call('createLoyaltyHold', ...args);
}

export async function releaseLoyaltyHold(...args: unknown[]): Promise<any> {
  return call('releaseLoyaltyHold', ...args);
}

export async function releaseLoyaltyHoldsForUser(...args: unknown[]): Promise<any> {
  return call('releaseLoyaltyHoldsForUser', ...args);
}

export async function consumeLoyaltyHold(...args: unknown[]): Promise<any> {
  return call('consumeLoyaltyHold', ...args);
}

export async function refundConsumedLoyaltyForOrder(...args: unknown[]): Promise<any> {
  return call('refundConsumedLoyaltyForOrder', ...args);
}

export async function voidPendingOrderEarn(...args: unknown[]): Promise<any> {
  return call('voidPendingOrderEarn', ...args);
}

export async function grantDueOrderEarnsForUserInTransaction(...args: unknown[]): Promise<any> {
  return call('grantDueOrderEarnsForUserInTransaction', ...args);
}

export async function grantPendingOrderEarn(...args: unknown[]): Promise<any> {
  return call('grantPendingOrderEarn', ...args);
}

export async function computeOrderEarnRetention(...args: unknown[]): Promise<any> {
  return call('computeOrderEarnRetention', ...args);
}

export async function reverseUnusedOrderEarn(...args: unknown[]): Promise<any> {
  return call('reverseUnusedOrderEarn', ...args);
}

export async function writeOffWalletBeforeAccountDeletion(...args: unknown[]): Promise<any> {
  return call('writeOffWalletBeforeAccountDeletion', ...args);
}

export async function processLoyaltyExpiry(...args: unknown[]): Promise<any> {
  return call('processLoyaltyExpiry', ...args);
}

export async function processLoyaltyReminders(...args: unknown[]): Promise<any> {
  return call('processLoyaltyReminders', ...args);
}

export async function extendLoyaltyHold(...args: unknown[]): Promise<any> {
  return call('extendLoyaltyHold', ...args);
}

export async function priceLoyaltyIfEnabled(...args: unknown[]): Promise<any> {
  return call('priceLoyaltyIfEnabled', ...args);
}

export async function getLoyaltyAdminStats(...args: unknown[]): Promise<any> {
  return call('getLoyaltyAdminStats', ...args);
}

export async function getLoyaltySettings(...args: unknown[]): Promise<Record<string, unknown>> {
  const value = await call('getLoyaltySettings', ...args);
  return (value as Record<string, unknown> | undefined) ?? {
    valuePer100: 0,
    lotDurationMonths: 12,
    burnNoticeWeeks: 0,
    reminderIntervalDays: 0,
  };
}

export type LoyaltyPreviewResult =
  | { ok: true; preview: { loyaltyEarn: number; total: number } }
  | { ok: false; reason: string };

export async function previewGuestItemsLoyalty(...args: unknown[]): Promise<LoyaltyPreviewResult> {
  const value = (await call('previewGuestItemsLoyalty', ...args)) as LoyaltyPreviewResult | undefined;
  return value ?? { ok: true, preview: { loyaltyEarn: 0, total: 0 } };
}

export async function accountCheckoutAddressFailure(...args: unknown[]): Promise<any> {
  return call('accountCheckoutAddressFailure', ...args);
}

export async function reserveAccountCart(...args: unknown[]): Promise<any> {
  return call('reserveAccountCart', ...args);
}

export async function priceAccountCart(...args: unknown[]): Promise<any> {
  return call('priceAccountCart', ...args);
}

export async function bindGiftOrderFromReservation(...args: unknown[]): Promise<any> {
  return call('bindGiftOrderFromReservation', ...args);
}

export async function bindGiftOrderFromPaymentIntent(...args: unknown[]): Promise<any> {
  return call('bindGiftOrderFromPaymentIntent', ...args);
}

export async function syncGiftHoldToActiveCart(...args: unknown[]): Promise<any> {
  return call('syncGiftHoldToActiveCart', ...args);
}

export async function listPublicGiftCartMetaByCartId(
  ...args: unknown[]
): Promise<Map<string, unknown>> {
  const value = (await call('listPublicGiftCartMetaByCartId', ...args)) as
    | Map<string, unknown>
    | undefined;
  // Gift plugin off / not loaded: empty map so cart list still works.
  return value ?? new Map();
}

export async function getGiftSettings(...args: unknown[]): Promise<any> {
  return call('getGiftSettings', ...args);
}

export async function processGift(...args: unknown[]): Promise<any> {
  return call('processGift', ...args);
}

export async function processGiftPurge(...args: unknown[]): Promise<any> {
  return call('processGiftPurge', ...args);
}

/** @deprecated Use isGiftFailure. Kept so existing instanceof checks can compile after rewrite. */
export class GiftFailure extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly extras: unknown;
  constructor(code: string, httpStatus = 400, extras?: unknown) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
    this.extras = extras;
  }
}
