import { config } from '../../../config/env.js';
import { resolvePluginPrivatePath } from '../../plugins/application/pluginSettingValues.js';
import { clearPrivateLog, readPrivateLogTail } from '../../../platform/http/apiLog.js';
import type { AdminCronLogKind, AdminCronLogTail } from '../../../contract/admin/cronLogs.js';
import {
  isCronAccountDeletionLogPreferenceEnabled,
  isCronGiftLogPreferenceEnabled,
  isCronGiftPurgeLogPreferenceEnabled,
  isCronGuestSavedCleanupLogPreferenceEnabled,
  isCronLoyaltyLogPreferenceEnabled,
  isCronPaymentAuthExpirySpyLogPreferenceEnabled,
  isCronShipmentLogPreferenceEnabled,
  isCronWarmLogPreferenceEnabled,
} from '../../settings/application/appPreferences.js';

export const ADMIN_CRON_LOG_KINDS = [
  'shipment',
  'account-deletion',
  'guest-saved-cleanup',
  'loyalty',
  'gift',
  'gift-purge',
  'payment-auth-expiry',
  'warm',
] as const satisfies readonly AdminCronLogKind[];

type CronLogSource = {
  filePath: () => string;
  enabled: () => boolean;
  disabledCode: string;
};

const SOURCES: Record<AdminCronLogKind, CronLogSource> = {
  shipment: {
    filePath: () => config.cronShipmentLogFilePath,
    enabled: isCronShipmentLogPreferenceEnabled,
    disabledCode: 'cron_shipment_log_disabled',
  },
  'account-deletion': {
    filePath: () => config.cronAccountDeletionLogFilePath,
    enabled: isCronAccountDeletionLogPreferenceEnabled,
    disabledCode: 'cron_account_deletion_log_disabled',
  },
  'guest-saved-cleanup': {
    filePath: () => config.cronGuestSavedCleanupLogFilePath,
    enabled: isCronGuestSavedCleanupLogPreferenceEnabled,
    disabledCode: 'cron_guest_saved_cleanup_log_disabled',
  },
  loyalty: {
    filePath: () =>
      resolvePluginPrivatePath(config.privateDir, 'tuucho-commerce-loyalty', 'cronLog', '/log/cron-loyalty.jsonl'),
    enabled: isCronLoyaltyLogPreferenceEnabled,
    disabledCode: 'cron_loyalty_log_disabled',
  },
  gift: {
    filePath: () =>
      resolvePluginPrivatePath(config.privateDir, 'tuucho-commerce-gift', 'cronLog', '/log/cron-gift.jsonl'),
    enabled: isCronGiftLogPreferenceEnabled,
    disabledCode: 'cron_gift_log_disabled',
  },
  'gift-purge': {
    filePath: () =>
      resolvePluginPrivatePath(
        config.privateDir,
        'tuucho-commerce-gift',
        'cronPurgeLog',
        '/log/cron-gift-purge.jsonl',
      ),
    enabled: isCronGiftPurgeLogPreferenceEnabled,
    disabledCode: 'cron_gift_purge_log_disabled',
  },
  'payment-auth-expiry': {
    filePath: () => config.cronPaymentAuthExpiryLogFilePath,
    enabled: isCronPaymentAuthExpirySpyLogPreferenceEnabled,
    disabledCode: 'cron_payment_auth_expiry_spy_log_disabled',
  },
  warm: {
    filePath: () => config.cronWarmLogFilePath,
    enabled: isCronWarmLogPreferenceEnabled,
    disabledCode: 'cron_warm_log_disabled',
  },
};

export function isAdminCronLogKind(value: string): value is AdminCronLogKind {
  return (ADMIN_CRON_LOG_KINDS as readonly string[]).includes(value);
}

/** Same bound as `GET /operation/log/cron-*`. */
export function boundCronLogLines(raw: unknown): number {
  const requested = Number(raw ?? 100);
  return Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
}

export type ReadAdminCronLogResult =
  { ok: true; data: AdminCronLogTail } | { ok: false; status: 403 | 404; code: string };

export async function readAdminCronLog(kindRaw: string, linesRaw: unknown): Promise<ReadAdminCronLogResult> {
  if (!isAdminCronLogKind(kindRaw)) return { ok: false, status: 404, code: 'not_found' };
  const source = SOURCES[kindRaw];
  if (!source.enabled()) return { ok: false, status: 403, code: source.disabledCode };
  return {
    ok: true,
    data: { lines: await readPrivateLogTail(source.filePath(), boundCronLogLines(linesRaw)) },
  };
}

/** Deletes the journal file. The log preference does not gate this: a journal
 * that is turned off still has a file, and the next cron run creates it again. */
export async function clearAdminCronLog(
  kindRaw: string,
): Promise<{ ok: true; clearedFiles: number } | { ok: false; status: 404; code: 'not_found' }> {
  if (!isAdminCronLogKind(kindRaw)) return { ok: false, status: 404, code: 'not_found' };
  return { ok: true, clearedFiles: await clearPrivateLog(SOURCES[kindRaw].filePath()) };
}
