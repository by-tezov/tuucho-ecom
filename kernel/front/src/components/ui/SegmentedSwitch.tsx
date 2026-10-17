import { useEffect, useState, type CSSProperties } from 'react';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './SegmentedSwitch.module.css';

export interface SegmentedSwitchOption {
  key: string;
  label: string;
  'data-testid'?: string;
}

interface SegmentedSwitchProps {
  options: SegmentedSwitchOption[];
  activeKey: string;
  /** Segments are always buttons, never links — even where the two halves
   * are two routes (see OrdersViewSwitch, which navigates from here). This
   * app is mobile-first and an <a href> long-press pops the OS callout,
   * which is a desktop affordance getting in the way of a control that is
   * tapped, not opened in a new tab. */
  onSelect: (key: string) => void;
  ariaLabel: string;
  className?: string;
  /** Where the fill should start on this mount, when that isn't where it
   * belongs. A switch whose halves are two routes is destroyed and rebuilt
   * by the navigation itself, so its fill would otherwise be *created* at
   * the destination — nothing moves, and CSS has nothing to transition.
   * Passing the segment it came from paints it there for one frame first,
   * so the slide plays across the route change (see OrdersViewSwitch).
   * Omit whenever the component stays mounted, as in the gallery. */
  enterFromKey?: string;
}

/** Two (or more) mutually exclusive views of the same page, as a pill with
 * the active one filled — the gallery's in-stock/sold-out grid, the orders
 * list's current/history. Deliberately not a checkbox or a pair of plain
 * tabs: "neither" and "both" are not states these can be in, and the
 * sliding fill makes the switch read as moving between two halves of one
 * thing rather than toggling two independent controls.
 *
 * An unknown `activeKey` parks the fill on the first segment rather than
 * hiding it — a segmented control with nothing selected reads as broken. */
function SegmentedSwitchRoot({
  options,
  activeKey,
  onSelect,
  ariaLabel,
  className,
  enterFromKey,
}: SegmentedSwitchProps) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.key === activeKey),
  );
  // Where the fill is drawn, which trails activeIndex by one frame. That
  // gap is the whole point: a transition needs a painted start position,
  // and on a remount (see enterFromKey) there wouldn't be one otherwise.
  const [paintedIndex, setPaintedIndex] = useState(() => {
    const from = enterFromKey === undefined ? -1 : options.findIndex((o) => o.key === enterFromKey);
    return from === -1 ? activeIndex : from;
  });

  useEffect(() => {
    if (paintedIndex === activeIndex) return;
    // rAF, not a bare set: the start position has to reach the screen
    // before the target is applied, or the browser collapses both into one
    // paint and the fill jumps.
    const frame = requestAnimationFrame(() => setPaintedIndex(activeIndex));
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, paintedIndex]);

  return (
    <div
      className={[styles.track, className].filter(Boolean).join(' ')}
      role="group"
      aria-label={ariaLabel}
      style={
        {
          '--segment-count': options.length,
          '--segment-index': paintedIndex,
        } as CSSProperties
      }
    >
      <span className={styles.thumb} aria-hidden="true" />
      {options.map((option, index) => {
        return (
          <button
            key={option.key}
            type="button"
            // Styled off the fill's position, not the real one, so the label
            // turns cream as the fill arrives under it rather than sitting
            // cream-on-cream for the length of the slide. aria-pressed keeps
            // reporting the actual state — the animation is not the state.
            className={index === paintedIndex ? `${styles.segment} ${styles.segmentActive}` : styles.segment}
            aria-pressed={index === activeIndex}
            data-testid={option['data-testid']}
            onMouseDown={suppressMouseFocus}
            onClick={() => onSelect(option.key)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const SegmentedSwitch = withKernelUi(KERNEL_UI.SegmentedSwitch, SegmentedSwitchRoot);
