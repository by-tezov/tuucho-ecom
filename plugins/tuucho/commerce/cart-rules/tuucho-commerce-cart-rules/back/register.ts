import type { CheckoutQuote, CheckoutQuoteContext, PluginRegisterFn } from '@tuucho/plugin-sdk';
import { CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { evaluateCartRules, listCartRules } from './src/cartRules.js';
import { syncGiftLinesForActiveCart, syncGiftLinesForCart } from './src/cartGiftLines.js';
import * as cartRules from './src/cartRules.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, { ...cartRules, syncGiftLinesForActiveCart, syncGiftLinesForCart });
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutPrepare,
    async (prep: { client: unknown; userId?: string; cartId?: string; syncGiftLines?: boolean }) => {
      if (prep.syncGiftLines === false) return prep;
      const client = prep.client as Parameters<typeof syncGiftLinesForCart>[0];
      if (prep.cartId) await syncGiftLinesForCart(client, prep.cartId);
      else if (prep.userId) await syncGiftLinesForActiveCart(client, prep.userId);
      return prep;
    },
    5,
  );
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutQuote,
    async (quote: CheckoutQuote, ctx: CheckoutQuoteContext) => {
      const client = ctx.client as Parameters<typeof listCartRules>[0];
      const rules = await listCartRules(client);
      const lines = (quote.items as Array<{ line?: Record<string, unknown>; unitPrice: number; lineTotal: number }>) ?? [];
      const evaluated = evaluateCartRules({
        rules,
        nailLines: lines
          .filter((item) => item.line?.origin === 'user' && item.line?.product_type === 'nail')
          .map((item) => ({ quantity: Number(item.line?.quantity ?? 0), lineTotal: item.lineTotal })),
        extraSets: lines
          .filter((item) => item.line?.origin === 'user' && !item.line?.product_id)
          .map((item) => ({
            quantity: Number(item.line?.quantity ?? 0),
            nailCount: Number(
              (item as { childCount?: number; children?: unknown[] }).childCount ??
                (item as { children?: unknown[] }).children?.length ??
                0,
            ),
            lineTotal: item.lineTotal,
          })),
        merchandiseSubtotal: quote.merchandiseSubtotal,
        shippingListFee: quote.shippingListFee,
        countryCode: String(ctx.countryCode ?? ''),
        giftLines: lines
          .filter((item) => item.line?.origin === 'rule')
          .map((item) => ({
            productId: String(item.line?.product_id ?? ''),
            productUid: String(item.line?.product_uid ?? ''),
            quantity: Number(item.line?.quantity ?? 0),
            ruleCode: String(item.line?.rule_code ?? ''),
          })),
      });
      quote.cartRules = evaluated;
      quote.rulesItemDiscount = evaluated.rulesItemDiscount;
      quote.shippingFee = evaluated.shippingFee;
      quote.total =
        Math.round(
          (quote.merchandiseSubtotal + evaluated.shippingFee - evaluated.rulesItemDiscount) * 100,
        ) / 100;
      return quote;
    },
    10,
  );
};

export { register };
export default register;
