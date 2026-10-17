/** Optional Node HTTP wrapper around `/operation/*` with an OPS_TOKEN check.
 *
 * Not mounted on the public API. `--ftp` reaches loopback `opsServer` through
 * the PHP gateway at `OPS_GATEWAY_URL` (`scripts/ops-gateway.php`). `--ssh`
 * and `--dev` talk to `opsServer` directly. Keep this router only as the
 * documented escape hatch for a future dedicated ops process
 * (`src/opsGateway.ts`); never reattach it under `api.*`. */
import express from 'express';
import { requireOpsToken } from './opsAuth.js';
import { mountOpsRoutes } from './opsRoutes.js';

export const opsGatewayRouter = express.Router();
opsGatewayRouter.use(requireOpsToken);
opsGatewayRouter.get('/healthz', (_req, res) => res.json({ ok: true, gateway: 'ops' }));
mountOpsRoutes(opsGatewayRouter);
