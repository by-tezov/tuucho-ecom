import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './Chip.module.css';

interface ChipProps {
  children: ReactNode;
  /** highlights this chip as the currently-selected one — only meaningful together with `onClick` */
  active?: boolean | undefined;
  /** Visual only — strikes the chip through, in the muted text colour, to
   * signal "nothing in stock right now" (or similar) without blocking the
   * click. Pass `srState` too: the look says nothing to a screen reader.
   * Prefer omitting `onClick`
   * over `disabled` when a Boutique toggle makes a barred size inert: the
   * chip stays visible, and a click does nothing. Availability is
   * information, not a lock, unless that toggle is off.
   *
   * The browsing surfaces (gallery card, product modal, product page, home
   * strip) render only in-stock sizes now, so this is left to the cart
   * page's own picker — the one place where clicking a sold-out size does
   * something: it offers to have that size made (SelectionPickerModal). */
  muted?: boolean | undefined;
  /** Gold border marking this chip as the option already in the cart,
   * independent of `active` (the option currently previewed/selected in a
   * picker) — lets a picker show both at once when they differ. */
  current?: boolean | undefined;
  /** What `muted` / `current` (or a caller's own strike) show visually, for
   * screen readers: appended to the chip's name, e.g. "36, Épuisé"
   * (RGAA 3.1). */
  srState?: string | undefined;
  /** renders the chip as a clickable button instead of plain static text */
  onClick?: (() => void) | undefined;
  className?: string | undefined;
  'data-testid'?: string | undefined;
  'data-shape-key'?: string | undefined;
  'data-size'?: string | undefined;
  'data-in-stock'?: 'true' | 'false' | undefined;
}

function ChipRoot({
  children,
  active,
  muted,
  current,
  srState,
  onClick,
  className,
  'data-testid': dataTestId,
  'data-shape-key': dataShapeKey,
  'data-size': dataSize,
  'data-in-stock': dataInStock,
}: ChipProps) {
  const label = srState ? (
    <>
      {children}
      <span className="visuallyHidden">, {srState}</span>
    </>
  ) : (
    children
  );
  if (!onClick) {
    return (
      <span
        className={[
          styles.chip,
          active && styles.chipActive,
          muted && styles.chipMuted,
          current && styles.chipCurrent,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        data-testid={dataTestId}
        data-shape-key={dataShapeKey}
        data-size={dataSize}
        data-in-stock={dataInStock}
      >
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={[
        styles.chip,
        active && styles.chipActive,
        muted && styles.chipMuted,
        current && styles.chipCurrent,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={dataTestId}
      data-shape-key={dataShapeKey}
      data-size={dataSize}
      data-in-stock={dataInStock}
      aria-pressed={active}
      // A clickable chip is its own control — it should never also trigger a
      // click handler on whatever card/link happens to wrap it (favorites
      // cards and the home page's "Nouveautés" cards both wrap their whole
      // content in a single click/navigate target). preventDefault is the
      // one that actually matters when the wrapper is a <Link>/<a> —
      // stopPropagation alone only stops other onClick handlers from firing,
      // it doesn't cancel the anchor's native "navigate to href" behavior.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

export const Chip = withKernelUi(KERNEL_UI.Chip, ChipRoot);
