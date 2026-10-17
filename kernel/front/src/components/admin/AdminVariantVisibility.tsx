import type { ReactNode } from 'react';
import { useLang } from '../../assets/i18n';
import { ToggleSwitch } from '../ui/ToggleSwitch';
import styles from './AdminVariantVisibility.module.css';
import { useAdminStrings } from '../../assets/i18n/admin';

/** Frame of the visibility rows (bordered card, divided rows). */
export function VisibilityCard({ children, label }: { children: ReactNode; label?: string | undefined }) {
  return (
    <div className={styles.card} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** One line of the visibility card: what it covers, whether the shop shows
 * it right now (in words, not only by the switch position), and the switch.
 * Each change is saved by the caller immediately. */
export function VisibilityRow({
  label,
  hidden,
  note,
  disabled,
  onChange,
  ariaLabel,
}: {
  label: string;
  hidden: boolean;
  /** Replaces the status line, e.g. when a parent level already hides it. */
  note?: string | undefined;
  disabled: boolean;
  onChange: (hidden: boolean) => void;
  ariaLabel: string;
}) {
  const { t } = useLang();
  return (
    <div className={styles.row}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={hidden || note ? `${styles.status} ${styles.statusOff}` : styles.status}>
          {note ?? (hidden ? t.admin.productHidden : t.admin.productVisible)}
        </span>
      </span>
      <ToggleSwitch
        checked={!hidden}
        onChange={() => onChange(!hidden)}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}

interface AdminVariantVisibilityProps {
  title: string;
  shapeLabel: string;
  lengthLabel: string;
  /** The whole product is hidden. */
  productHidden: boolean;
  /** This shape/length alone is hidden. */
  variantHidden: boolean;
  disabled: boolean;
  onProductChange: (hidden: boolean) => void;
  onVariantChange: (hidden: boolean) => void;
  /** Hides or shows every length of this shape at once. */
  onShapeChange: (hidden: boolean) => void;
}

/**
 * Visibility of one stock variant (product × shape × length): the whole
 * product, this shape/length, or every length of the shape at once
 * (kernel/back docs/plans/variant-visibility.md), as a card of labelled
 * rows: switch on means shown in the shop.
 */
export function AdminVariantVisibility({
  title,
  shapeLabel,
  lengthLabel,
  productHidden,
  variantHidden,
  disabled,
  onProductChange,
  onVariantChange,
  onShapeChange,
}: AdminVariantVisibilityProps) {
  const { t } = useLang();
  const a = useAdminStrings();
  const variantName = t.admin.visibilityVariant(shapeLabel, lengthLabel);
  return (
    <div className={styles.card} role="group" aria-label={t.admin.visibilityGroup}>
      <VisibilityRow
        label={t.admin.visibilityWholeProduct}
        hidden={productHidden}
        disabled={disabled}
        onChange={onProductChange}
        ariaLabel={productHidden ? t.admin.showProduct(title) : t.admin.hideProduct(title)}
      />
      <VisibilityRow
        label={variantName}
        hidden={variantHidden}
        note={productHidden && !variantHidden ? a.stock.hiddenWithProduct : undefined}
        disabled={disabled}
        onChange={onVariantChange}
        ariaLabel={
          variantHidden
            ? t.admin.showProduct(`${title} ${variantName}`)
            : t.admin.hideProduct(`${title} ${variantName}`)
        }
      />
      <div className={styles.shapeRow}>
        <span className={styles.shapeHint}>{a.stock.allLengthsOfShape(shapeLabel)}</span>
        <button
          type="button"
          className={styles.shapeAction}
          onClick={() => onShapeChange(!variantHidden)}
          disabled={disabled}
        >
          {variantHidden ? a.stock.showAll : a.stock.hideAll}
        </button>
      </div>
    </div>
  );
}
