/** The one definition of the `/operation/*` surface.
 *
 * Mounted only by `src/opsServer.ts` on 127.0.0.1 (`--dev` / `--ssh`).
 * `--ftp` reaches those same routes because the PHP gateway at
 * `OPS_GATEWAY_URL` authenticates with `OPS_TOKEN` then proxies here.
 * The public API must never mount these routes. */
import express, { type Router } from 'express';
import { libraryImportRouter } from './api/libraryImport.routes.js';
import { courierImportRouter } from './api/courierImport.routes.js';
import { cartRulesRouter } from './api/cartRules.routes.js';
import { paymentMethodsRouter } from './api/paymentMethods.routes.js';
import { paymentMethodCountriesRouter } from './api/paymentMethodCountries.routes.js';
import { courierLiveStateRouter } from './api/courierLiveState.routes.js';
import { signInMethodsRouter } from './api/signInMethods.routes.js';
import { pluginHttpMiddleware } from './modules/plugins/application/pluginHttp.js';
import { ensurePluginsLoaded } from './modules/plugins/application/loadPluginRuntime.js';
import { operationRouter } from './api/operation.routes.js';
import { captureOpsAttribution } from './modules/activity/http/opsAttribution.middleware.js';

export function mountOpsRoutes(target: Router): void {
  const json = express.json({ limit: '2mb' });
  // Attribution is not authentication. OPS_TOKEN still gates every route.
  target.use('/operation', captureOpsAttribution);
  // `/operation` last: it is the catch-all prefix, so the more specific
  // mounts above it have to be registered first.
  target.use('/operation/library-import', json, libraryImportRouter);
  target.use('/operation/courier-import', json, courierImportRouter);
  target.use(
    '/operation',
    json,
    async (_req, _res, next) => {
      await ensurePluginsLoaded();
      next();
    },
    pluginHttpMiddleware('operation'),
  );
  target.use('/operation/cart-rules', json, cartRulesRouter);
  target.use('/operation/payment-methods', json, paymentMethodsRouter);
  target.use('/operation/payment-method-countries', json, paymentMethodCountriesRouter);
  target.use('/operation/courier-live-state', json, courierLiveStateRouter);
  target.use('/operation/sign-in-methods', json, signInMethodsRouter);
  target.use('/operation', json, operationRouter);
}
