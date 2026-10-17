/** Optional standalone entry point for running the ops HTTP surface as its
 * own process. Not used by the current deployment. The public API must not
 * mount these routes; `--ftp` uses the PHP gateway at `OPS_GATEWAY_URL`,
 * which proxies to loopback `opsServer`. Kept so a dedicated ops process
 * can be revived without rewriting the OPS_TOKEN wrapper. */
import express from 'express';
import { opsGatewayRouter } from './opsGatewayRouter.js';

const app = express();
const port = Number(process.env.PORT ?? process.env.APP_PORT ?? 3000);
app.disable('x-powered-by');
app.use(opsGatewayRouter);
const server = app.listen(port, '0.0.0.0', () => console.log(`[ops-gateway] listening=${port}`));
const shutdown = (): void => {
  server.close(() => process.exit(0));
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
