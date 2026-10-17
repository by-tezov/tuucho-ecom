import { CloseIcon } from '../ui/CloseIcon';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { capitalize } from '../../utils/capitalize';
import type { FilterOption } from '../../api/filterOptions';
import styles from './FilterSheet.module.css';
import { useScrollHint } from '../../hooks/useScrollHint';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { useDragScroll } from '../../hooks/useDragScroll';

interface FilterSheetProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  /** Opened from something already above the z-index:1000 product zoom
   * modal (e.g. QuantityControl inside SizeRequestModal.aboveLightbox) —
   * bump to the next rung (1200, same as LoadingModal) instead of this
   * component's plain top-level 1000, or it renders underneath it. */
  aboveLightbox?: boolean;
}

/** Mobile-only replacement for tapping a filter pill: the browser's native
 * <select> picker can take the full screen height on a long list (occasion
 * has 14 options, color 17) and looks jarring next to the rest of the site.
 * This is a plain bottom sheet instead — capped at 70% of the viewport,
 * scrollable past that. Desktop keeps the native <select> untouched (see
 * GalleryFilters.module.css: this component only ever mounts below the
 * mobile breakpoint, its trigger button in GalleryFilters.tsx is hidden
 * above it). */
export function FilterSheet({
  label,
  options,
  value,
  onChange,
  onClose,
  aboveLightbox = false,
}: FilterSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listDragScroll = useDragScroll<HTMLUListElement>();
  const { scrollHint, updateScrollHint } = useScrollHint(listRef);

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  // Same technique as the header cart drawer (CartControl.tsx): the visual
  // scrollbar track is hidden (see .list in the CSS), these chevrons take
  // over as the "more content" cue, and a mouse press-drag-release scrolls
  // the list the same way touch already does natively.

  // The list's own box height only moves with the sheet/window; options
  // being longer/shorter (a different filter's option list) changes its
  // scrollHeight instead, which a resize listener alone would never catch.
  useLayoutEffect(() => {
    updateScrollHint();
    window.addEventListener('resize', updateScrollHint);
    return () => window.removeEventListener('resize', updateScrollHint);
  }, [options.length, updateScrollHint]);

  return createPortal(
    <ModalBackdrop
      className={
        aboveLightbox ? `${styles.backdrop ?? ''} ${styles.aboveLightbox ?? ''}` : (styles.backdrop ?? '')
      }
      label={label}
      onClose={requestClose}
    >
      <div ref={panelRef} className={styles.sheet}>
        <div className={styles.header}>
          <span className={styles.title}>{label}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={label}
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.listWrap}>
          <ul
            ref={listRef}
            className={styles.list}
            role="listbox"
            aria-label={label}
            onScroll={updateScrollHint}
            {...listDragScroll}
          >
            {options.map((option) => {
              const active = option.value === value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={active ? `${styles.option} ${styles.optionActive}` : styles.option}
                    onClick={() => {
                      onChange(option.value);
                      requestClose();
                    }}
                  >
                    {capitalize(option.label)}
                  </button>
                </li>
              );
            })}
          </ul>
          {scrollHint.up && (
            <span className={styles.scrollHintUp} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 7.5L6 4L9.5 7.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {scrollHint.down && (
            <span className={styles.scrollHintDown} aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 4.5L6 8L9.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          )}
          {(scrollHint.up || scrollHint.down) && (
            <span
              className={[
                styles.scrollHintBar,
                scrollHint.up && styles.scrollHintBarFromUp,
                scrollHint.down && styles.scrollHintBarToDown,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            />
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
