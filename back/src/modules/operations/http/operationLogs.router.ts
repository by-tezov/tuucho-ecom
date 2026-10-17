import { Router } from 'express';
import { config } from '../../../config/env.js';
import {
  requireCronShipmentLog,
  requireCronAccountDeletionLog,
  requireCronGuestSavedCleanupLog,
  requireCronLoyaltyLog,
  requireCronGiftLog,
  requireCronGiftPurgeLog,
  requireCronPaymentAuthExpirySpyLog,
  requireCronWarmLog,
} from '../../../middleware/requireCronShipment.js';
import {
  apiLogEnabled,
  clearApiLogs,
  clearPrivateLog,
  readApiLogTail,
  readPrivateLogTail,
} from '../../../platform/http/apiLog.js';
import { clearEmailLogs, emailLogEnabled } from '../../../platform/http/emailLog.js';

export const operationLogsRouter = Router();

/** Secure remote equivalent of `tail`: preprod has no SSH, so the local CLI
 * reads this OPS_TOKEN-gated endpoint instead of needing filesystem access. */
operationLogsRouter.get('/log/api', async (req, res) => {
  if (!apiLogEnabled()) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({ success: true, data: { lines: await readApiLogTail(lines) } });
});

/** Read the production shipment-tracking cron output without SSH. Unlike the
 * API diagnostic log, this log is available in production and contains only
 * the cron's operation result/error stream. */
operationLogsRouter.get('/log/cron-shipment', requireCronShipmentLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronShipmentLogFilePath, lines) },
  });
});

operationLogsRouter.post('/log/cron-shipment/clear', requireCronShipmentLog, async (_req, res) => {
  const clearedFiles = await clearPrivateLog(config.cronShipmentLogFilePath);
  res.json({ success: true, data: { clearedFiles } });
});

operationLogsRouter.get('/log/cron-account-deletion', requireCronAccountDeletionLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronAccountDeletionLogFilePath, lines) },
  });
});

operationLogsRouter.post(
  '/log/cron-account-deletion/clear',
  requireCronAccountDeletionLog,
  async (_req, res) => {
    const clearedFiles = await clearPrivateLog(config.cronAccountDeletionLogFilePath);
    res.json({ success: true, data: { clearedFiles } });
  },
);

operationLogsRouter.get(
  '/log/cron-guest-saved-cleanup',
  requireCronGuestSavedCleanupLog,
  async (req, res) => {
    const requested = Number(req.query.lines ?? 100);
    const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
    res.json({
      success: true,
      data: { lines: await readPrivateLogTail(config.cronGuestSavedCleanupLogFilePath, lines) },
    });
  },
);

operationLogsRouter.post(
  '/log/cron-guest-saved-cleanup/clear',
  requireCronGuestSavedCleanupLog,
  async (_req, res) => {
    const clearedFiles = await clearPrivateLog(config.cronGuestSavedCleanupLogFilePath);
    res.json({ success: true, data: { clearedFiles } });
  },
);

operationLogsRouter.get('/log/cron-loyalty', requireCronLoyaltyLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronLoyaltyLogFilePath, lines) },
  });
});

operationLogsRouter.post('/log/cron-loyalty/clear', requireCronLoyaltyLog, async (_req, res) => {
  const clearedFiles = await clearPrivateLog(config.cronLoyaltyLogFilePath);
  res.json({ success: true, data: { clearedFiles } });
});

operationLogsRouter.get('/log/cron-gift', requireCronGiftLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronGiftLogFilePath, lines) },
  });
});

operationLogsRouter.post('/log/cron-gift/clear', requireCronGiftLog, async (_req, res) => {
  const clearedFiles = await clearPrivateLog(config.cronGiftLogFilePath);
  res.json({ success: true, data: { clearedFiles } });
});

operationLogsRouter.get('/log/cron-gift-purge', requireCronGiftPurgeLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronGiftPurgeLogFilePath, lines) },
  });
});

operationLogsRouter.post('/log/cron-gift-purge/clear', requireCronGiftPurgeLog, async (_req, res) => {
  const clearedFiles = await clearPrivateLog(config.cronGiftPurgeLogFilePath);
  res.json({ success: true, data: { clearedFiles } });
});

operationLogsRouter.get(
  '/log/cron-payment-auth-expiry',
  requireCronPaymentAuthExpirySpyLog,
  async (req, res) => {
    const requested = Number(req.query.lines ?? 100);
    const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
    res.json({
      success: true,
      data: { lines: await readPrivateLogTail(config.cronPaymentAuthExpiryLogFilePath, lines) },
    });
  },
);

operationLogsRouter.post(
  '/log/cron-payment-auth-expiry/clear',
  requireCronPaymentAuthExpirySpyLog,
  async (_req, res) => {
    const clearedFiles = await clearPrivateLog(config.cronPaymentAuthExpiryLogFilePath);
    res.json({ success: true, data: { clearedFiles } });
  },
);

operationLogsRouter.get('/log/cron-warm', requireCronWarmLog, async (req, res) => {
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({
    success: true,
    data: { lines: await readPrivateLogTail(config.cronWarmLogFilePath, lines) },
  });
});

operationLogsRouter.post('/log/cron-warm/clear', requireCronWarmLog, async (_req, res) => {
  const clearedFiles = await clearPrivateLog(config.cronWarmLogFilePath);
  res.json({ success: true, data: { clearedFiles } });
});

const LOCK_PROBE_MIN_BYTES = 64;
const LOCK_PROBE_MAX_BYTES = 2_000_000;

/** Dummy payload for `npm run test -- lock --api`. No DB. */
operationLogsRouter.get('/lock-probe', (req, res) => {
  const requested = Number(req.query.bytes ?? 65_536);
  const bytes = Number.isSafeInteger(requested)
    ? Math.max(LOCK_PROBE_MIN_BYTES, Math.min(requested, LOCK_PROBE_MAX_BYTES))
    : 65_536;
  const body = Buffer.alloc(bytes, 0x61);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Lock-Probe-Bytes', String(bytes));
  res.status(200).send(body);
});

operationLogsRouter.get('/log/email', async (req, res) => {
  if (!emailLogEnabled()) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const requested = Number(req.query.lines ?? 100);
  const lines = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 500)) : 100;
  res.json({ success: true, data: { lines: await readPrivateLogTail(config.emailLog.filePath, lines) } });
});

operationLogsRouter.post('/log/email/clear', async (_req, res) => {
  if (!emailLogEnabled()) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, data: { clearedFiles: await clearEmailLogs() } });
});

operationLogsRouter.post('/log/api/clear', async (_req, res) => {
  if (!apiLogEnabled()) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const clearedFiles = await clearApiLogs();
  res.json({ success: true, data: { clearedFiles } });
});
