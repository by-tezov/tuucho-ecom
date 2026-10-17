import styles from './TripleSparkles.module.css';

/** Shared decorative divider used directly below standalone page titles. */
export function TripleSparkles() {
  return (
    <div aria-hidden="true" className={styles.row}>
      <span className={styles.sparkles}>✦ ✦ ✦</span>
    </div>
  );
}
