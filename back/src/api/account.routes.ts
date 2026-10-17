import { Router } from 'express';
import { accountLifecycleRouter } from '../modules/account/http/accountLifecycle.router.js';
import { accountSecurityRouter } from '../modules/account/http/accountSecurity.router.js';
import { accountSettingsRouter } from '../modules/account/http/accountSettings.router.js';
import { accountSocialIdentityRouter } from '../modules/account/http/accountSocialIdentity.router.js';
import { accountCartRouter } from '../modules/cart/http/accountCart.router.js';
import { accountCheckoutRouter } from '../modules/checkout/http/accountCheckout.router.js';
import { accountCheckoutExtendRouter } from '../modules/checkout/http/checkoutReservationExtend.router.js';
import { accountAddressesRouter } from '../modules/customers/addresses/http/accountAddresses.router.js';
import { accountFavoritesRouter } from '../modules/customers/favorites/http/accountFavorites.router.js';
import { accountDeliveryRouter } from '../modules/delivery/http/accountDelivery.router.js';
import { accountOrderManagementRouter } from '../modules/orders/http/accountOrderManagement.router.js';
import { accountOrderQueriesRouter } from '../modules/orders/http/accountOrderQueries.router.js';
import { accountPaymentMethodsRouter } from '../modules/payments/http/accountPaymentMethods.router.js';
import { accountLoyaltyRouter } from './accountLoyalty.routes.js';

/** Stable public composition root for every /api/account endpoint. */
export const accountRouter = Router();

accountRouter.use('/loyalty', accountLoyaltyRouter);
accountRouter.use(accountDeliveryRouter);
accountRouter.use(accountAddressesRouter);
accountRouter.use(accountFavoritesRouter);
accountRouter.use(accountSettingsRouter);
accountRouter.use(accountSecurityRouter);
accountRouter.use(accountLifecycleRouter);
accountRouter.use(accountSocialIdentityRouter);
accountRouter.use(accountPaymentMethodsRouter);
accountRouter.use(accountCartRouter);
accountRouter.use(accountOrderQueriesRouter);
accountRouter.use(accountOrderManagementRouter);
accountRouter.use(accountCheckoutRouter);
accountRouter.use(accountCheckoutExtendRouter);
