import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError } from '../../api/errors';
import { isBackendUnavailableError } from '../../api/http';
import type { Strings } from '../../assets/i18n/types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { cartLimitMessage, CART_NAME_MAX_LENGTH } from '../../utils/cartDisplayName';
import authFormStyles from '../auth/AuthForm.module.css';
import { Button } from '../ui/Button';
import { CloseIcon } from '../ui/CloseIcon';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { RequiredMark } from '../ui/RequiredMark';
import styles from './CartSwitcher.module.css';

/** Centered name prompt used for both create-cart and rename. */
export function CartNameDialog({
  title,
  confirmLabel,
  placeholder,
  closeLabel,
  initialName,
  t,
  cartLimit,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
  placeholder: string;
  closeLabel: string;
  initialName: string;
  t: Strings;
  cartLimit: number;
  onConfirm: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: requestClose });
  const nameInputId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(() => initialName.slice(0, CART_NAME_MAX_LENGTH));
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const submit = () => {
    if (saving) return;
    if (!trimmed) {
      setNameError(t.cart.cartNameRequiredError);
      nameInputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    setNameError(null);
    void onConfirm(trimmed)
      .then(onCancel)
      .catch((err: unknown) => {
        setSaving(false);
        if (isBackendUnavailableError(err)) return;
        if (err instanceof ApiError && err.code === 'cart_limit_exceeded') {
          setError(cartLimitMessage(t, cartLimit));
        }
      });
  };

  return createPortal(
    <ModalBackdrop className={styles.renameBackdrop ?? ''} label={title} onClose={requestClose}>
      <div ref={panelRef} className={styles.renameDialog}>
        <div className={styles.renameHeader}>
          <h2 className={styles.renameTitle}>{title}</h2>
          <button
            type="button"
            className={styles.renameClose}
            onClick={requestClose}
            aria-label={closeLabel}
            disabled={saving}
          >
            <CloseIcon />
          </button>
        </div>
        <div className={styles.renameBody}>
          <div className={authFormStyles.field}>
            <label className={authFormStyles.label} htmlFor={nameInputId}>
              {placeholder}
              <RequiredMark />
            </label>
            <div className={authFormStyles.inputActionWrapper}>
              <input
                ref={nameInputRef}
                id={nameInputId}
                className={authFormStyles.input}
                name="cart-name"
                data-testid="cart-name-input"
                autoComplete="off"
                value={name}
                placeholder={placeholder}
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
                    submit();
                  }
                }}
              />
              {name.length > 0 && (
                <button
                  type="button"
                  className={styles.clearButton}
                  aria-label={t.cart.rebuyDialogClearNameAria}
                  disabled={saving}
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
          <div className={styles.renameActions}>
            <Button type="button" disabled={saving} data-testid="cart-name-confirm" onClick={submit}>
              {confirmLabel}
            </Button>
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
