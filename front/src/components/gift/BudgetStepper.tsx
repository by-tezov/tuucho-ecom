import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './BudgetStepper.module.css';

const HOLD_START_MS = 380;
const HOLD_MIN_MS = 48;
const HOLD_DECAY = 0.72;

interface BudgetStepperProps {
  id: string;
  value: number;
  min: number;
  max: number;
  /** When set, 0 stays the empty start; plus jumps here and minus cannot go below it. */
  snapMin?: number;
  onChange: (value: number) => void;
  labelledBy: string;
  describedBy?: string | undefined;
  invalid?: boolean | undefined;
  decreaseAria: string;
  increaseAria: string;
  onValueClick?: () => void;
  valueExpanded?: boolean;
}

export function BudgetStepper({
  id,
  value,
  min,
  max,
  snapMin,
  onChange,
  labelledBy,
  describedBy,
  invalid,
  decreaseAria,
  increaseAria,
  onValueClick,
  valueExpanded,
}: BudgetStepperProps) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const minRef = useRef(min);
  minRef.current = min;
  const maxRef = useRef(max);
  maxRef.current = max;
  const snapMinRef = useRef(snapMin);
  snapMinRef.current = snapMin;
  const holdTimerRef = useRef<number | null>(null);

  const stopHold = useCallback(() => {
    if (holdTimerRef.current == null) return;
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  useEffect(() => stopHold, [stopHold]);

  const applyDelta = useCallback((delta: number) => {
    const current = valueRef.current;
    const minValue = minRef.current;
    const maxValue = maxRef.current;
    const snap = snapMinRef.current;
    let next = current + delta;
    if (snap != null && snap > minValue) {
      if (delta > 0 && current < snap) next = snap;
      else if (delta < 0 && current > 0 && next < snap) next = snap;
    }
    next = Math.min(maxValue, Math.max(minValue, next));
    if (next === current) return false;
    onChangeRef.current(next);
    return true;
  }, []);

  const startHold = useCallback(
    (delta: number) => {
      stopHold();
      if (!applyDelta(delta)) return;
      let delay = HOLD_START_MS;
      const tick = () => {
        holdTimerRef.current = window.setTimeout(() => {
          if (!applyDelta(delta)) {
            stopHold();
            return;
          }
          delay = Math.max(HOLD_MIN_MS, delay * HOLD_DECAY);
          tick();
        }, delay);
      };
      tick();
    },
    [applyDelta, stopHold],
  );

  function bindHold(delta: number) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold(delta);
      },
      onPointerUp: stopHold,
      onPointerCancel: stopHold,
      onLostPointerCapture: stopHold,
      onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
      onClick: (event: { detail: number }) => {
        if (event.detail !== 0) return;
        applyDelta(delta);
      },
    };
  }

  const atMin = snapMin != null && snapMin > min ? value <= 0 || value <= snapMin : value <= min;
  const atMax = value >= max;

  return (
    <div className={styles.wrap}>
      <div
        id={id}
        className={invalid ? `${styles.root} ${styles.invalid}` : styles.root}
        role="group"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        <button
          type="button"
          className={styles.button}
          aria-label={decreaseAria}
          disabled={atMin}
          {...bindHold(-1)}
        >
          −
        </button>
        {onValueClick ? (
          <button
            type="button"
            className={`${styles.value} ${styles.valueButton}`}
            aria-haspopup="dialog"
            aria-expanded={valueExpanded === true}
            onClick={onValueClick}
          >
            {value} <span className={styles.suffix}>€</span>
          </button>
        ) : (
          <span className={styles.value}>
            {value} <span className={styles.suffix}>€</span>
          </span>
        )}
        <button
          type="button"
          className={styles.button}
          aria-label={increaseAria}
          disabled={atMax}
          {...bindHold(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
