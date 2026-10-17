import type { Server } from 'node:http';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import { config } from './config/env.js';
import { galleryRouter } from './api/gallery.routes.js';
import { storefrontBootstrapRouter } from './modules/plugins/http/storefrontBootstrap.router.js';
import { authRouter } from './api/auth.routes.js';
import { accountRouter } from './api/account.routes.js';
import { adminRouter } from './api/admin.routes.js';
import { guestCheckoutRouter } from './api/guestCheckout.routes.js';
import { checkoutRouter } from './api/checkout.routes.js';
import { pluginHttpMiddleware } from './modules/plugins/application/pluginHttp.js';
import { seoPublicRouter, seoRedirectRouter } from './modules/seo/http/seoPublic.router.js';
import { ensurePluginsLoaded } from './modules/plugins/application/loadPluginRuntime.js';
import { constructWebhookEvent, getStripe } from './platform/stripe/stripeClient.js';
import { pool } from './db/pool.js';
import { userIdsByEmail } from './modules/identity/application/emailLogUserIds.js';
import { registerEmailLogUserLookup } from './platform/http/emailLog.js';
import * as orders from './modules/orders/application/ordersFacade.js';
import { noindexExceptMedia, robotsTxt } from './middleware/crawlerPolicy.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { apiRequestLog } from './middleware/apiRequestLog.js';
import { galleryRateLimiter } from './middleware/rateLimiters.js';
import { settlePaymentIntent } from './modules/settlement/application/settlePayment.js';
import {
  notifyPaymentAuthorizationExpired,
  notifyPaymentFailed,
} from './modules/orders/application/orderNotifications.js';

registerEmailLogUserLookup(userIdsByEmail);

/** Builds the fully composed public API without binding a port, so the route
 * inventory (`npm run check:routes`) and in-process HTTP tests can mount the
 * real app. `startServer` below is the only caller that listens. */
export function createApp(): Express {
  const app = express();

  /** gzip/br for JSON API responses. Front static assets already use Apache
   * precompressed `.gz` siblings (`kernel/front/public/.htaccess`); this
   * covers the API host where Apache does not compress Node responses. */
  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );

  // In prod/preprod this app sits behind Apache/Passenger, which terminates
  // HTTPS and forwards requests internally as plain HTTP — without this,
  // Express has no way to know the original request was HTTPS (req.secure
  // stays false). `1` trusts exactly one hop upstream (Apache/Passenger),
  // which is what's actually in front of this process here.
  if (!config.isDevelopment) app.set('trust proxy', 1);

  // Force HTTPS. Relies on the same trust-proxy'd req.secure as the comment
  // above — Apache/Passenger already conveys the original scheme correctly
  // (secure cookies depend on this too, see cookies.ts), so a plain-HTTP
  // request here means the client actually connected insecurely.
  if (!config.isDevelopment) {
    const canonicalApiOrigin = new URL(config.apiBaseUrl).origin;
    app.use((req, res, next) => {
      if (req.secure) {
        next();
        return;
      }
      // Never trust Host for an externally visible redirect. Apache normally
      // normalizes it, but the configured API origin keeps this correct even
      // if a malformed Host reaches Express.
      res.redirect(301, `${canonicalApiOrigin}${req.originalUrl.startsWith('/') ? req.originalUrl : '/'}`);
    });
  }

  app.use(securityHeaders);
  app.use(noindexExceptMedia);
  // Before every router: a crawler asking for it must not fall through
  // to galleryRouter's catch-all mount and end up as a 404.
  app.get('/robots.txt', robotsTxt);
  app.use(apiRequestLog);

  // Public JSON API — this app lives on its own subdomain (preprod-api./api.),
  // genuinely cross-origin from the front (preprod./the apex domain), so CORS
  // is load-bearing here, not just defensive. Credentials allowed so a future
  // logged-in-favorites request can carry its session cookie (see the plan
  // doc's phase-2 notes).
  //
  // In development, Vite's port drifts (5173, then 5174, 5175... whenever the
  // previous one is still taken) — reflecting whatever Origin the request
  // actually came from avoids re-editing CORS_ORIGIN every time. That
  // reflect-any-Origin behaviour is intentional and accepted for
  // APP_TARGET=dev only; preprod/prod always use the CORS_ORIGIN allow-list.
  function corsForFront(req: Request, res: Response, next: NextFunction): void {
    // A single Access-Control-Allow-Origin header can only ever echo back one
    // value, so with credentials involved (cookies/auth headers) there's no
    // way to allow a *set* of origins other than checking the actual request
    // against the allow-list and echoing back whichever one matched — a
    // literal list or wildcard doesn't work once credentials are in play.
    // config.corsOrigins is guaranteed defined outside dev (see env.ts); the
    // dev fallback reflects whatever Origin the request actually came from
    // (Vite's port drifts), since there's nothing meaningful to allow-list
    // locally.
    const requestOrigin = req.headers.origin;
    const allowedOrigin = config.isDevelopment
      ? (requestOrigin ?? '*')
      : config.corsOrigins!.find((origin) => origin === requestOrigin);

    // No match in production: leave the header unset entirely rather than
    // send a wrong value — the browser then blocks the request client-side,
    // same end result as before, just correct for an origin that was never
    // supposed to be allowed instead of accidentally naming one that was.
    if (allowedOrigin !== undefined) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    // Any localized response is selected by this header. Including it here
    // applies the cache separation consistently to gallery and account data.
    res.setHeader('Vary', 'Origin, Accept-Language');
    if (req.method === 'OPTIONS') {
      // GET/OPTIONS + Content-Type was enough while this only fronted the
      // read-only gallery feed; /auth and /account below need the rest
      // (mutations + an Authorization header for the access token).
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Chat-Access-Token, X-Checkout-Session, X-Gift-Pin-Token',
      );
      res.status(204).end();
      return;
    }
    next();
  }

  const customerJson = express.json({ limit: `${config.fieldLimits.jsonBodyLimitKb}kb` });

  // User-account auth — genuinely cross-origin from the front just like
  // galleryRouter below, so corsForFront wraps these too (with credentials,
  // since the refresh-token cookie and Authorization header both need it).
  app.use('/auth', corsForFront, customerJson, authRouter);
  app.use(
    '/account',
    corsForFront,
    customerJson,
    async (_req, _res, next) => {
      await ensurePluginsLoaded();
      next();
    },
    accountRouter,
  );
  app.use(
    '/admin',
    corsForFront,
    customerJson,
    async (_req, _res, next) => {
      await ensurePluginsLoaded();
      next();
    },
    adminRouter,
  );
  // Unauthenticated on purpose — no requireAuth anywhere in this router (see
  // guestCheckout.routes.ts). Mounted outside /account so its URL doesn't
  // imply a login is needed.
  app.use('/checkout/guest', corsForFront, customerJson, guestCheckoutRouter);
  app.use('/checkout', corsForFront, customerJson, checkoutRouter);
  // Shop robots and sitemap must answer without the plugin catalogue (and
  // without Postgres): non-prod emits Disallow: / and 404s the sitemap from
  // APP_TARGET alone.
  app.use('/', corsForFront, customerJson, seoPublicRouter);
  app.use(
    '/',
    corsForFront,
    customerJson,
    async (_req, _res, next) => {
      await ensurePluginsLoaded();
      next();
    },
    seoRedirectRouter,
    pluginHttpMiddleware('public'),
  );

  // URL_PUBLIC_MEDIA points at wherever Apache serves MEDIA_DIR directly as
  // static files (a folder inside the front's own docroot) — images are never
  // proxied through Node in prod/preprod. This route is a local-dev fallback.
  // maxAge: express.static defaults to 0 (no caching) — photos are immutable
  // once written (a new upload gets a new position/path, nothing overwrites
  // in place), so a long max-age is safe and lets the browser's native HTTP
  // cache do the work instead of a custom client-side cache.
  app.use('/media', express.static(config.mediaDir, { maxAge: '30d' }));

  // A plain, dependency-free liveness probe: doesn't touch the DB, so it still
  // answers even before migrations have run or if the DB is temporarily
  // unreachable, unlike everything else here. corsForFront is required, not
  // defensive: kernel/front's useBackendHealth.ts polls this cross-origin
  // from the browser every 15s to gate the whole site on it — without CORS
  // headers here, the browser blocks every poll, the front concludes the
  // backend is down, and Layout.tsx substitutes NotFoundPage/
  // ServiceDisruptedNotice for every single page, permanently, even though
  // the backend is actually healthy.
  app.get('/healthz', corsForFront, (_req, res) => res.json({ ok: true }));
  app.use('/', corsForFront, storefrontBootstrapRouter);

  // express.raw (not express.json) here, deliberately — Stripe's signature
  // verification hashes the exact, untouched request body, so it must reach
  // constructEvent as a raw Buffer, never parsed-then-reserialized JSON
  // (which can byte-for-byte differ from what Stripe actually signed). No
  // corsForFront/auth here either: Stripe calls this server-to-server, never
  // from a browser, and the signature check below is what actually
  // authenticates the request.
  app.post('/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe || !config.stripe.webhookSecret) {
      res.status(501).end();
      return;
    }

    let event;
    try {
      event = constructWebhookEvent(req.body as Buffer, req.headers['stripe-signature'] as string);
    } catch {
      // Forged or malformed Stripe-Signature headers are expected (probes,
      // misconfigured CLI). Answer with a stable client error only — do not
      // log Stripe's Error object (stack + payload), which looks like a crash
      // and can leak request body into process logs.
      res.status(400).json({ success: false, error: { code: 'invalid_signature' } });
      return;
    }

    // Manual-capture (card + PayPal): authorize to requires_capture
    // (amount_capturable_updated / settle via finalize). Later capture
    // lands on payment_intent.succeeded and promotes authorized → captured.
    // charge.expired / payment_intent.canceled mark authorized → expired
    // (and send a spy email once) when the auth window ends before ops
    // capture. A failed payment releases its still-held stock reservation
    // before sending the optional spy notification.
    let retrySettlement = false;
    if (event.type === 'payment_intent.succeeded') {
      const settled = await settlePaymentIntent(stripe, event.data.object);
      retrySettlement = !settled.ok && 'retryable' in settled && settled.retryable;
    } else if (event.type === 'payment_intent.amount_capturable_updated') {
      const paymentIntent = event.data.object;
      if (paymentIntent.status === 'requires_capture') {
        const settled = await settlePaymentIntent(stripe, paymentIntent);
        retrySettlement = !settled.ok && 'retryable' in settled && settled.retryable;
      }
    } else if (event.type === 'charge.expired') {
      const charge = event.data.object;
      const piId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (piId) {
        const expired = await orders.markPaymentAuthorizationExpired(pool, piId);
        if (expired) await notifyPaymentAuthorizationExpired(expired);
      }
    } else if (event.type === 'payment_intent.canceled') {
      // Only Stripe-internal auth expiry (`cancellation_reason=expired`).
      // Voluntary cancel (our paymentIntents.cancel) must stay `canceled`,
      // not flip to `expired` via this webhook.
      if (event.data.object.cancellation_reason === 'expired') {
        const expired = await orders.markPaymentAuthorizationExpired(pool, event.data.object.id);
        if (expired) await notifyPaymentAuthorizationExpired(expired);
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      await notifyPaymentFailed(event.data.object);
    }
    if (retrySettlement) {
      // A non-2xx response asks Stripe to redeliver the signed event. This is
      // used only when even the durable `need_review` order could not be
      // persisted; there is no custom retry queue or reconciliation cron.
      res.status(500).json({ received: false, error: { code: 'settlement_retryable' } });
      return;
    }
    res.json({ received: true });
  });

  // Registered last, after every other specific path above has had a chance
  // to fully handle its own request — otherwise corsForFront (which matches
  // "/", i.e. everything) would run for /operation, /media, /healthz too,
  // none of which need or want CORS headers.
  // galleryRouter's own routes already start with /gallery (e.g. /gallery/feed).
  app.use('/', corsForFront, galleryRateLimiter, galleryRouter);

  // Final safety net for anything that reached here uncaught (a real bug, an
  // unexpected driver error, ...) — Express 5 auto-forwards a rejected async
  // handler to middleware shaped like this one. Without it, Express's own
  // built-in fallback handles the error instead, and that one echoes the raw
  // err.message (and, outside NODE_ENV=production, the full stack) straight
  // into the response body. That default's safety depends entirely on
  // NODE_ENV — which here is set by cPanel's Node.js Selector "Application
  // Mode" dropdown per deployed app, not by this app's own APP_TARGET (see
  // config/env.ts's requiredAppTarget doc comment) — and preprod's app is
  // deliberately kept in "development" mode there, which scripts/deploy.ts's
  // appModeForMode now reconciles on every deploy rather than only at app
  // creation. Sanitizing unconditionally
  // here means a real error is never actually one bug away from leaking
  // internal details (file paths, SQL fragments, dependency versions, ...) on
  // a real, internet-facing domain — the exact thing this app tries hard to
  // avoid everywhere else (see e.g. auth.routes.ts's anti-enumeration error
  // messages). Must stay the very last app.use — Express only recognizes a
  // 4-argument function as error-handling middleware, and only one registered
  // after every other route/middleware actually catches everything.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    console.error(`[unhandled] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  });

  return app;
}

// Nothing here touches the database at startup — public routes are reachable
// from the first start, with no DB dependency in the startup path at all.
// `/operation/*` is not mounted here: it lives on loopback `opsServer`
// (`--dev` / `--ssh`) or behind the PHP gateway at `OPS_GATEWAY_URL` (`--ftp`).
export function startServer(): Server {
  void ensurePluginsLoaded().then(async () => {
    try {
      const { recoverInterruptedUpdate } = await import('./modules/plugins/application/updates/applyUpdates.js');
      await recoverInterruptedUpdate();
    } catch (error) {
      console.error('[server] interrupted update recovery failed', error);
    }
    try {
      const { snapshotOutageSpyCache } = await import('./modules/messaging/application/spyChannels.js');
      await snapshotOutageSpyCache();
    } catch (error) {
      console.error('[server] outage spy cache snapshot failed', error);
    }
  });
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port} (${config.target})`);
    // Registrations first: the worker drains any kind, and a kind whose
    // feature never registered fails as `unknown_mail_kind`.
    void import('./api/mailJobRegistrations.js')
      .then(() => import('./modules/messaging/application/mailJobs.js'))
      .then(({ startMailJobWorker }) => {
        startMailJobWorker();
      });
    void import('./platform/http/cronLogRetention.js').then(({ startCronLogRetention }) => {
      startCronLogRetention(
        [
          config.cronShipmentLogFilePath,
          config.cronAccountDeletionLogFilePath,
          config.cronGuestSavedCleanupLogFilePath,
          config.cronLoyaltyLogFilePath,
          config.cronGiftLogFilePath,
          config.cronGiftPurgeLogFilePath,
          config.cronPaymentAuthExpiryLogFilePath,
          config.cronWarmLogFilePath,
          config.activityLogFilePath,
        ],
        config.cronLogRetentionMs,
      );
    });
  });
  installGracefulShutdown(server);
  return server;
}

/** Stop the mail worker, close the HTTP server, and end the pool so a
 * SIGTERM from the test orchestrator (or a host restart) does not leave the
 * drain loop reconnecting after the disposable role is dropped. */
function installGracefulShutdown(server: Server): void {
  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      console.log(`[server] shutting down (${reason})`);
      try {
        const { stopMailJobWorker } = await import('./modules/messaging/application/mailJobs.js');
        await stopMailJobWorker();
      } catch (error) {
        console.error('[server] mail worker stop failed', error);
      }
      try {
        const { stopCronLogRetention } = await import('./platform/http/cronLogRetention.js');
        stopCronLogRetention();
      } catch (error) {
        console.error('[server] cron log retention stop failed', error);
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Force-close keep-alive sockets that would otherwise delay close.
        server.closeAllConnections?.();
      });
      try {
        await pool.end();
      } catch (error) {
        console.error('[server] pool end failed', error);
      }
      process.exit(0);
    })();
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  // Isolated test stacks keep stdin open as a death pipe: when the
  // orchestrator exits without a clean SIGTERM (interrupted shell), EOF here
  // still runs the same shutdown instead of leaving a worker against a
  // dropped disposable role.
  if (process.env.PAM_TEST_SHUTDOWN_ON_STDIN_CLOSE === '1') {
    process.stdin.resume();
    process.stdin.once('end', () => shutdown('stdin-closed'));
    process.stdin.once('close', () => shutdown('stdin-closed'));
  }
}
