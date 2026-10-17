import { useLang } from '../../assets/i18n';
import type { Lang } from '../../assets/i18n/types';
import { useGiftLock } from '../../hooks/useGiftLock';
import { Seo } from '../seo/Seo';
import styles from './GiftFlow.module.css';

const DATE_LOCALES: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  th: 'th-TH',
  es: 'es-ES',
  it: 'it-IT',
  nl: 'nl-NL',
  pt: 'pt-PT',
};

/** Day/month + hh:mm, not a full date: this is "come back later today or
 * tomorrow", not a calendar appointment. */
function formatAccessibleFrom(at: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export function GiftContinueNotice() {
  const { t, lang } = useLang();
  const { originBlock } = useGiftLock();
  const accessibleFrom = originBlock ? formatAccessibleFrom(new Date(originBlock.expiresAtMs), lang) : '';
  const body = t.gift.continueBody.replace('{datetime}', accessibleFrom);
  return (
    <section className={styles.section} aria-labelledby="gift-continue-h" data-testid="gift-continue-notice">
      <Seo title={t.gift.continueTitle} description={body} path="/" noindex />
      <h1 id="gift-continue-h" className={styles.title}>
        {t.gift.continueTitle}
      </h1>
      <p className={styles.subtitle}>{body}</p>
    </section>
  );
}
