import { Router } from 'express';
import { guestCheckoutExtendRouter } from '../modules/checkout/http/checkoutReservationExtend.router.js';
import { guestCheckoutRememberRouter } from '../modules/checkout/http/guestCheckoutRemember.router.js';
import { guestCheckoutRouter as guestCheckoutCoreRouter } from '../modules/checkout/http/guestCheckout.router.js';

/** Stable public composition root for every /checkout/guest endpoint. */
export const guestCheckoutRouter = Router();

guestCheckoutRouter.use(guestCheckoutCoreRouter);
guestCheckoutRouter.use(guestCheckoutExtendRouter);
guestCheckoutRouter.use(guestCheckoutRememberRouter);
