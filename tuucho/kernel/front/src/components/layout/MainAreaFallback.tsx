import type { ReactNode } from 'react';
import { Skeleton } from '../ui/Skeleton';
import styles from './MainAreaFallback.module.css';

/** Page-shaped skeleton for Suspense / auth-guard waits after boot — keeps
 * the footer from jumping and avoids a blank main under the chrome.
 *
 * With `children` (the auth guards), the children stay mounted but hidden
 * under the skeleton instead of unmounting across the loading window:
 * remounting them on every session-restore flip broke pages that need
 * stable anchors. */
export function MainAreaFallback({ children }: { children?: ReactNode }) {
  return (
    <>
      {children != null && (
        <div hidden aria-hidden="true">
          {children}
        </div>
      )}
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
    </>
  );
}
