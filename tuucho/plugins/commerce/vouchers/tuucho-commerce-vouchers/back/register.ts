import type {
  CheckoutQuote,
  CheckoutQuoteContext,
  InvoiceRenderState,
  OrderPluginSnapshot,
  PluginRegisterFn,
} from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { previewVoucher } from './src/application/vouchers.js';
import * as vouchers from './src/application/vouchers.js';
import { extendVoucherHoldsForReservation } from './src/application/voucherHoldExtension.js';
import { voucherImportRouter } from '@kernel/back/modules/operations/http/voucherImport.router';
import { roundMoney as round2 } from '@kernel/back/modules/commerce/domain/checkoutMoney';
import type { AppliedVoucher } from './src/domain/voucherPricing.js';

type PricedForVoucher = {
  plugins?: Record<string, unknown>;
  items: Array<{ line: { origin: string; quantity: number; product_type: string }; unitPrice: number }>;
  subtotal: number;
  shippingFee: number;
  rulesItemDiscount: number;
  total: number;
};

function voucherBag(priced: { plugins?: Record<string, unknown> } | undefined, pluginId: string) {
  const bag = priced?.plugins?.[pluginId];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return undefined;
  return bag as {
    code?: string;
    discount?: number;
    itemDiscount?: number;
    shippingDiscount?: number;
    extraLines?: InvoiceRenderState['extraLines'];
    applied?: AppliedVoucher;
  };
}

function setVoucherBag(
  priced: { plugins?: Record<string, unknown> },
  pluginId: string,
  applied: AppliedVoucher,
): void {
  const line = {
    id: 'voucher-discount',
    pluginId,
    label: applied.code,
    amount: -Number(applied.discount ?? 0),
  };
  priced.plugins = {
    ...(priced.plugins ?? {}),
    [pluginId]: {
      code: applied.code,
      discount: applied.discount,
      itemDiscount: applied.itemDiscount,
      shippingDiscount: applied.shippingDiscount,
      extraLines: [line],
      applied,
    },
  };
}

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, { ...vouchers, extendVoucherHoldsForReservation });
  api.registerHttpMount({ scope: 'operation', path: '/voucher-import', router: voucherImportRouter });
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutQuote,
    async (quote: CheckoutQuote, ctx: CheckoutQuoteContext) => {
      const requested =
        (typeof ctx.voucherCode === 'string' ? ctx.voucherCode : undefined) ??
        (typeof ctx.pluginRequest?.voucherCode === 'string' ? ctx.pluginRequest.voucherCode : undefined);
      if (quote.cartRules?.forbidVoucher && requested) {
        throw Object.assign(new Error('voucher_forbidden_by_rule'), { checkoutReason: 'voucher_forbidden_by_rule' });
      }
      if (!requested) return quote;
      const client = ctx.client as Parameters<typeof previewVoucher>[0];
      const result = await previewVoucher(
        client,
        requested,
        {
          subtotal: quote.merchandiseSubtotal - quote.rulesItemDiscount,
          shippingFee: quote.shippingFee,
          totalQuantity: quote.totalQuantity,
          itemUnitPrices: [],
        },
        ctx.userId,
      );
      if (result && !result.ok) {
        throw Object.assign(new Error(result.reason), { checkoutReason: result.reason });
      }
      if (result?.ok) {
        const applied = result.voucher as AppliedVoucher;
        const line = {
          id: 'voucher-discount',
          pluginId: api.pluginId,
          label: requested,
          amount: -Number(applied.discount ?? 0),
        };
        quote.extraLines = [...(quote.extraLines ?? []), line];
        quote.plugins = {
          ...(quote.plugins ?? {}),
          [api.pluginId]: {
            code: applied.code,
            discount: applied.discount,
            itemDiscount: applied.itemDiscount,
            shippingDiscount: applied.shippingDiscount,
            extraLines: [line],
            applied,
          },
        };
      }
      return quote;
    },
    20,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutPrepare,
    async (state: Record<string, unknown>, ctx: Record<string, unknown>) => {
      const client = ctx.client as Parameters<typeof vouchers.lockVouchersForCheckout>[0];
      const code =
        (typeof ctx.voucherCode === 'string' ? ctx.voucherCode : undefined) ??
        (typeof ctx.pluginRequest === 'object' && ctx.pluginRequest && 'voucherCode' in ctx.pluginRequest
          ? String((ctx.pluginRequest as { voucherCode?: string }).voucherCode ?? '')
          : undefined);
      if (ctx.phase === 'lock') {
        if (ctx.guest) await vouchers.lockVoucherForGuestCheckout(client, code);
        else if (ctx.userId) await vouchers.lockVouchersForCheckout(client, ctx.userId as string, code);
      }
      if (ctx.phase === 'release' && Array.isArray(ctx.reservationIds)) {
        await vouchers.releaseVoucherHoldsForReservations(client, ctx.reservationIds as string[]);
      }
      if (ctx.phase === 'afterPrice') {
        const bag = voucherBag(ctx.priced as { plugins?: Record<string, unknown> }, api.pluginId);
        if (bag?.code) {
          await client.query(`select code from vouchers where lower(code) = lower($1) for update`, [bag.code]);
        }
      }
      return state;
    },
    20,
  );
  async function releaseVoucherCheckout(ctx: Record<string, unknown>): Promise<void> {
    const client = ctx.client as Parameters<typeof vouchers.releaseVoucherHoldsForReservations>[0];
    if (ctx.purpose === 'account.delete' && Array.isArray(ctx.orderIds) && (ctx.orderIds as string[]).length > 0) {
      await client.query(`delete from voucher_redemptions where order_id = any($1::uuid[])`, [ctx.orderIds]);
    }
    if (Array.isArray(ctx.reservationIds) && (ctx.reservationIds as string[]).length > 0) {
      await vouchers.releaseVoucherHoldsForReservations(client, ctx.reservationIds as string[]);
    }
  }
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutRelease,
    async (state: Record<string, unknown>, ctx: Record<string, unknown>) => {
      await releaseVoucherCheckout(ctx);
      return state;
    },
    20,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutReserve,
    async (
      state: { ok: boolean; reason?: string; priced: PricedForVoucher },
      ctx: Record<string, unknown>,
    ) => {
      const priced = state.priced;
      const bag = voucherBag(priced, api.pluginId);
      const applied = bag?.applied;
      if (!state.ok || !applied) return state;
      const client = ctx.client as Parameters<typeof vouchers.holdVoucher>[0];
      const paidItems = priced.items.filter((item) => item.line.origin !== 'rule');
      const totalQuantity = paidItems.reduce((sum, item) => sum + item.line.quantity, 0);
      const basket = {
        subtotal: round2(priced.subtotal - priced.rulesItemDiscount),
        shippingFee: priced.shippingFee,
        totalQuantity,
        itemUnitPrices: paidItems.map((item) => ({
          unitPrice: item.unitPrice,
          quantity: item.line.quantity,
          productType: item.line.product_type as 'nail' | 'accessory',
        })),
      };
      const held = ctx.guest
        ? await vouchers.holdVoucherForGuest(
            client,
            ctx.reservationId as string,
            applied.code,
            basket,
            ctx.expiresAt as Date,
            ctx.guestEmail as string,
          )
        : await vouchers.holdVoucher(
            client,
            ctx.userId as string,
            ctx.reservationId as string,
            applied.code,
            basket,
            ctx.expiresAt as Date,
          );
      if (!held.ok) return { ok: false, reason: held.reason, priced };
      setVoucherBag(priced, api.pluginId, held.voucher);
      return { ok: true, priced };
    },
    20,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutConfirm,
    async (state: { ok: boolean; reason?: string }, ctx: Record<string, unknown>) => {
      if (!state.ok) return state;
      const priced = ctx.priced as PricedForVoucher;
      const applied = voucherBag(priced, api.pluginId)?.applied;
      if (!applied) return state;
      const client = ctx.client as Parameters<typeof vouchers.consumeVoucherHold>[0];
      const consumed = ctx.guest
        ? await vouchers.consumeVoucherHoldForGuest(
            client,
            ctx.reservationId as string,
            applied,
            ctx.orderId as string,
          )
        : await vouchers.consumeVoucherHold(
            client,
            ctx.userId as string,
            ctx.reservationId as string,
            applied,
            ctx.orderId as string,
          );
      if (!consumed) return { ok: false, reason: 'voucher_depleted' };
      return state;
    },
    20,
  );
  api.addFilter(CORE_OPENING_FILTERS.ordersSnapshot, (snapshot: OrderPluginSnapshot, ctx: Record<string, unknown>) => {
    const bag = voucherBag(ctx.priced as PricedForVoucher, api.pluginId);
    if (!bag?.applied && !bag?.code) return snapshot;
    snapshot.plugins[api.pluginId] = {
      code: bag.code,
      discount: bag.discount,
      itemDiscount: bag.itemDiscount,
      shippingDiscount: bag.shippingDiscount,
      extraLines: bag.extraLines ?? [
        {
          id: 'voucher-discount',
          pluginId: api.pluginId,
          label: String(bag.code ?? ''),
          amount: -Number(bag.discount ?? 0),
        },
      ],
      applied: bag.applied,
    };
    return snapshot;
  });
  api.addFilter(
    CORE_OPENING_FILTERS.invoiceRender,
    (
      render: InvoiceRenderState,
      ctx: { snapshot?: OrderPluginSnapshot; order?: { voucher_code?: string | null; voucher_item_discount?: string; voucher_shipping_discount?: string } },
    ) => {
      const bag = ctx.snapshot?.plugins?.[api.pluginId] as { extraLines?: InvoiceRenderState['extraLines'] } | undefined;
      if (bag?.extraLines?.length) {
        render.extraLines = [...render.extraLines, ...bag.extraLines];
        return render;
      }
      const code = ctx.order?.voucher_code;
      if (code) {
        const amount = -(Number(ctx.order?.voucher_item_discount ?? 0) + Number(ctx.order?.voucher_shipping_discount ?? 0));
        render.extraLines = [...render.extraLines, { id: 'voucher-discount', pluginId: api.pluginId, label: code, amount }];
      }
      return render;
    },
  );
  api.addFilter(CORE_OPENING_FILTERS.cartLines, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    { id: 'voucher-code', pluginId: api.pluginId, title: 'Code promo' },
  ]);
};

export { register };
export default register;
