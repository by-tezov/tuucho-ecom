import type {
  CheckoutQuote,
  CheckoutQuoteContext,
  InvoiceRenderState,
  OrderPluginSnapshot,
  PluginRegisterFn,
} from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { priceLoyaltyIfEnabled } from './src/application/loyaltyPlugin.js';
import { loyaltyAdminRouter } from './src/http/loyaltyAdmin.router.js';
import { accountLoyaltyRouter } from './src/http/accountLoyalty.router.js';
import * as loyalty from './src/application/loyalty.js';
import { extendLoyaltyHold } from './src/application/loyaltyHoldExtension.js';
import { processLoyaltyReminders } from './src/application/loyaltyReminders.js';
import { previewGuestItemsLoyalty } from './src/application/merchandiseLoyaltyPreview.js';
import { loyaltyOpsRouter } from '@kernel/back/modules/operations/http/loyaltyOps.router';

type LoyaltyBag = {
  credit?: number;
  earn?: number;
  earnStatus?: string;
  extraLines?: InvoiceRenderState['extraLines'];
};

function loyaltyBag(priced: { plugins?: Record<string, unknown> } | undefined, pluginId: string): LoyaltyBag | undefined {
  const bag = priced?.plugins?.[pluginId];
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return undefined;
  return bag as LoyaltyBag;
}

function voucherOfferFromQuote(quote: CheckoutQuote): {
  itemDiscount: number;
  shippingDiscount: number;
  offerType: string | null;
} {
  for (const bag of Object.values(quote.plugins ?? {})) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue;
    const rec = bag as {
      itemDiscount?: unknown;
      shippingDiscount?: unknown;
      applied?: { itemDiscount?: number; shippingDiscount?: number; offer?: { type?: string } };
      offer?: { type?: string };
    };
    const applied = rec.applied;
    if (typeof rec.itemDiscount === 'number' || applied?.offer?.type || rec.offer?.type) {
      return {
        itemDiscount: Number(rec.itemDiscount ?? applied?.itemDiscount ?? 0),
        shippingDiscount: Number(rec.shippingDiscount ?? applied?.shippingDiscount ?? 0),
        offerType: applied?.offer?.type ?? rec.offer?.type ?? null,
      };
    }
  }
  return { itemDiscount: 0, shippingDiscount: 0, offerType: null };
}

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    ...loyalty,
    priceLoyaltyIfEnabled,
    extendLoyaltyHold,
    processLoyaltyReminders,
    previewGuestItemsLoyalty,
  });
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutQuote,
    async (quote: CheckoutQuote, ctx: CheckoutQuoteContext) => {
      const client = ctx.client as Parameters<typeof priceLoyaltyIfEnabled>[0];
      const applyLoyalty = Boolean(ctx.applyLoyalty ?? ctx.pluginRequest?.applyLoyalty);
      const voucher = voucherOfferFromQuote(quote);
      const loyaltyResult = await priceLoyaltyIfEnabled(client, {
        userId: ctx.userId ?? '',
        applyLoyalty,
        items: quote.items as never,
        merchandiseSubtotal: quote.merchandiseSubtotal,
        rulesItemDiscount: quote.rulesItemDiscount,
        voucherItemDiscount: voucher.itemDiscount,
        voucherShippingDiscount: voucher.shippingDiscount,
        shippingFee: quote.shippingFee,
        voucherOfferType: voucher.offerType,
      });
      const extraLines =
        loyaltyResult.loyaltyCredit > 0
          ? [
              {
                id: 'loyalty-credit',
                pluginId: api.pluginId,
                label: 'Loyalty credit',
                amount: -loyaltyResult.loyaltyCredit,
              },
            ]
          : [];
      if (extraLines.length) quote.extraLines = [...(quote.extraLines ?? []), ...extraLines];
      quote.plugins = {
        ...(quote.plugins ?? {}),
        [api.pluginId]: {
          credit: loyaltyResult.loyaltyCredit,
          earn: loyaltyResult.loyaltyEarn,
          earnStatus: loyaltyResult.earnStatus,
          extraLines,
        },
      };
      return quote;
    },
    30,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutPrepare,
    async (state: Record<string, unknown>, ctx: Record<string, unknown> | undefined) => {
      if (ctx?.phase === 'release' && ctx.userId && !ctx.guest) {
        await loyalty.releaseLoyaltyHoldsForUser(
          ctx.client as Parameters<typeof loyalty.releaseLoyaltyHoldsForUser>[0],
          ctx.userId as string,
        );
      }
      return state;
    },
    20,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutRelease,
    async (state: Record<string, unknown>, ctx: Record<string, unknown>) => {
      const client = ctx.client as Parameters<typeof loyalty.releaseLoyaltyHold>[0];
      if (ctx.purpose === 'account.delete' && ctx.userId) {
        await loyalty.releaseLoyaltyHoldsForUser(client, ctx.userId as string);
        await loyalty.writeOffWalletBeforeAccountDeletion(client, ctx.userId as string);
        await client.query(`delete from loyalty_ledger where user_id = $1`, [ctx.userId]);
        return state;
      }
      if (Array.isArray(ctx.reservationIds)) {
        for (const reservationId of ctx.reservationIds as string[]) {
          await loyalty.releaseLoyaltyHold(client, reservationId);
        }
      } else if (typeof ctx.reservationId === 'string') {
        await loyalty.releaseLoyaltyHold(client, ctx.reservationId);
      }
      return state;
    },
    20,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutReserve,
    async (
      state: { ok: boolean; reason?: string; priced: { plugins?: Record<string, unknown> } },
      ctx: Record<string, unknown>,
    ) => {
      const credit = Number(loyaltyBag(state.priced, api.pluginId)?.credit ?? 0);
      if (!state.ok || ctx.guest || !(credit > 0) || !ctx.userId) return state;
      try {
        await loyalty.createLoyaltyHold(
          ctx.client as Parameters<typeof loyalty.createLoyaltyHold>[0],
          ctx.userId as string,
          ctx.reservationId as string,
          credit,
          ctx.expiresAt as Date,
        );
      } catch {
        return { ok: false, reason: 'loyalty_insufficient', priced: state.priced };
      }
      return state;
    },
    30,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutConfirm,
    async (state: { ok: boolean; reason?: string }, ctx: Record<string, unknown>) => {
      if (!state.ok || ctx.guest) return state;
      const priced = ctx.priced as { plugins?: Record<string, unknown> };
      const credit = Number(loyaltyBag(priced, api.pluginId)?.credit ?? 0);
      if (!(credit > 0) || !ctx.userId) return state;
      const consumed = await loyalty.consumeLoyaltyHold(
        ctx.client as Parameters<typeof loyalty.consumeLoyaltyHold>[0],
        ctx.reservationId as string,
        ctx.orderId as string,
        ctx.userId as string,
      );
      if (!consumed) return { ok: false, reason: 'loyalty_insufficient' };
      return state;
    },
    30,
  );
  api.addFilter(CORE_OPENING_FILTERS.ordersSnapshot, (snapshot: OrderPluginSnapshot, ctx: Record<string, unknown>) => {
    const bag = loyaltyBag(ctx.priced as { plugins?: Record<string, unknown> }, api.pluginId);
    if (!bag) return snapshot;
    snapshot.plugins[api.pluginId] = {
      credit: bag.credit,
      earn: bag.earn,
      earnStatus: bag.earnStatus,
      extraLines:
        bag.extraLines ??
        (Number(bag.credit ?? 0) > 0
          ? [
              {
                id: 'loyalty-credit',
                pluginId: api.pluginId,
                label: 'Loyalty credit',
                amount: -Number(bag.credit),
              },
            ]
          : []),
    };
    return snapshot;
  });
  api.addFilter(
    CORE_OPENING_FILTERS.invoiceRender,
    (render: InvoiceRenderState, ctx: { snapshot?: OrderPluginSnapshot; order?: { loyalty_credit?: string } }) => {
      const bag = ctx.snapshot?.plugins?.[api.pluginId] as { extraLines?: InvoiceRenderState['extraLines'] } | undefined;
      if (bag?.extraLines?.length) {
        render.extraLines = [...render.extraLines, ...bag.extraLines];
        return render;
      }
      const credit = Number(ctx.order?.loyalty_credit ?? 0);
      if (credit > 0) {
        render.extraLines = [
          ...render.extraLines,
          { id: 'loyalty-credit', pluginId: api.pluginId, label: 'Loyalty credit', amount: -credit },
        ];
      }
      return render;
    },
  );
  api.addFilter(CORE_OPENING_FILTERS.cartLines, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    { id: 'loyalty-credit', pluginId: api.pluginId, title: 'Credit fidelite' },
  ]);
  api.registerHttpMount({ scope: 'admin', path: '/loyalty', router: loyaltyAdminRouter });
  api.registerHttpMount({ scope: 'account', path: '/loyalty', router: accountLoyaltyRouter });
  api.registerHttpMount({ scope: 'operation', path: '/loyalty', router: loyaltyOpsRouter });
};

export { register };
export default register;
