import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { processPermanentDeletions, processReminders } from '../application/accountDeletion.js';
import { processExpiredOneTimeCards } from '../../payments/application/cardRetention.js';
import { processExpiredGuestSavedCheckout } from '../../customers/application/guestSavedCheckout.js';
import { processShipmentTrackingCron } from '../../orders/application/tracking/shippingTracking.js';
import { isPluginEffectivelyEnabled } from '../../plugins/application/pluginStore.js';
import {
  isCronAccountDeletionLogPreferenceEnabled,
  isCronGuestSavedCleanupLogPreferenceEnabled,
  isCronGiftLogPreferenceEnabled,
  isCronGiftPurgeLogPreferenceEnabled,
  isCronLoyaltyLogPreferenceEnabled,
  isCronPaymentAuthExpirySpyLogPreferenceEnabled,
  isCronShipmentLogPreferenceEnabled,
} from '../../settings/application/appPreferences.js';
import { processPaymentAuthExpirySpy } from '../../orders/application/paymentAuthExpirySpy.js';
import { processLoyaltyExpiry } from '../../loyalty/application/loyalty.js';
import { processLoyaltyReminders } from '../../loyalty/application/loyaltyReminders.js';
import { getStripe } from '../../../platform/stripe/stripeClient.js';
import { recordSystemActivityBestEffort } from '../../activity/application/recordSystemActivity.js';

export const operationMaintenanceRouter = Router();

/** Meant to be hit by an external cron (this LWS plan has no SSH to run an
 * in-process scheduler against reliably — same reasoning as
 * database-migrate above). Idempotent: safe to call as often as the cron
 * likes, sends each reminder at most once, and only ever deletes accounts
 * already past their own deletion_scheduled_for — it must keep running
 * unattended on a prod cron, and it only ever removes accounts that already
 * chose deletion and already served their grace period, not an arbitrary/
 * ad-hoc delete. */
operationMaintenanceRouter.post('/process-account-deletions', async (_req, res) => {
  try {
    const remindersSent = await processReminders(pool);
    const { deleted, failed, orphanedOrders } = await processPermanentDeletions(pool);
    if (!isCronAccountDeletionLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, remindersSent, deleted, failed, orphanedOrders });
  } catch (error) {
    console.error('[operation] process-account-deletions failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Detach one-time Stripe cards past ONE_TIME_CARD_RETENTION_DAYS and drop
 * their retention rows. Same cron pattern as process-account-deletions. */
operationMaintenanceRouter.post('/process-one-time-cards', async (_req, res) => {
  try {
    const deleted = await processExpiredOneTimeCards(pool, getStripe());
    res.json({ success: true, deleted });
  } catch (error) {
    console.error('[operation] process-one-time-cards failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

operationMaintenanceRouter.post('/process-guest-saved-cleanup', async (_req, res) => {
  try {
    const cleaned = await processExpiredGuestSavedCheckout(pool, getStripe());
    const changed = cleaned.addresses + cleaned.cards;
    if (changed > 0) {
      await recordSystemActivityBestEffort(pool, {
        category: 'accounts',
        action: 'guest_saved.cleanup',
        actorLabel: 'nettoyage invites',
        summary: `Nettoyage invites: ${cleaned.addresses} adresse(s), ${cleaned.cards} carte(s)`,
        detail: cleaned,
      });
    }
    if (!isCronGuestSavedCleanupLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, ...cleaned });
  } catch (error) {
    console.error('[operation] process-guest-saved-cleanup failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Materialize wallet lot expiry past each lot’s expires_at (Europe/Paris
 * cut-offs). Also releases expired loyalty checkout holds first. Idempotent. */
operationMaintenanceRouter.post('/loyalty-expire', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('commerce-loyalty'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    const { expiredTotal, holdsReleased } = await processLoyaltyExpiry(pool);
    res.json({ success: true, expiredTotal, holdsReleased });
  } catch (error) {
    console.error('[operation] loyalty-expire failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Remind customers with credit inside the burn-notice window. Skips mail
 * while the Boutique loyalty preference is off. Respects reminder interval. */
operationMaintenanceRouter.post('/loyalty-remind', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('commerce-loyalty'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    const remindersSent = await processLoyaltyReminders(pool);
    res.json({ success: true, remindersSent });
  } catch (error) {
    console.error('[operation] loyalty-remind failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Production loyalty cron entrypoint: release expired holds, expire due lots,
 * then send burn-notice emails. Idempotent. Detailed counters only when
 * cronLoyaltyLogEnabled. */
operationMaintenanceRouter.post('/process-loyalty', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('commerce-loyalty'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    const { expiredTotal, holdsReleased } = await processLoyaltyExpiry(pool);
    const remindersSent = await processLoyaltyReminders(pool);
    if (expiredTotal > 0 || holdsReleased > 0) {
      await recordSystemActivityBestEffort(pool, {
        category: 'loyalty',
        action: 'loyalty.cron',
        actorLabel: 'fidelite',
        summary: `Cron fidelite: ${expiredTotal} expires, ${holdsReleased} holds liberes`,
        detail: { expiredTotal, holdsReleased, remindersSent },
      });
    }
    if (!isCronLoyaltyLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, expiredTotal, holdsReleased, remindersSent });
  } catch (error) {
    console.error('[operation] process-loyalty failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Production gift cron entrypoint: expire unused tokens, release gift holds,
 * cancel unpaid promises, send reminders. Never captures or refunds Stripe.
 * Detailed counters only when cronGiftLogEnabled. */
operationMaintenanceRouter.post('/process-gift', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('commerce-gift'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    // Loaded here, not at module top: processGift → giftMail → canvas/sharp,
    // and those native bindings abort loopback opsServer on CloudLinux
    // (SIGSEGV) before /healthz can answer. Library seed uses this process.
    const { processGift } = await import('../../gift/application/processGift.js');
    const result = await processGift(pool);
    const changed = result.expired + result.holdsReleased + result.cancelled;
    if (changed > 0) {
      await recordSystemActivityBestEffort(pool, {
        category: 'gift',
        action: 'gift.cron',
        actorLabel: 'cadeau',
        summary: `Cron cadeau: ${result.expired} expires, ${result.cancelled} annules, ${result.holdsReleased} holds liberes`,
        detail: result,
      });
    }
    if (!isCronGiftLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[operation] process-gift failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** RGPD retention cron entrypoint: hard-deletes cancelled/expired gift
 * offers (giver + receiver PII) once they are past Boutique
 * `purge_after_days` (default 396, ~13 months). Never touches an offer
 * that reached `ordered`. Detailed counter only when
 * cronGiftPurgeLogEnabled. */
operationMaintenanceRouter.post('/process-gift-purge', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('commerce-gift'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    const { processGiftPurge } = await import('../../gift/application/processGiftPurge.js');
    const { purged } = await processGiftPurge(pool);
    if (purged > 0) {
      await recordSystemActivityBestEffort(pool, {
        category: 'gift',
        action: 'gift.purge',
        actorLabel: 'cadeau',
        summary: `Purge cadeau: ${purged} offre(s) supprimee(s)`,
        detail: { purged },
      });
    }
    if (!isCronGiftPurgeLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, purged });
  } catch (error) {
    console.error('[operation] process-gift-purge failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Production payment-authorization-expiry-spy cron entrypoint: mails the
 * owner once per order, PAYMENT_AUTH_EXPIRY_SPY_BEFORE ahead of an
 * authorization hold's *estimated* expiry. Never captures, cancels, or
 * refunds Stripe. Detailed counter only when cronPaymentAuthExpirySpyLogEnabled. */
operationMaintenanceRouter.post('/process-payment-auth-expiry-spy', async (_req, res) => {
  try {
    const { notified } = await processPaymentAuthExpirySpy(pool);
    if (!isCronPaymentAuthExpirySpyLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, notified });
  } catch (error) {
    console.error('[operation] process-payment-auth-expiry-spy failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** External-cron entrypoint for in-flight Mondial Relay shipments. It polls
 * only tracking rows older than four hours, still applies cached events on
 * a fresh cache, and advances Point Relais orders to disponible/received
 * (home orders directly to received) when the carrier's official milestone
 * says so. Opening admin/account tracking uses the same milestone walk.
 * OPS_TOKEN is sufficient: the action is deterministic and limited to
 * carrier-confirmed forward lifecycle transitions, not an ad-hoc order mutation. */
operationMaintenanceRouter.post('/process-shipment-tracking', async (_req, res) => {
  try {
    if (!(await isPluginEffectivelyEnabled('shipping-expedition-cron'))) {
      res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
      return;
    }
    const tracking = await processShipmentTrackingCron(pool);
    const advanced =
      tracking.sentMarked +
      tracking.availableMarked +
      tracking.receivedMarked +
      tracking.returnReviewMarked;
    if (advanced > 0) {
      await recordSystemActivityBestEffort(pool, {
        category: 'orders',
        action: 'order.shipment_tracking',
        actorLabel: 'expedition',
        summary: `Suivi expedition: ${advanced} commande(s) avancee(s)`,
        detail: {
          sentMarked: tracking.sentMarked,
          availableMarked: tracking.availableMarked,
          receivedMarked: tracking.receivedMarked,
          returnReviewMarked: tracking.returnReviewMarked,
          fetched: tracking.fetched,
          failed: tracking.failed,
        },
      });
    }
    // The production cron shell appends this HTTP body to the private
    // shipment-cron log. When logging is off, still run the job but return
    // a quiet ack so the jsonl stays empty of detailed carrier payloads.
    if (!isCronShipmentLogPreferenceEnabled()) {
      res.json({ success: true });
      return;
    }
    res.json({ success: true, tracking });
  } catch (error) {
    console.error('[operation] process-shipment-tracking failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});
