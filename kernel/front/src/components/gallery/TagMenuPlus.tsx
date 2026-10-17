import styles from './ShapeTag.module.css';

/** Plus: disclosure affordance for shape/length tags (more options). */
export function TagMenuPlus() {
  return (
    <span aria-hidden="true" className={styles.menuPlus}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" focusable="false">
        <path d="M5 1.25v7.5M1.25 5h7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
