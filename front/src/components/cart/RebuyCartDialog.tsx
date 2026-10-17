import { CloseIcon } from '../ui/CloseIcon';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CartSummary } from '../../api/cart';
import { ApiError } from '../../api/errors';
import { isBackendUnavailableError } from '../../api/http';
import type { Lang, Strings } from '../../assets/i18n/types';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import {
  cartDisplayName,
  cartLimitMessage,
  limitedCartCount,
  CART_NAME_MAX_LENGTH,
  formatCartItemCount,
  sortCartsByCreatedAtDesc,
} from '../../utils/cartDisplayName';
import { formatPrice } from '../../utils/formatPrice';
import authFormStyles from '../auth/AuthForm.module.css';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { RequiredFieldsNote, RequiredMark } from '../ui/RequiredMark';
import styles from './RebuyCartDialog.module.css';
import { suppressMouseFocus } from '../../utils/suppressMouseFocus';
import { useScrollHint } from '../../hooks/useScrollHint';
import { useDragScroll } from '../../hooks/useDragScroll';

export interface RebuyCartDialogProps {
  carts: CartSummary[];
  cartLimit: number;
  /** Order number used to prefill the new-cart name (e.g. `CMD-000007`). */
  orderNumber: string;
  t: Strings;
  lang: Lang;
  /** `name` is required when `mode` is `'new'` (trimmed non-empty). */
  onConfirm: (mode: 'new' | 'merge', targetCartId?: string, name?: string) => Promise<void>;
  onCancel: () => void;
}

function defaultCartName(orderNumber: string, t: Strings): string {
  return t.cart.rebuyCartNameDefault.replace('{orderNumber}', orderNumber).slice(0, CART_NAME_MAX_LENGTH);
}

function cartItemLabel(cart: CartSummary, t: Strings, lang: Lang): string {
  return formatCartItemCount(cart.itemCount, t, lang);
}

/** Mode picker for "Commander à nouveau" — create a named cart or merge
 * into an existing one. Centered dialog (not a sheet) on every viewport. */
export function RebuyCartDialog({
  carts,
  cartLimit,
  orderNumber,
  t,
  lang,
  onConfirm,
  onCancel,
}: RebuyCartDialogProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const nameInputId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const cartGridRef = useRef<HTMLDivElement | null>(null);
  const cartGridDragScroll = useDragScroll<HTMLDivElement>();
  const sortedCarts = useMemo(() => sortCartsByCreatedAtDesc(carts), [carts]);
  const [mode, setMode] = useState<'new' | 'merge'>('new');
  const defaultTarget = sortedCarts.find((cart) => cart.isActive)?.id ?? sortedCarts[0]?.id ?? '';
  const [targetCartId, setTargetCartId] = useState(defaultTarget);
  const [name, setName] = useState(() => defaultCartName(orderNumber, t));
  const [nameError, setNameError] = useState<string | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { scrollHint, updateScrollHint, clearScrollHint } = useScrollHint(cartGridRef);
  const trimmedName = name.trim();

  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: requestClose, enabled: !limitOpen, initialFocusRef: nameInputRef });

  useEffect(() => {
    if (mode === 'merge' && !targetCartId && sortedCarts[0]) {
      setTargetCartId(sortedCarts.find((cart) => cart.isActive)?.id ?? sortedCarts[0]!.id);
    }
  }, [mode, targetCartId, sortedCarts]);

  // Scroll-hint chevrons need a layout pass once the merge grid mounts /
  // cart count changes — resize alone would miss scrollHeight changes.
  useLayoutEffect(() => {
    if (mode !== 'merge') {
      clearScrollHint();
      return;
    }
    updateScrollHint();
    const el = cartGridRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(el);
    window.addEventListener('resize', updateScrollHint);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScrollHint);
    };
  }, [mode, carts.length, clearScrollHint, updateScrollHint]);

  const selectNew = () => {
    setMode('new');
    setName(defaultCartName(orderNumber, t));
    setNameError(null);
  };

  const selectMerge = () => {
    if (sortedCarts.length === 0) return;
    setMode('merge');
    setNameError(null);
    if (!targetCartId) {
      setTargetCartId(sortedCarts.find((cart) => cart.isActive)?.id ?? sortedCarts[0]!.id);
    }
  };

  const selectCart = (cartId: string) => {
    setTargetCartId(cartId);
    setMode('merge');
    setNameError(null);
  };

  const handleConfirm = () => {
    if (submitting) return;
    if (mode === 'new') {
      if (!trimmedName) {
        setNameError(t.cart.rebuyDialogNameRequired);
        return;
      }
      if (limitedCartCount(carts) >= cartLimit) {
        setLimitOpen(true);
        return;
      }
      setSubmitting(true);
      void onConfirm('new', undefined, trimmedName)
        .then(onCancel)
        .catch((err: unknown) => {
          setSubmitting(false);
          if (isBackendUnavailableError(err)) return;
          if (err instanceof ApiError && err.code === 'cart_limit_exceeded') {
            setLimitOpen(true);
          }
        });
      return;
    }
    if (!targetCartId) return;
    setSubmitting(true);
    void onConfirm('merge', targetCartId)
      .then(onCancel)
      .catch((err: unknown) => {
        setSubmitting(false);
        if (isBackendUnavailableError(err)) return;
      });
  };

  return createPortal(
    <>
      <ModalBackdrop
        className={styles.backdrop ?? ''}
        label={t.cart.rebuyDialogTitle}
        onClose={requestClose}
        closeOnBackdropClick={!submitting}
      >
        <div ref={panelRef} className={styles.panel}>
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {t.cart.rebuyDialogTitle}
            </h2>
            <button
              type="button"
              className={styles.closeButton}
              onClick={requestClose}
              aria-label={t.auth.closeAria}
              disabled={submitting}
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.body}>
            <div className={styles.optionList}>
              <div
                className={
                  mode === 'new' ? `${styles.optionTile} ${styles.optionTileSelected}` : styles.optionTile
                }
              >
                <label className={styles.optionMain}>
                  <input
                    type="radio"
                    onMouseDown={suppressMouseFocus}
                    name="rebuy-mode"
                    checked={mode === 'new'}
                    onChange={selectNew}
                  />
                  <span>{t.cart.rebuyDialogNew}</span>
                </label>
                {mode === 'new' && (
                  <div className={authFormStyles.field}>
                    <RequiredFieldsNote />
                    <label className={authFormStyles.label} htmlFor={nameInputId}>
                      {t.cart.rebuyDialogNameLabel}
                      <RequiredMark />
                    </label>
                    <div className={authFormStyles.inputActionWrapper}>
                      <input
                        ref={nameInputRef}
                        id={nameInputId}
                        className={authFormStyles.input}
                        name="cart-name"
                        autoComplete="off"
                        value={name}
                        placeholder={t.cart.rebuyDialogNamePlaceholder}
                        maxLength={CART_NAME_MAX_LENGTH}
                        aria-required="true"
                        aria-invalid={nameError != null}
                        aria-describedby={nameError ? `${nameInputId}-error` : undefined}
                        onChange={(event) => {
                          setName(event.target.value);
                          if (nameError) setNameError(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleConfirm();
                          }
                        }}
                      />
                      {name.length > 0 && (
                        <button
                          type="button"
                          className={styles.clearButton}
                          aria-label={t.cart.rebuyDialogClearNameAria}
                          onClick={() => {
                            setName('');
                            setNameError(null);
                            nameInputRef.current?.focus();
                          }}
                        >
                          <CloseIcon size={10} />
                        </button>
                      )}
                    </div>
                    {nameError && (
                      <p id={`${nameInputId}-error`} className={authFormStyles.fieldError} role="alert">
                        {nameError}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {sortedCarts.length > 0 && (
                <div
                  className={
                    mode === 'merge' ? `${styles.optionTile} ${styles.optionTileSelected}` : styles.optionTile
                  }
                >
                  <label className={styles.optionMain}>
                    <input
                      type="radio"
                      onMouseDown={suppressMouseFocus}
                      name="rebuy-mode"
                      checked={mode === 'merge'}
                      onChange={selectMerge}
                    />
                    <span>{t.cart.rebuyDialogMerge}</span>
                  </label>
                  {mode === 'merge' && (
                    <div className={styles.cartGridWrap}>
                      <div
                        ref={cartGridRef}
                        className={
                          scrollHint.up || scrollHint.down
                            ? `${styles.cartGrid} ${styles.cartGridScrollable}`
                            : styles.cartGrid
                        }
                        role="radiogroup"
                        aria-label={t.cart.rebuyDialogSelect}
                        onScroll={updateScrollHint}
                        {...cartGridDragScroll}
                      >
                        {sortedCarts.map((cart) => {
                          const selected = cart.id === targetCartId;
                          return (
                            <button
                              key={cart.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              aria-label={`${cartDisplayName(cart, t)}, ${cartItemLabel(cart, t, lang)}, ${formatPrice(cart.total)}`}
                              className={
                                selected ? `${styles.cartTile} ${styles.cartTileSelected}` : styles.cartTile
                              }
                              onClick={() => selectCart(cart.id)}
                            >
                              <span className={styles.cartTileBody}>
                                <span className={styles.cartTileName}>{cartDisplayName(cart, t)}</span>
                                <span className={styles.cartTileMeta}>{cartItemLabel(cart, t, lang)}</span>
                                <span className={styles.cartTileTotal}>{formatPrice(cart.total)}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
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
                  )}
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <Button type="button" disabled={submitting} onClick={handleConfirm}>
                {t.cart.rebuyDialogConfirm}
              </Button>
            </div>
          </div>
        </div>
      </ModalBackdrop>
      {limitOpen && (
        <ConfirmModal
          variant="dialog"
          title={t.cart.cartLimitTitle}
          message={cartLimitMessage(t, cartLimit)}
          confirmLabel={t.cart.cartLimitOk}
          closeLabel={t.auth.closeAria}
          onConfirm={() => setLimitOpen(false)}
          onCancel={() => setLimitOpen(false)}
        />
      )}
    </>,
    document.body,
  );
}
