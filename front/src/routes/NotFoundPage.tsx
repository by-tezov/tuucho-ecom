import { useLang } from '../assets/i18n';
import { Seo } from '../components/seo/Seo';
import styles from './NotFoundPage.module.css';

/** Deliberately bare — no site chrome, no way back. A genuine unmatched
 * route still renders inside Layout's normal header/footer (see App.tsx),
 * but Layout also swaps in this same component, standalone with nothing
 * else on the page, for preprod's "backend intentionally off" state (see
 * Layout.tsx) — that state should look like nothing's deployed there at
 * all, not hint at an address a visitor could still navigate from. */
export function NotFoundPage() {
  const { t } = useLang();

  return (
    <section aria-labelledby="nf-h" className={styles.section}>
      <Seo title={t.notFound.title} description={t.notFound.sub} path="/404" noindex />
      <h1 id="nf-h" className={styles.title}>
        {t.notFound.title}
      </h1>
      <p className={styles.sub}>{t.notFound.sub}</p>
    </section>
  );
}
