import type pg from 'pg';
import { peekPluginService } from '@tuucho/plugin-sdk';

export function cartRulesApi() {
  return peekPluginService<{
    syncGiftLinesForActiveCart: (db: pg.Pool, userId: string) => Promise<void>;
    listCartRules: (db: pg.Pool | pg.PoolClient) => Promise<unknown[]>;
    evaluateCartRules: (input: Record<string, unknown>) => {
      shippingFee: number;
      rulesItemDiscount: number;
      forbidVoucher: boolean;
      gifts: unknown[];
      snapshot: object;
    };
    desiredGiftQuantities: (
      rules: unknown[],
      input: Record<string, unknown>,
    ) => Array<{ ruleCode: string; quantity: number }>;
  }>('tuucho-commerce-cart-rules');
}

export function vouchersApi() {
  return peekPluginService<{
    previewVoucher: (
      client: pg.Pool | pg.PoolClient,
      rawCode: string,
      input: Record<string, unknown>,
      scope?: string,
    ) => Promise<{ ok: true; voucher: unknown } | { ok: false; reason: string }>;
  }>('tuucho-commerce-vouchers');
}

export function giftApi() {
  return peekPluginService<{
    coveringStockReservationIdForActiveCart: (
      pool: pg.Pool,
      userId: string,
    ) => Promise<string | undefined>;
  }>('tuucho-commerce-gift');
}

export const EMPTY_CART_RULES = {
  shippingFee: 0,
  rulesItemDiscount: 0,
  forbidVoucher: false,
  gifts: [] as unknown[],
  snapshot: {},
};
