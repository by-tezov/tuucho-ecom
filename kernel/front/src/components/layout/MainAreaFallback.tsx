import { Skeleton } from '../ui/Skeleton';
import styles from './MainAreaFallback.module.css';

/** Page-shaped skeleton for Suspense / auth-guard waits after boot — keeps
 * the footer from jumping and avoids a blank main under the chrome. */
export function MainAreaFallback() {
  return (
    <div className={styles.root} aria-busy="true">
      <Skeleton className={styles.hero} />
      <Skeleton className={styles.line} />
      <Skeleton className={styles.lineShort} />
      <div className={styles.row}>
        <Skeleton className={styles.card} />
        <Skeleton className={styles.card} />
        <Skeleton className={styles.card} />
      </div>
    </div>
  );
}
