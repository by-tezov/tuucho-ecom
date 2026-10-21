import { Router } from 'express';
import { accountActiveCartRouter } from './accountActiveCart.router.js';
import { accountCartCommentRouter } from './accountCartComment.router.js';
import { accountCartsRouter } from './accountCarts.router.js';

export const accountCartRouter = Router();

accountCartRouter.use(accountCartsRouter);
accountCartRouter.use(accountCartCommentRouter);
accountCartRouter.use(accountActiveCartRouter);
