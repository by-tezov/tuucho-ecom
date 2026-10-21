import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnsureFloatingMenuRoomBelow } from '../../hooks/useEnsureFloatingMenuRoomBelow';
import { useFloatingMenuRect } from '../../hooks/useFloatingMenuRect';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '../../utils/listboxKeyboard';
import { resolveMenuPlacement } from '../../utils/resolveMenuPlacement';
import { TagMenuPlus } from './TagMenuPlus';
/* Share ShapeTag's stylesheet so badge/chip pixels stay identical. */
import styles from './ShapeTag.module.css';

interface LengthTagProps {
  /** length key -> localized label, insertion order = display order, scoped
   * to the active shape (item.lengthsByShape[activeShape]). */
  lengths: Record<string, string>;
  activeLength: string;
  onSelect: (key: string) => void;
  /** Force the plain, non-clickable text form even when several lengths
   * exist — for a caller with no length picker of its own (see
   * NewArrivalCard/ProductPage/GalleryPage), where a dropdown would open
   * but picking an option couldn't do anything. */
  readOnly?: boolean;
  /** `badge` = gallery-card photo overlay. `chip` = product zoom modal,
   * matching ShapeTag there. */
  appearance?: 'badge' | 'chip';
  /** Gallery cards pin this tag to the photo's right edge (`end`). The
   * product zoom modal keeps it beside the shape tag on the left (`start`). */
  menuAlign?: 'start' | 'end';
  /** Fixed side, or `auto` (gallery): pick above/below by which has more
   * viewport room when the menu opens. */
  menuPlacement?: 'above' | 'below' | 'auto';
  /** Mobile zoom: collapse the product sheet back to origin when the upward
   * menu opens (so the list has the full photo above the tags). */
  onNeedRoomAbove?: ((overflowPx: number) => void) | undefined;
}

/** Same tag mechanics as ShapeTag. On gallery cards it sits at the photo's
 *  right corner; in the product zoom modal it sits next to the shape tag. */
export function LengthTag({
  lengths,
  activeLength,
  onSelect,
  readOnly = false,
  appearance = 'badge',
  menuAlign = 'end',
  menuPlacement = 'auto',
  onNeedRoomAbove,
}: LengthTagProps) {
  const lengthKeys = Object.keys(lengths);
  const [open, setOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] = useState<'above' | 'below'>('above');
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const anchorRect = useFloatingMenuRect(wrapRef, open);
  const tagClass = appearance === 'chip' ? `${styles.tag} ${styles.tagChip}` : styles.tag;
  const effectivePlacement = menuPlacement === 'auto' ? resolvedPlacement : menuPlacement;
  useEnsureFloatingMenuRoomBelow(open, effectivePlacement, wrapRef, menuRef, anchorRect, onNeedRoomAbove);

  const closeNow = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    focusSelectedOrFirstOption(menuRef.current);
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeNow();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase: close only this menu, not the zoom dialog around it.
        e.stopPropagation();
        closeNow();
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // A malformed item with no lengths at all has nothing to show here — the
  // shape tag already carries the set's only overlay in that case.
  if (lengthKeys.length === 0) return null;

  if (readOnly || lengthKeys.length === 1) {
    return (
      <span className={tagClass} data-testid="gallery-length" data-length-key={activeLength}>
        {lengths[activeLength]}
      </span>
    );
  }

  const pick = (key: string) => {
    onSelect(key);
    closeNow();
    buttonRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <button
        ref={buttonRef}
        type="button"
        className={tagClass}
        data-testid="gallery-length"
        data-length-key={activeLength}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (wrapRef.current) {
            setResolvedPlacement(
              resolveMenuPlacement(menuPlacement, wrapRef.current.getBoundingClientRect()),
            );
          }
          setOpen((current) => !current);
        }}
      >
        {lengths[activeLength]}
        <TagMenuPlus />
      </button>
      {open &&
        anchorRect &&
        createPortal(
          <>
            <div className={styles.backdrop} aria-hidden="true" onClick={closeNow} />
            <div
              ref={menuRef}
              id={menuId}
              className={styles.menu}
              role="listbox"
              tabIndex={-1}
              style={{
                ...(menuAlign === 'start'
                  ? { left: anchorRect.left }
                  : { right: window.innerWidth - anchorRect.right }),
                ...(effectivePlacement === 'below'
                  ? { top: anchorRect.bottom + 6 }
                  : { bottom: window.innerHeight - anchorRect.top + 6 }),
              }}
              onKeyDown={(event) => {
                const options = Array.from(
                  menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
                );
                handleListboxKeyDown(event, options, {
                  onEscape: () => {
                    closeNow();
                    buttonRef.current?.focus();
                  },
                });
              }}
            >
              {lengthKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={key === activeLength}
                  className={key === activeLength ? `${styles.option} ${styles.optionActive}` : styles.option}
                  data-testid="gallery-length-option"
                  data-length-key={key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick(key);
                  }}
                >
                  {lengths[key]}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
