import type pg from 'pg';
import { loyaltyExpiryReminderEmail, sendMail } from '../../messaging/application/email.js';
import { getLoyaltySettings } from './loyalty.js';
import { shouldSendNotification } from '../../identity/application/notificationPreferences.js';
import { getUserPreference, setUserPreference } from '../../identity/application/userPreferences.js';
import { findUserById } from '../../identity/application/users.js';
import type { Language } from '../../../utils/language.js';
import { languageFromPreference } from '../../../utils/language.js';
import { BURN_NOTICE_MS_PER_DAY, listUsersForBurnNoticeReminder } from './burnNotice.js';

const PARIS_TZ = 'Europe/Paris';

function loyaltyReminderPrefKey(settlementIso: string): string {
  return `loyalty_expiry_reminder.${settlementIso.slice(0, 10)}`;
}

function formatSettlementDate(iso: string, language: Language): string {
  const locale =
    language === 'fr'
      ? 'fr-FR'
      : language === 'en'
        ? 'en-GB'
        : language === 'es'
          ? 'es-ES'
          : language === 'it'
            ? 'it-IT'
            : language === 'nl'
              ? 'nl-NL'
              : language === 'pt'
                ? 'pt-PT'
                : 'th-TH';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: PARIS_TZ,
  }).format(new Date(iso));
}

/** Burn-notice emails while credit is inside the configured pre-expiry window.
 * Each user/settlement pair respects `reminder_interval_days` between sends. */
export async function processLoyaltyReminders(pool: pg.Pool): Promise<number> {
  const settings = getLoyaltySettings();
  const atRiskUsers = await listUsersForBurnNoticeReminder(pool, settings.burnNoticeWeeks);
  const now = new Date();
  let sent = 0;
  for (const row of atRiskUsers) {
    const prefKey = loyaltyReminderPrefKey(row.expiresAt);
    const lastSentRaw = await getUserPreference(pool, row.userId, prefKey);
    if (lastSentRaw === 'true') continue;
    if (lastSentRaw) {
      const lastSentMs = Date.parse(lastSentRaw);
      if (
        Number.isFinite(lastSentMs) &&
        now.getTime() - lastSentMs < settings.reminderIntervalDays * BURN_NOTICE_MS_PER_DAY
      ) {
        continue;
      }
    }
    if (!(await shouldSendNotification(pool, row.userId, 'loyalty_expiry'))) continue;
    const user = await findUserById(pool, row.userId);
    if (!user) continue;
    const language = languageFromPreference(await getUserPreference(pool, row.userId, 'language'));
    await sendMail({
      to: user.email,
      ...loyaltyExpiryReminderEmail(
        language,
        row.atRisk.toFixed(2),
        formatSettlementDate(row.expiresAt, language),
      ),
    });
    await setUserPreference(pool, row.userId, prefKey, now.toISOString());
    sent += 1;
  }
  return sent;
}
