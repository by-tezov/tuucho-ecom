import { Router } from 'express';
import { requirePluginEnabled } from '../middleware/requirePluginEnabled.js';
import { giftPublicRouter } from '../modules/gift/http/giftPublic.router.js';
import { giftGiverRouter } from '../modules/gift/http/giftGiver.router.js';
import { giftReceiverRouter } from '../modules/gift/http/giftReceiver.router.js';

export const giftRouter = Router();
giftRouter.use(requirePluginEnabled('commerce-gift'));
giftRouter.use(giftPublicRouter);
giftRouter.use(giftGiverRouter);
giftRouter.use(giftReceiverRouter);
