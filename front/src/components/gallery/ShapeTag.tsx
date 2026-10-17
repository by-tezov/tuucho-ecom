import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useEnsureFloatingMenuRoomBelow } from '../../hooks/useEnsureFloatingMenuRoomBelow';
import { useFloatingMenuRect } from '../../hooks/useFloatingMenuRect';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '../../utils/listboxKeyboard';
import { resolveMenuPlacement } from '../../utils/resolveMenuPlacement';
import { TagMenuPlus } from './TagMenuPlus';
import styles from './ShapeTag.module.css';

/** `.menu` min-width. Used only to decide which edge of the tag to pin to. */
const MENU_MIN_WIDTH = 140;
const MENU_GUTTER = 16;

/** Pin the menu to the tag. When the tag sits in the top-right of a card,
 *  a left-aligned list runs off the viewport, so it pins to the tag's right
 *  edge instead. */
function menuStyle(anchor: DOMRect, placement: 'above' | 'below'): CSSProperties {
  const vertical =
    placement === 'below' ? { top: anchor.bottom + 6 } : { bottom: window.innerHeight - anchor.top + 6 };
  const overflowsRight = anchor.left + MENU_MIN_WIDTH > window.innerWidth - MENU_GUTTER;
  if (overflowsRight) {
    return { right: Math.max(MENU_GUTTER, window.innerWidth - anchor.right), ...vertical };
  }
  return { left: anchor.left, ...vertical };
}

interface ShapeTagProps {
  /** shape key -> localized label, insertion order = display order. */
  shape: Record<string, string>;
  activeShape: string;
  onSelect: (key: string) => void;
  /** `badge` = gallery-card photo overlay. `chip` = product zoom modal,
   * matching the selected Chip look that shape row used there. */
  appearance?: 'badge' | 'chip';
  /** Fixed side, or `auto` (gallery): pick above/below by which has more
   * viewport room when the menu opens. */
  menuPlacement?: 'above' | 'below' | 'auto';
  /** Mobile zoom: collapse the product sheet back to origin when the upward
   * menu opens (so the list has the full photo above the tags). */
  onNeedRoomAbove?: ((overflowPx: number) => void) | undefined;
}

/** Single tag overlaid on the gallery card's photo, showing the active shape.
 *  A set with only one shape renders it as plain, non-clickable text — there
 *  is nothing to switch to. A set with several renders it as a trigger (name
 *  + plus) that opens a floating choice list anchored to the tag. */
export function ShapeTag({
  shape,
  activeShape,
  onSelect,
  appearance = 'badge',
  menuPlacement = 'auto',
  onNeedRoomAbove,
}: ShapeTagProps) {
  const shapeKeys = Object.keys(shape);
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

  if (shapeKeys.length <= 1) {
    return (
      <span className={tagClass} data-testid="gallery-shape" data-shape-key={activeShape}>
        {shape[activeShape]}
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
        data-testid="gallery-shape"
        data-shape-key={activeShape}
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
        {shape[activeShape]}
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
              style={menuStyle(anchorRect, effectivePlacement)}
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
              {shapeKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={key === activeShape}
                  className={key === activeShape ? `${styles.option} ${styles.optionActive}` : styles.option}
                  data-testid="gallery-shape-option"
                  data-shape-key={key}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    pick(key);
                  }}
                >
                  {shape[key]}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
