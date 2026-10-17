import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEnsureFloatingMenuRoomBelow } from '../../hooks/useEnsureFloatingMenuRoomBelow';
import { useFloatingMenuRect } from '../../hooks/useFloatingMenuRect';
import { focusSelectedOrFirstOption, handleListboxKeyDown } from '../../utils/listboxKeyboard';
import { resolveMenuPlacement } from '../../utils/resolveMenuPlacement';
import { TagMenuPlus } from './TagMenuPlus';
import type { GalleryItem } from '../../data/types';
import type { Size } from '../../api/cart';
import { variationPickerOptions } from '../../utils/nailVariation';
/* Share ShapeTag's stylesheet so the pill, menu and backdrop stay identical. */
import tagStyles from './ShapeTag.module.css';
import styles from './VariationTag.module.css';

export interface VariationTagOption {
  key: string;
  label: string;
  /** Small photo of the nail in this option (current shape and length). */
  photo: string | null;
}

interface VariationTagProps {
  /** Axis name ("Couleur"), shown before the tag and used as its accessible name. */
  axisLabel: string;
  options: VariationTagOption[];
  active: string;
  onSelect: (key: string) => void;
  appearance?: 'badge' | 'chip';
  menuPlacement?: 'above' | 'below' | 'auto';
  onNeedRoomAbove?: ((overflowPx: number) => void) | undefined;
  className?: string | undefined;
}

/** A single nail's variation picker (docs/plans/nail-variations.md in
 * kernel/back): same tag, floating list and darkened backdrop as
 * ShapeTag/LengthTag. The tag itself shows the option's name only; each row
 * of the floating list adds the option's photo so a colour reads at a glance
 * (the card's photo slider already shows the selected one). */
export function VariationTag({
  axisLabel,
  options,
  active,
  onSelect,
  appearance = 'chip',
  menuPlacement = 'auto',
  onNeedRoomAbove,
  className,
}: VariationTagProps) {
  const [open, setOpen] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] = useState<'above' | 'below'>('below');
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const anchorRect = useFloatingMenuRect(wrapRef, open);
  const tagClass = appearance === 'chip' ? `${tagStyles.tag} ${tagStyles.tagChip}` : tagStyles.tag;
  const effectivePlacement = menuPlacement === 'auto' ? resolvedPlacement : menuPlacement;
  useEnsureFloatingMenuRoomBelow(open, effectivePlacement, wrapRef, menuRef, anchorRect, onNeedRoomAbove);
  const current = options.find((option) => option.key === active) ?? options[0];

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

  if (!current) return null;

  const pick = (key: string) => {
    onSelect(key);
    closeNow();
    buttonRef.current?.focus();
  };

  const thumb = (photo: string | null) =>
    photo ? (
      <img loading="lazy" decoding="async" className={styles.thumb} src={photo} alt="" draggable={false} />
    ) : (
      <span className={styles.thumb} aria-hidden="true" />
    );

  return (
    <div className={className ? `${styles.row} ${className}` : styles.row}>
      <span className={styles.axis}>{axisLabel}</span>
      <div ref={wrapRef} className={tagStyles.wrap}>
        <button
          ref={buttonRef}
          type="button"
          className={`${tagClass} ${styles.trigger}`}
          data-testid="gallery-variation"
          data-variation-key={current.key}
          aria-label={`${axisLabel}: ${current.label}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={options.length <= 1}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (wrapRef.current) {
              setResolvedPlacement(
                resolveMenuPlacement(menuPlacement, wrapRef.current.getBoundingClientRect()),
              );
            }
            setOpen((value) => !value);
          }}
        >
          {current.label}
          {options.length > 1 && <TagMenuPlus />}
        </button>
        {open &&
          anchorRect &&
          createPortal(
            <>
              <div className={tagStyles.backdrop} aria-hidden="true" onClick={closeNow} />
              <div
                ref={menuRef}
                id={menuId}
                className={tagStyles.menu}
                role="listbox"
                aria-label={axisLabel}
                tabIndex={-1}
                style={
                  effectivePlacement === 'below'
                    ? { left: anchorRect.left, top: anchorRect.bottom + 6 }
                    : { left: anchorRect.left, bottom: window.innerHeight - anchorRect.top + 6 }
                }
                onKeyDown={(event) => {
                  const items = Array.from(
                    menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
                  );
                  handleListboxKeyDown(event, items, {
                    onEscape: () => {
                      closeNow();
                      buttonRef.current?.focus();
                    },
                  });
                }}
              >
                {options.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="option"
                    aria-selected={option.key === current.key}
                    className={[
                      tagStyles.option,
                      styles.option,
                      option.key === current.key && tagStyles.optionActive,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-testid="gallery-variation-option"
                    data-variation-key={option.key}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pick(option.key);
                    }}
                  >
                    {thumb(option.photo)}
                    <span className={styles.optionLabel}>{option.label}</span>
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )}
      </div>
    </div>
  );
}

/** VariationTag for one single nail: builds its option list (only the
 * options offered for the given shape and length, and the set size when
 * known) and moves the selection onto the first offered one when the current
 * option stops being offered there. Lives here, not in the callers, so all
 * of it loads with the lazy chunk (see LazyVariationTag). */
export function NailVariationPicker({
  item,
  shapeKey,
  lengthKey,
  size,
  ...rest
}: {
  item: GalleryItem;
  shapeKey: string;
  lengthKey: string;
  size: Size | null;
} & Omit<VariationTagProps, 'axisLabel' | 'options'>) {
  const options = useMemo(
    () => variationPickerOptions(item, shapeKey, lengthKey, size),
    [item, shapeKey, lengthKey, size],
  );
  const { active, onSelect } = rest;
  const fallback = options.some((option) => option.key === active) ? null : (options[0]?.key ?? null);
  useEffect(() => {
    if (fallback) onSelect(fallback);
  }, [fallback, onSelect]);
  if (!item.variation) return null;
  return <VariationTag axisLabel={item.variation.label} options={options} {...rest} />;
}
