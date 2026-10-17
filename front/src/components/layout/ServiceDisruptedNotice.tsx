import { useLang } from '../../assets/i18n';
import styles from './ServiceDisruptedNotice.module.css';

/** Swapped in for <Outlet/> by Layout.tsx whenever useBackendHealth reports
 * the backend down (route-change /healthz probe or apiFetch confirming an
 * outage via /healthz — see state/backendHealth.ts). Used in local Vite and
 * prod; Layout redirects prod deep links to `/home` first. Preprod gets a bare
 * NotFoundPage instead — its backend is routinely switched off between work
 * sessions, not a real incident, so a visitor-facing apology would be wrong. */
export function ServiceDisruptedNotice() {
  const { t } = useLang();

  return (
    <section aria-labelledby="service-disrupted-h" className={styles.section}>
      <h1 id="service-disrupted-h" className={styles.title}>
        {t.serviceDisrupted.title}
      </h1>
      <p className={styles.message}>{t.serviceDisrupted.message}</p>
    </section>
  );
}
