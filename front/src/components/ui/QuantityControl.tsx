import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { FilterSheet } from '../gallery/FilterSheet';
import type { FilterOption } from '../../api/filterOptions';
import { shopConfig } from '../../config/env';
import styles from './QuantityControl.module.css';

const SELECT_THRESHOLD = shopConfig.quantitySelectThreshold;
const FIVE_PLUS = 'plus';
/** Match PhotoLightbox / CartPage / gallery mobile breakpoint. */
const MOBILE_MQ = '(max-width: 1023px)';
const DROPDOWN_GAP = 4;
const DROPDOWN_Z = 1100;

export interface QuantityControlProps {
  value: number;
  /** Stock (or other) ceiling — options and stepper clamp to this. */
  max: number;
  onChange: (quantity: number) => void;
  /** Cart: include `0` in the select; choosing it (or − at 1) calls `onZero`. */
  allowZero?: boolean | undefined;
  onZero?: (() => void) | undefined;
  ariaLabel: string;
  decreaseAria: string;
  increaseAria: string;
  className?: string | undefined;
  disabled?: boolean | undefined;
  /** This control is being used inside something already above the
   * z-index:1000 product zoom modal (e.g. SizeRequestModal.aboveLightbox) —
   * bump the mobile FilterSheet / desktop dropdown to the next rung (1200,
   * same as LoadingModal) instead of the plain top-level 1100, or they'd
   * render underneath it. */
  aboveLightbox?: boolean | undefined;
}

function useIsMobileQuantityPicker(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

/**
 * Compact quantity control: custom list for 0..N / N+ (N = shopConfig's
 * quantitySelectThreshold), switching to a matching +/- stepper above N. Both
 * modes share a fixed outer size so the layout does
 * not jump. Mobile opens FilterSheet (gallery filter pattern); desktop opens an
 * anchored dropdown at the trigger. Native <select> is avoided — inside the
 * lightbox sheet it misplaces the system picker on mobile.
 */
export function QuantityControl({
  value,
  max,
  onChange,
  allowZero = false,
  onZero,
  ariaLabel,
  decreaseAria,
  increaseAria,
  className,
  disabled = false,
  aboveLightbox = false,
}: QuantityControlProps) {
  const [listOpen, setListOpen] = useState(false);
  const isMobile = useIsMobileQuantityPicker();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const dropdownZ = aboveLightbox ? 1200 : DROPDOWN_Z;
  const cappedMax = Math.max(0, max);
  const showStepper = value > SELECT_THRESHOLD && cappedMax > SELECT_THRESHOLD;
  const selectCeiling = Math.min(SELECT_THRESHOLD, Math.max(allowZero ? 0 : 1, cappedMax));
  const showFivePlus = cappedMax > SELECT_THRESHOLD;
  const isDisabled = disabled || cappedMax === 0;
  const onZeroRef = useRef(onZero);
  onZeroRef.current = onZero;
  // Mobile FilterSheet closes with history.back(). Opening "Retirer cet
  // article" (another history-backed overlay) in the same click lets that
  // pending back dismiss the confirm dialog — or pop the cart and land on
  // the previous route (gallery). Hold the zero until the sheet is gone.
  const pendingZeroRef = useRef(false);

  const options = useMemo((): FilterOption[] => {
    const list: FilterOption[] = [];
    if (allowZero) list.push({ value: '0', label: '0' });
    for (let n = 1; n <= selectCeiling; n += 1) {
      list.push({ value: String(n), label: String(n) });
    }
    if (showFivePlus) list.push({ value: FIVE_PLUS, label: `${SELECT_THRESHOLD}+` });
    return list;
  }, [allowZero, selectCeiling, showFivePlus]);

  useEffect(() => {
    if (listOpen || !pendingZeroRef.current) return;
    pendingZeroRef.current = false;
    onZeroRef.current?.();
  }, [listOpen]);

  function setQuantity(next: number) {
    const clamped = Math.min(Math.max(allowZero ? 0 : 1, next), Math.max(allowZero ? 0 : 1, cappedMax));
    if (clamped === 0 && allowZero) {
      onZero?.();
      return;
    }
    if (clamped < 1 || clamped === value) return;
    onChange(clamped);
  }

  function handleSelectChange(raw: string) {
    if (raw === '0') {
      if (isMobile && listOpen) {
        pendingZeroRef.current = true;
        return;
      }
      onZero?.();
      return;
    }
    if (raw === FIVE_PLUS) {
      // C: keep if already ≥6, otherwise jump to 6 (clamped to max).
      const next = value >= SELECT_THRESHOLD + 1 ? value : Math.min(SELECT_THRESHOLD + 1, cappedMax);
      if (next !== value) onChange(next);
      return;
    }
    const next = Number(raw);
    if (!Number.isFinite(next) || next === value) return;
    onChange(next);
  }

  function changeBy(delta: number) {
    if (isDisabled) return;
    if (delta < 0 && value <= 1) {
      if (allowZero) onZero?.();
      return;
    }
    setQuantity(value + delta);
  }

  const closeList = useCallback(() => {
    setListOpen(false);
    setMenuStyle(null);
  }, []);

  function pickOption(raw: string) {
    handleSelectChange(raw);
    closeList();
    triggerRef.current?.focus();
  }

  const positionMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportPad = 8;
    const estimatedHeight = Math.min(options.length * 40 + 16, window.innerHeight - viewportPad * 2);
    const spaceBelow = window.innerHeight - rect.bottom - DROPDOWN_GAP - viewportPad;
    const spaceAbove = rect.top - DROPDOWN_GAP - viewportPad;
    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const width = Math.max(rect.width, 7.5 * 16);
    let left = rect.left;
    if (left + width > window.innerWidth - viewportPad) {
      left = Math.max(viewportPad, window.innerWidth - viewportPad - width);
    }
    if (openUp) {
      setMenuStyle({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + DROPDOWN_GAP,
        left,
        width,
        zIndex: dropdownZ,
        maxHeight: Math.max(80, spaceAbove),
      });
      return;
    }
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + DROPDOWN_GAP,
      left,
      width,
      zIndex: dropdownZ,
      maxHeight: Math.max(80, spaceBelow),
    });
  }, [dropdownZ, options.length]);

  useLayoutEffect(() => {
    if (!listOpen || isMobile) return;
    positionMenu();
    function onReposition() {
      positionMenu();
    }
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isMobile, listOpen, positionMenu]);

  useEffect(() => {
    if (!listOpen || isMobile) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listboxRef.current?.contains(target)) return;
      closeList();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase: close only this list, not the dialog around it.
        e.preventDefault();
        e.stopPropagation();
        closeList();
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [closeList, isMobile, listOpen]);

  useEffect(() => {
    if (!listOpen || isMobile) return;
    const selected = listboxRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (selected ?? listboxRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
  }, [listOpen, isMobile]);

  // Drop the open picker when the layout crosses the mobile/desktop
  // breakpoint so a sheet is never left up on desktop or a dropdown on
  // mobile. Must not list `listOpen`: that closed the picker the instant
  // it opened (and on mobile the FilterSheet's history cleanup then
  // dismissed the product zoom modal behind it).
  useEffect(() => {
    closeList();
  }, [closeList, isMobile]);

  const rootClass = className ? `${styles.root} ${className}` : styles.root;
  const selectValue = String(Math.min(Math.max(value, allowZero ? 0 : 1), selectCeiling));
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectValue),
  );

  function onListKeyDown(e: ReactKeyboardEvent<HTMLUListElement>) {
    const optionEls = listboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!optionEls?.length) return;
    const current = Array.from(optionEls).findIndex((el) => el === document.activeElement);
    const focusAt = (index: number) => {
      const next = ((index % optionEls.length) + optionEls.length) % optionEls.length;
      optionEls[next]?.focus();
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt((current < 0 ? activeIndex : current) + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt((current < 0 ? activeIndex : current) - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(optionEls.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeList();
      triggerRef.current?.focus();
    }
  }

  if (showStepper) {
    return (
      <div className={rootClass} role="group" aria-label={ariaLabel}>
        <button
          type="button"
          className={styles.button}
          onClick={() => changeBy(-1)}
          aria-label={decreaseAria}
          disabled={isDisabled}
        >
          −
        </button>
        {/* Focus stays on −/+, whose names never change: announce the new count. */}
        <span className={styles.value} aria-live="polite" aria-atomic="true">
          {value}
        </span>
        <button
          type="button"
          className={styles.button}
          onClick={() => changeBy(1)}
          aria-label={increaseAria}
          disabled={isDisabled || value >= cappedMax}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${rootClass} ${styles.selectRoot}`}
        // The label alone would replace the visible count: keep it in the name.
        aria-label={`${ariaLabel}, ${selectValue}`}
        aria-haspopup="listbox"
        aria-expanded={listOpen}
        aria-controls={listOpen && !isMobile ? listId : undefined}
        disabled={isDisabled}
        onClick={() => setListOpen((open) => !open)}
      >
        <span className={styles.value}>{selectValue}</span>
        <svg
          className={styles.chevron}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {listOpen && isMobile && (
        <FilterSheet
          label={ariaLabel}
          options={options}
          value={selectValue}
          onChange={handleSelectChange}
          onClose={closeList}
          aboveLightbox={aboveLightbox}
        />
      )}
      {listOpen &&
        !isMobile &&
        menuStyle &&
        createPortal(
          <ul
            ref={listboxRef}
            id={listId}
            className={styles.dropdown}
            style={menuStyle}
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
          >
            {options.map((option) => {
              const active = option.value === selectValue;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    className={active ? `${styles.option} ${styles.optionActive}` : styles.option}
                    onClick={() => pickOption(option.value)}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
