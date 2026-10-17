import type { NextFunction, Request, Response } from 'express';
import {
  isCronAccountDeletionLogPreferenceEnabled,
  isCronGuestSavedCleanupLogPreferenceEnabled,
  isCronGiftLogPreferenceEnabled,
  isCronGiftPurgeLogPreferenceEnabled,
  isCronLoyaltyLogPreferenceEnabled,
  isCronPaymentAuthExpirySpyLogPreferenceEnabled,
  isCronWarmLogPreferenceEnabled,
  isCronShipmentLogPreferenceEnabled,
} from '../modules/settings/application/appPreferences.js';

function preferenceGate(enabled: () => boolean, error: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!enabled()) {
      res.status(403).json({ success: false, error });
      return;
    }
    next();
  };
}

const cronShipmentLogGate = preferenceGate(isCronShipmentLogPreferenceEnabled, 'cron_shipment_log_disabled');
const cronAccountDeletionLogGate = preferenceGate(
  isCronAccountDeletionLogPreferenceEnabled,
  'cron_account_deletion_log_disabled',
);
const cronGuestSavedCleanupLogGate = preferenceGate(
  isCronGuestSavedCleanupLogPreferenceEnabled,
  'cron_guest_saved_cleanup_log_disabled',
);
const cronLoyaltyLogGate = preferenceGate(isCronLoyaltyLogPreferenceEnabled, 'cron_loyalty_log_disabled');
const cronGiftLogGate = preferenceGate(isCronGiftLogPreferenceEnabled, 'cron_gift_log_disabled');
const cronGiftPurgeLogGate = preferenceGate(
  isCronGiftPurgeLogPreferenceEnabled,
  'cron_gift_purge_log_disabled',
);
const cronPaymentAuthExpirySpyLogGate = preferenceGate(
  isCronPaymentAuthExpirySpyLogPreferenceEnabled,
  'cron_payment_auth_expiry_spy_log_disabled',
);
const cronWarmLogGate = preferenceGate(isCronWarmLogPreferenceEnabled, 'cron_warm_log_disabled');

/** Remote read/clear of the private shipment-cron log. */
export function requireCronShipmentLog(req: Request, res: Response, next: NextFunction): void {
  cronShipmentLogGate(req, res, next);
}

export function requireCronAccountDeletionLog(req: Request, res: Response, next: NextFunction): void {
  cronAccountDeletionLogGate(req, res, next);
}

export function requireCronGuestSavedCleanupLog(req: Request, res: Response, next: NextFunction): void {
  cronGuestSavedCleanupLogGate(req, res, next);
}

export function requireCronLoyaltyLog(req: Request, res: Response, next: NextFunction): void {
  cronLoyaltyLogGate(req, res, next);
}

export function requireCronGiftLog(req: Request, res: Response, next: NextFunction): void {
  cronGiftLogGate(req, res, next);
}

export function requireCronGiftPurgeLog(req: Request, res: Response, next: NextFunction): void {
  cronGiftPurgeLogGate(req, res, next);
}

export function requireCronPaymentAuthExpirySpyLog(req: Request, res: Response, next: NextFunction): void {
  cronPaymentAuthExpirySpyLogGate(req, res, next);
}

export function requireCronWarmLog(req: Request, res: Response, next: NextFunction): void {
  cronWarmLogGate(req, res, next);
}
