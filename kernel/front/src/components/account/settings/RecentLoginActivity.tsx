import { useState } from 'react';
import type { Strings } from '../../../assets/i18n/types';
import * as authApi from '../../../api/account';
import { RecentLoginsModal } from '../RecentLoginsModal';
import styles from './AccountSettings.module.css';

function formatLoginDate(createdAt: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

/** Hidden entirely on an empty list — either RECENT_LOGINS_DISPLAY_COUNT is
 * 0 (see .env/.public.env) or there's genuinely nothing to show yet, and
 * either way there's nothing useful to render. */
export function RecentLoginActivity({
  t,
  lang,
  logins,
}: {
  t: Strings;
  lang: string;
  logins: authApi.RecentLogin[];
}) {
  const [showAll, setShowAll] = useState(false);

  if (logins.length === 0) return null;

  const latest = logins[0]!;

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.recentLoginsTitle}</h2>
      </div>
      <div className={styles.loginRow}>
        <div className={styles.loginRowMain}>
          <div className={styles.loginWhen}>{formatLoginDate(latest.createdAt, lang)}</div>
          <div className={styles.loginMeta}>
            {[latest.location ?? latest.ip ?? t.account.recentLoginsUnknownPlace, latest.device]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {logins.length > 1 && (
          <button type="button" className={styles.loginShowMore} onClick={() => setShowAll(true)}>
            {t.account.recentLoginsShowMoreLink}
          </button>
        )}
      </div>
      <p className={styles.loginNotice}>{t.account.recentLoginsNotice}</p>
      {showAll && (
        <RecentLoginsModal
          t={t}
          logins={logins}
          formatWhen={(createdAt) => formatLoginDate(createdAt, lang)}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}
