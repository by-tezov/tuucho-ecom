import { useId, type ReactNode } from 'react';
import styles from './AdminStockFields.module.css';
import { useAdminStrings } from '../../assets/i18n/admin';

function MinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8h9M8 3.5v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Whole-number stock quantity: big − / + targets around a typed value,
 * instead of the browser's tiny number-input arrows. */
export function StockStepper({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  return (
    <div className={styles.stepperCell}>
      <label htmlFor={id} className={styles.cellLabel}>
        {label}
      </label>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepButton}
          onClick={() => onChange(Math.max(0, safe - 1))}
          disabled={disabled || safe <= 0}
          aria-label={`${label} moins un`}
        >
          <MinusIcon />
        </button>
        <input
          id={id}
          className={styles.stepInput}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={String(safe)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '');
            onChange(digits === '' ? 0 : Number(digits));
          }}
          disabled={disabled}
        />
        <button
          type="button"
          className={styles.stepButton}
          onClick={() => onChange(safe + 1)}
          disabled={disabled}
          aria-label={`${label} plus un`}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}

/** One size offered or not (boolean availability, not a quantity): the
 * whole cell is the button, and its state is written out. */
export function SizeToggle({
  label,
  on,
  onChange,
  disabled,
  compact = false,
  ariaLabel,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean | undefined;
  /** Grid cell: the size alone, filled when offered (the legend says so). */
  compact?: boolean | undefined;
  ariaLabel?: string | undefined;
}) {
  const a = useAdminStrings();
  const className = [styles.sizeToggle, compact && styles.sizeToggleCompact, on && styles.sizeToggleOn]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      aria-pressed={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
      disabled={disabled}
    >
      <span className={styles.sizeToggleLabel}>{label}</span>
      {!compact && (
        <span className={styles.sizeToggleState}>{on ? a.stock.sizeOffered : a.stock.sizeNotOffered}</span>
      )}
    </button>
  );
}

/** Price in euros, typed as text (comma or dot) with a € suffix: no
 * spinner arrows, decimal keypad on mobile. */
export function PriceField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.cellLabel}>
        {label}
      </label>
      <div className={styles.priceInput}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
          disabled={disabled}
        />
        <span aria-hidden="true">€</span>
      </div>
    </div>
  );
}

/** Read-only figure beside the fields (stock value, total pieces). */
export function StockFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.figure}>
      <span className={styles.cellLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Titled block inside the stock edit modal. */
export function StockSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export { styles as stockFieldStyles };
