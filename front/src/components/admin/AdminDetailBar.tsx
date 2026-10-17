import type { ReactNode } from 'react';
import styles from './AdminDetailBar.module.css';

interface AdminDetailBarProps {
  /** Visible label of the back button, e.g. the list's status. */
  backLabel: string;
  onBack: () => void;
  /** Sits on the right of the back control, on the same line. */
  end?: ReactNode;
  /** Disables the back control while a save is in flight. */
  disabled?: boolean;
  /** 1-based position of the open record in the loaded list, 0 if unknown. */
  position?: number;
  total?: number;
  canPrevious?: boolean;
  canNext?: boolean;
  busy?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  navLabel?: string;
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sticky header of an admin detail view (order, product request, thread).
 *
 * One bar instead of the previous pair of ‹ › rows above and below the
 * record: back to the list on the left, position and previous/next on the
 * right, pinned under the top bar so stepping through a queue never needs a
 * scroll back up. */
export function AdminDetailBar({
  backLabel,
  onBack,
  end,
  disabled = false,
  position = 0,
  total = 0,
  canPrevious = false,
  canNext = false,
  busy = false,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  navLabel,
}: AdminDetailBarProps) {
  const stepper =
    onPrevious && onNext && previousLabel && nextLabel && navLabel
      ? { onPrevious, onNext, previousLabel, nextLabel, navLabel }
      : null;
  return (
    <div className={styles.bar}>
      <button type="button" className={styles.back} onClick={onBack} disabled={disabled}>
        <Chevron direction="left" />
        <span className={styles.backLabel}>{backLabel}</span>
      </button>
      {end}
      {stepper && (
        <nav className={styles.stepper} aria-label={stepper.navLabel}>
          {position > 0 && (
            <span className={styles.position}>
              {position} / {total}
            </span>
          )}
          <button
            type="button"
            className={styles.step}
            onClick={stepper.onPrevious}
            disabled={busy || !canPrevious}
            aria-label={stepper.previousLabel}
          >
            <Chevron direction="left" />
          </button>
          <button
            type="button"
            className={styles.step}
            onClick={stepper.onNext}
            disabled={busy || !canNext}
            aria-label={stepper.nextLabel}
          >
            <Chevron direction="right" />
          </button>
        </nav>
      )}
    </div>
  );
}
