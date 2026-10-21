import type {
  InvoiceRenderState,
  OrderPluginSnapshot,
  PluginRegisterFn,
  SpyChannelDeclaration,
} from '@tuucho/plugin-sdk';
import { appendSpyChannel, CORE_OPENING_FILTERS } from '@tuucho/plugin-sdk';
import { giftPublicRouter } from './src/http/giftPublic.router.js';
import { giftGiverRouter } from './src/http/giftGiver.router.js';
import { giftReceiverRouter } from './src/http/giftReceiver.router.js';
import { giftAdminRouter } from './src/http/giftAdmin.router.js';
import * as giftCheckout from './src/application/giftCheckout.js';
import * as receiverAccess from './src/application/receiverAccess.js';
import * as giftPin from './src/application/giftPin.js';
import * as loadOffer from './src/application/loadOffer.js';
import { getGiftSettings } from './src/application/giftSettings.js';
import { listPublicGiftCartMetaByCartId } from './src/application/giverCartMeta.js';
import { processGift } from './src/application/processGift.js';
import { processGiftPurge } from './src/application/processGiftPurge.js';
import { giftOpsRouter } from '@kernel/back/modules/operations/http/giftOps.router';
import './src/application/giftMailJob.js';

const register: PluginRegisterFn = async (api) => {
  api.registerPluginService(api.pluginId, {
    ...giftCheckout,
    ...giftPin,
    ...loadOffer,
    loadReceiverSummary: receiverAccess.loadReceiverSummary,
    putReceiverItem: receiverAccess.putReceiverItem,
    removeReceiverItem: receiverAccess.removeReceiverItem,
    putReceiverDestination: receiverAccess.putReceiverDestination,
    getGiftSettings,
    listPublicGiftCartMetaByCartId,
    processGift,
    processGiftPurge,
  });
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftPublicRouter });
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftGiverRouter });
  api.registerHttpMount({ scope: 'public', path: '/gift', router: giftReceiverRouter });
  api.registerHttpMount({ scope: 'admin', path: '/gift', router: giftAdminRouter });
  api.registerHttpMount({ scope: 'operation', path: '/gift', router: giftOpsRouter });
  api.addFilter(CORE_OPENING_FILTERS.mailSpyChannels, (channels: SpyChannelDeclaration[]) =>
    appendSpyChannel(channels, {
      id: 'gift_created',
      pluginId: api.pluginId,
      title: 'Gift created',
      description: 'Staff copy when a giver creates a gift offer.',
      filters: ['role', 'email', 'kind'],
    }),
  );
  api.addFilter(CORE_OPENING_FILTERS.cartLines, (entries: Array<Record<string, unknown>>) => [
    ...entries,
    { id: 'gift-offer', pluginId: api.pluginId, title: 'Cadeau' },
  ]);
  api.addFilter(CORE_OPENING_FILTERS.ordersSnapshot, (snapshot: OrderPluginSnapshot, ctx: Record<string, unknown>) => {
    const priced = ctx.priced as { plugins?: Record<string, unknown> };
    const bag = priced?.plugins?.[api.pluginId];
    if (bag && typeof bag === 'object') snapshot.plugins[api.pluginId] = bag;
    return snapshot;
  });
  api.addFilter(
    CORE_OPENING_FILTERS.invoiceRender,
    (render: InvoiceRenderState, ctx: { snapshot?: OrderPluginSnapshot; order?: { gift_snapshot?: unknown } }) => {
      const bag = ctx.snapshot?.plugins?.[api.pluginId];
      if (bag && typeof bag === 'object') {
        render.extraBlocks = [...render.extraBlocks, { pluginId: api.pluginId, gift: bag }];
      } else if (ctx.order?.gift_snapshot) {
        render.extraBlocks = [...render.extraBlocks, { pluginId: api.pluginId, gift: ctx.order.gift_snapshot }];
      }
      return render;
    },
  );
};

export { register };
export default register;
