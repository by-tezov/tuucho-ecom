#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (existsSync(join(root, 'plugins/tuucho'))) {
  console.log('plugins/tuucho already laid out; not flattening');
  process.exit(0);
}

const packageJson = (id) => `{
  "name": "@tuucho/plugin-${id}",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "imports": {
    "#kernel/*": "../../kernel/back/src/*",
    "#sdk": "../../plugin-sdk/src/index.ts"
  }
}
`;

const REGISTERS = {
  'tuucho-theme-default': `import type { PluginRegisterFn } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter('storefront.theme.slots', (slots: string[]) => [...slots, 'header', 'burger', 'bottomBar', 'footer']);
};

export { register };
export default register;
`,
  'tuucho-page-home': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-page-about': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-page-guides': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-page-studio-note': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-docs-developer': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-payment-stripe': `import type { PluginRegisterFn } from '#sdk';
import { createStripeFromEnv } from '#kernel/platform/stripe/stripeClient.js';

const METHODS = ['card', 'paypal', 'bancontact', 'google_pay', 'apple_pay'];

const register: PluginRegisterFn = async (api) => {
  api.registerPaymentGateway({
    id: api.pluginId,
    methods: METHODS,
    capabilities: ['saved-methods', 'webhooks', 'manual-capture'],
    getClient: () => createStripeFromEnv(),
  });
};

export { register };
export default register;
`,
  'tuucho-shipping-home': `import type { PluginRegisterFn } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.registerShippingMethod({
    id: api.pluginId,
    courierCodes: api.manifest.courierCodes ?? ['colissimo-home', 'chronopost-home', 'mondial-relay-home'],
  });
};

export { register };
export default register;
`,
  'tuucho-shipping-mondial-relay': `import type { PluginRegisterFn } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.registerShippingMethod({
    id: api.pluginId,
    courierCodes: api.manifest.courierCodes ?? ['mondial-relay-point'],
  });
};

export { register };
export default register;
`,
  'tuucho-shipping-expedition-cron': `import type { PluginRegisterFn } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.addAction('cron.process-shipment-tracking', async (...args: unknown[]) => {
    const [{ processShipmentTrackingCron }, { pool }] = await Promise.all([
      import('#kernel/modules/orders/application/tracking/shippingTracking.js'),
      import('#kernel/db/pool.js'),
    ]);
    return processShipmentTrackingCron(pool, ...(args as []));
  });
};

export { register };
export default register;
`,
  'tuucho-commerce-loyalty': `import type { CheckoutQuote, CheckoutQuoteContext, PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';
import { priceLoyaltyIfEnabled } from './src/application/loyaltyPlugin.js';
import { loyaltyAdminRouter } from './src/http/loyaltyAdmin.router.js';
import { accountLoyaltyRouter } from './src/http/accountLoyalty.router.js';
import * as loyalty from './src/application/loyalty.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, loyalty);
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutQuote,
    async (quote: CheckoutQuote, ctx: CheckoutQuoteContext) => {
      const client = ctx.client as Parameters<typeof priceLoyaltyIfEnabled>[0];
      const loyaltyResult = await priceLoyaltyIfEnabled(client, {
        userId: ctx.userId ?? '',
        applyLoyalty: Boolean(ctx.applyLoyalty),
        items: quote.items as never,
        merchandiseSubtotal: quote.merchandiseSubtotal,
        rulesItemDiscount: quote.rulesItemDiscount,
        voucherItemDiscount: quote.voucher?.itemDiscount ?? 0,
        voucherShippingDiscount: quote.voucher?.shippingDiscount ?? 0,
        shippingFee: quote.shippingFee,
        voucherOfferType: quote.voucher?.offer?.type ?? null,
      });
      quote.loyaltyCredit = loyaltyResult.loyaltyCredit;
      quote.loyaltyEarn = loyaltyResult.loyaltyEarn;
      quote.loyaltyEarnStatus = loyaltyResult.earnStatus;
      quote.loyaltyIncompatibleWithVoucher = loyaltyResult.incompatibleWithVoucher;
      quote.total = Math.round((quote.total - loyaltyResult.loyaltyCredit) * 100) / 100;
      return quote;
    },
    30,
  );
  api.addFilter(CORE_OPENING_FILTERS.profile, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    {
      id: 'loyalty-wallet',
      pluginId: api.pluginId,
      title: 'Cagnotte fidelite',
      description: 'Solde et historique du portefeuille.',
      href: '/account/loyalty',
    },
  ]);
  api.addFilter(CORE_OPENING_FILTERS.cartLoyalty, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    { id: 'loyalty-credit', pluginId: api.pluginId, title: 'Credit fidelite' },
  ]);
  api.registerHttpMount({ scope: 'admin', path: '/loyalty', router: loyaltyAdminRouter });
  api.registerHttpMount({ scope: 'account', path: '/loyalty', router: accountLoyaltyRouter });
};

export { register };
export default register;
`,
  'tuucho-commerce-vouchers': `import type { CheckoutQuote, CheckoutQuoteContext, PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';
import { previewVoucher } from './src/application/vouchers.js';
import * as vouchers from './src/application/vouchers.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, vouchers);
  api.addFilter(
    CORE_OPENING_FILTERS.checkoutQuote,
    async (quote: CheckoutQuote, ctx: CheckoutQuoteContext) => {
      if (quote.cartRules?.forbidVoucher && quote.voucherCode) {
        throw Object.assign(new Error('voucher_forbidden_by_rule'), { checkoutReason: 'voucher_forbidden_by_rule' });
      }
      const code = quote.voucherCode ?? ctx.voucherCode;
      if (!code) return quote;
      const client = ctx.client as Parameters<typeof previewVoucher>[0];
      const result = await previewVoucher(
        client,
        code,
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
        quote.voucher = result.voucher as CheckoutQuote['voucher'];
        quote.total = Math.round((quote.total - (result.voucher.discount ?? 0)) * 100) / 100;
      }
      return quote;
    },
    20,
  );
  api.addFilter(CORE_OPENING_FILTERS.cartVouchers, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    { id: 'voucher-code', pluginId: api.pluginId, title: 'Code promo' },
  ]);
};

export { register };
export default register;
`,
  'tuucho-commerce-cart-rules': `import type { CheckoutQuote, CheckoutQuoteContext, PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';
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
`,
  'tuucho-commerce-gift': `import type { PluginRegisterFn } from '#sdk';
import { giftPublicRouter } from './src/http/giftPublic.router.js';
import { giftGiverRouter } from './src/http/giftGiver.router.js';
import { giftReceiverRouter } from './src/http/giftReceiver.router.js';
import { giftAdminRouter } from './src/http/giftAdmin.router.js';
import './src/application/giftMailJob.js';

const register: PluginRegisterFn = async (api) => {
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftPublicRouter });
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftGiverRouter });
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftReceiverRouter });
  api.registerHttpMount({ scope: 'admin', path: '/gift', router: giftAdminRouter });
};

export { register };
export default register;
`,
  'tuucho-commerce-vinted-review': `import type { PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';
import { vintedReviewsAdminRouter } from './src/http/vintedReviewsAdmin.router.js';
import { vintedReviewsPublicRouter } from './src/http/vintedReviewsPublic.router.js';
import { getHomeReviews } from './src/application/vintedReviewsWorkflow.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    listFeatured: getHomeReviews,
    listPublic: getHomeReviews,
  });
  api.registerHttpMount({ scope: 'admin', path: '/vinted-reviews', router: vintedReviewsAdminRouter });
  api.registerHttpMount({ scope: 'public', path: '/', router: vintedReviewsPublicRouter });
  api.addFilter(CORE_OPENING_FILTERS.seoJsonLd, async (graph: unknown[]) => {
    const reviews = await getHomeReviews().catch(() => []);
    if (!Array.isArray(reviews) || reviews.length === 0) return graph;
    return [
      ...graph,
      {
        '@type': 'AggregateRating',
        ratingValue: '5',
        reviewCount: String(reviews.length),
      },
    ];
  });
};

export { register };
export default register;
`,
  'tuucho-commerce-product-requests': `import type { PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.preferences, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    {
      id: 'size-requests',
      pluginId: api.pluginId,
      title: 'Demandes de taille',
      description: 'Autoriser une demande quand une taille est epuisee.',
      href: '/admin/preferences',
    },
  ]);
};

export { register };
export default register;
`,
  'tuucho-journal-api': `import type { PluginRegisterFn } from '#sdk';
import { appendEmailLog } from '#kernel/platform/http/emailLog.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    append: appendEmailLog,
    query: async () => [],
  });
};

export { register };
export default register;
`,
  'tuucho-journal-admin': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-journal-email': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-journal-cron': `import type { PluginRegisterFn } from '#sdk';
const register: PluginRegisterFn = async () => undefined;
export { register };
export default register;
`,
  'tuucho-seo-sitemap': `import type { PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.seoSitemap, (entries) => entries);
};

export { register };
export default register;
`,
  'tuucho-seo-robots': `import type { PluginRegisterFn } from '#sdk';
import { CORE_OPENING_FILTERS } from '#sdk';

const register: PluginRegisterFn = async (api) => {
  api.addFilter(CORE_OPENING_FILTERS.seoRobots, (rules) => [
    ...rules,
    { directive: 'Disallow', value: '/admin' },
    { directive: 'Disallow', value: '/account' },
    { directive: 'Disallow', value: '/checkout' },
    { directive: 'Disallow', value: '/gallery?' },
  ]);
};

export { register };
export default register;
`,
  'tuucho-seo-redirects': `import type { PluginRegisterFn } from '#sdk';

const register: PluginRegisterFn = async () => undefined;

export { register };
export default register;
`,
};

function writePluginJson(id, extra) {
  const dir = join(root, 'plugins', id);
  mkdirSync(join(dir, 'back'), { recursive: true });
  mkdirSync(join(dir, 'front'), { recursive: true });
  mkdirSync(join(dir, 'docs'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), packageJson(id));
  const register = REGISTERS[id];
  if (register) writeFileSync(join(dir, 'back/register.ts'), register);
  if (extra?.pluginJson && !existsSync(join(dir, 'plugin.json'))) {
    writeFileSync(join(dir, 'plugin.json'), JSON.stringify(extra.pluginJson, null, 2) + '\\n');
  }
}

for (const id of readdirSync(join(root, 'plugins'))) {
  if (id.startsWith('.') || id === 'README.md') continue;
  writePluginJson(id);
}

const seo = [
  {
    id: 'tuucho-seo-sitemap',
    pluginJson: {
      id: 'tuucho-seo-sitemap',
      name: 'Sitemap pages',
      version: '1.0.0',
      kind: 'seo',
      description: 'Adds enabled page-plugin routes to the kernel sitemap.',
      defaultEnabled: true,
      provides: ['SeoSitemap'],
      engines: { core: '>=1.0.0 <2.0.0' },
    },
  },
  {
    id: 'tuucho-seo-robots',
    pluginJson: {
      id: 'tuucho-seo-robots',
      name: 'Robots rules',
      version: '1.0.0',
      kind: 'seo',
      description: 'Adds private-path Disallow rules to the kernel shop robots.txt.',
      defaultEnabled: true,
      provides: ['SeoRobots'],
      engines: { core: '>=1.0.0 <2.0.0' },
    },
  },
  {
    id: 'tuucho-seo-redirects',
    pluginJson: {
      id: 'tuucho-seo-redirects',
      name: 'Redirects apply',
      version: '1.0.0',
      kind: 'seo',
      description: 'Applies stored SEO redirects and plugin redirect rules on the shop API host.',
      defaultEnabled: true,
      provides: ['SeoRedirects'],
      permissions: [{ code: 'seo_redirects', label: 'SEO redirects' }],
      engines: { core: '>=1.0.0 <2.0.0' },
    },
  },
];

for (const plugin of seo) writePluginJson(plugin.id, plugin);

console.log('wrote plugin packages');
