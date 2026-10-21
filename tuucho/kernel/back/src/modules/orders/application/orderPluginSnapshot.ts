import { applyFilters } from '../../plugins/application/hooks.js';
import type { ExtraLine, OrderPluginSnapshot } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';

export type { ExtraLine, OrderPluginSnapshot };

export function emptyPluginSnapshot(): OrderPluginSnapshot {
  return { plugins: {} };
}

export function readPluginSnapshot(raw: unknown): OrderPluginSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyPluginSnapshot();
  const body = raw as { plugins?: unknown };
  if (!body.plugins || typeof body.plugins !== 'object' || Array.isArray(body.plugins)) {
    return emptyPluginSnapshot();
  }
  return { plugins: body.plugins as Record<string, unknown> };
}

export function extraLinesFromSnapshot(snapshot: OrderPluginSnapshot): ExtraLine[] {
  const lines: ExtraLine[] = [];
  for (const [pluginId, bag] of Object.entries(snapshot.plugins)) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
    const extra = (bag as { extraLines?: unknown }).extraLines;
    if (!Array.isArray(extra)) continue;
    for (const line of extra) {
      if (!line || typeof line !== 'object' || Array.isArray(line)) continue;
      const row = line as Record<string, unknown>;
      if (typeof row.label !== 'string' || typeof row.amount !== 'number') continue;
      lines.push({
        id: typeof row.id === 'string' ? row.id : `${pluginId}:${lines.length}`,
        pluginId: typeof row.pluginId === 'string' ? row.pluginId : pluginId,
        label: row.label,
        amount: row.amount,
        quantity: typeof row.quantity === 'number' ? row.quantity : undefined,
      });
    }
  }
  return lines;
}

/** Leftover order columns plus plugin bags (code/credit/earn) for historical DTOs. */
export function totalsFromPluginSnapshot(
  snapshot: OrderPluginSnapshot,
  leftover: {
    voucherCode: string | null;
    voucherDiscount: number | null;
    loyaltyCredit: number;
    loyaltyEarn: number;
    loyaltyEarnStatus: 'pending' | 'granted' | 'void' | string;
  },
): {
  extraLines: ExtraLine[];
  voucherCode: string | null;
  voucherDiscount: number | null;
  loyaltyCredit: number;
  loyaltyEarn: number;
  loyaltyEarnStatus: 'pending' | 'granted' | 'void';
} {
  const extraLines = extraLinesFromSnapshot(snapshot);
  let { voucherCode, voucherDiscount, loyaltyCredit, loyaltyEarn, loyaltyEarnStatus } = leftover;
  for (const bag of Object.values(snapshot.plugins)) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
    const rec = bag as Record<string, unknown>;
    if (!voucherCode && typeof rec.code === 'string') {
      voucherCode = rec.code;
      if (typeof rec.discount === 'number') voucherDiscount = rec.discount;
    }
    if (!(loyaltyCredit > 0) && typeof rec.credit === 'number') loyaltyCredit = rec.credit;
    if (!(loyaltyEarn > 0) && typeof rec.earn === 'number') {
      loyaltyEarn = rec.earn;
      if (rec.earnStatus === 'pending' || rec.earnStatus === 'granted' || rec.earnStatus === 'void') {
        loyaltyEarnStatus = rec.earnStatus;
      }
    }
  }
  const status =
    loyaltyEarnStatus === 'pending' || loyaltyEarnStatus === 'granted' || loyaltyEarnStatus === 'void'
      ? loyaltyEarnStatus
      : 'void';
  return { extraLines, voucherCode, voucherDiscount, loyaltyCredit, loyaltyEarn, loyaltyEarnStatus: status };
}

/** Persist leftover commerce columns from plugin bags before the order insert. */
export function leftoverCommerceColumnsFromSnapshot(snapshot: OrderPluginSnapshot): {
  voucherCode: string | null;
  voucherItemDiscount: number;
  voucherShippingDiscount: number;
  loyaltyCredit: number;
  loyaltyEarn: number;
  loyaltyEarnStatus: 'pending' | 'granted' | 'void';
} {
  const leftover = totalsFromPluginSnapshot(snapshot, {
    voucherCode: null,
    voucherDiscount: null,
    loyaltyCredit: 0,
    loyaltyEarn: 0,
    loyaltyEarnStatus: 'void',
  });
  return {
    voucherCode: leftover.voucherCode,
    voucherItemDiscount: leftover.voucherDiscount ?? 0,
    voucherShippingDiscount: 0,
    loyaltyCredit: leftover.loyaltyCredit,
    loyaltyEarn: leftover.loyaltyEarn,
    loyaltyEarnStatus: leftover.loyaltyEarnStatus,
  };
}

export async function buildOrderPluginSnapshot(
  seed: OrderPluginSnapshot,
  ctx: Record<string, unknown>,
): Promise<OrderPluginSnapshot> {
  const next = await applyFilters<OrderPluginSnapshot>(CORE_OPENING_FILTERS.ordersSnapshot, seed, ctx);
  return {
    plugins: next?.plugins && typeof next.plugins === 'object' ? next.plugins : {},
  };
}
