import styles from './ContentLoading.module.css';

interface ContentLoadingProps {
  message: string;
}

/** In-flow loading feedback for a page's content region. Unlike
 * LoadingModal, this keeps the application chrome and navigation usable. */
export function ContentLoading({ message }: ContentLoadingProps) {
  return (
    <div className={styles.root} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
