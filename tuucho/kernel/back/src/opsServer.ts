/**
 * Loopback-only operations server. It is never mounted by the public API;
 * local commands reach it directly in dev or through an SSH port forward in
 * preprod/prod. Keeping the routers here preserves one implementation of the
 * import and operational behaviour without exposing an internet admin API.
 *
 * Bound to 127.0.0.1, but still requires `Authorization: Bearer <OPS_TOKEN>`
 * on `/operation/*` so a local process or SSH tunnel alone is not enough.
 * `/healthz` stays unauthenticated for readiness probes.
 */
import type { Server } from 'node:http';
import express from 'express';
// Side-effect: load layered .env so OPS_TOKEN is in process.env before auth.
import './config/env.js';
import { requireOpsToken } from './opsAuth.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PAM_OPS_PORT ?? 0);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535)
  throw new Error('PAM_OPS_PORT must be a TCP port');

const app = express();
let routesReady = false;

app.get('/healthz', (_req, res) => {
  if (!routesReady) {
    res.status(503).json({ ok: false });
    return;
  }
  res.json({ ok: true });
});

const server: Server = app.listen(port, '127.0.0.1', () => {
  // Bind first: importing every ops router (and native addons they pull in)
  // can take tens of seconds on a cold CloudLinux FS. The PHP gateway waits
  // on /healthz 200, which is only returned once routes are mounted.
  console.log(`[ops-server] listening=${port}`);
  void import('./opsRoutes.js')
    .then(({ mountOpsRoutes }) => {
      const ops = express.Router();
      ops.use(requireOpsToken);
      mountOpsRoutes(ops);
      app.use(ops);
      routesReady = true;
      console.log(`[ops-server] routes-ready=${port}`);
    })
    .catch((error) => {
      console.error('[ops-server] failed to load routes', error);
      process.exit(1);
    });
});

let shuttingDown = false;
const shutdown = (reason: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  void (async () => {
    console.log(`[ops-server] shutting down (${reason})`);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    try {
      await pool.end();
    } catch (error) {
      console.error('[ops-server] pool end failed', error);
    }
    process.exit(0);
  })();
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
