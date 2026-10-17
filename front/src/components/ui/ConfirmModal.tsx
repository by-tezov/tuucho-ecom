import { CloseIcon } from './CloseIcon';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '../../assets/i18n';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from './Button';
import { ModalBackdrop } from './ModalBackdrop';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** Omit to hide the cancel button and show a top-right close icon instead. */
  cancelLabel?: string;
  /** Accessible label for the close icon. Defaults to the generic "Fermer";
   * never the title, which would name the × after the question it dismisses. */
  closeLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** 'sheet' (default): bottom sheet on mobile, centered dialog on desktop
   * — same shell as AddCardModal. 'dialog': always a
   * centered dialog, even on mobile — for a confirmation the caller wants
   * to read as a deliberate stop, not a swipeable sheet (e.g. disabling
   * PayPal). */
  variant?: 'sheet' | 'dialog';
  /** Ghost (outline) confirm shell with danger text — for destructive
   * confirms such as address delete. Other callers keep the primary confirm. */
  confirmDanger?: boolean;
  /** False for a notice whose one button is the only sensible answer: no
   * close icon beside the title (the button, backdrop and Escape still close). */
  closeIcon?: boolean;
  /** `data-testid` of the panel, for callers built on this shell (StatusModal). */
  testId?: string;
}

/** Generic yes/no confirmation for a decision that deserves more than a
 * native window.confirm() — see `variant` above for the two shells. */
export function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  closeLabel,
  onConfirm,
  onCancel,
  variant = 'sheet',
  confirmDanger = false,
  closeIcon = true,
  testId,
}: ConfirmModalProps) {
  const { t } = useLang();
  useLockBodyScroll();
  const forceDialog = variant === 'dialog';
  const showCancel = cancelLabel != null && cancelLabel !== '';
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const requestClose = useHistoryBackClose(onCancel);

  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop
      className={
        forceDialog ? `${styles.backdrop ?? ''} ${styles.backdropDialog ?? ''}` : (styles.backdrop ?? '')
      }
      label={title}
      onClose={requestClose}
    >
      <div
        ref={panelRef}
        className={forceDialog ? `${styles.panel} ${styles.panelDialog}` : styles.panel}
        role="document"
        aria-labelledby={titleId}
        data-testid={testId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {!showCancel && closeIcon && (
            <button
              type="button"
              className={styles.closeButton}
              onClick={requestClose}
              aria-label={closeLabel ?? t.gallery.close}
              data-modal-close
            >
              <CloseIcon />
            </button>
          )}
        </div>
        <div className={styles.body}>
          {message != null && <div className={styles.message}>{message}</div>}
          <div className={styles.buttonRow}>
            <Button
              type="button"
              variant={confirmDanger ? 'ghostDanger' : 'primary'}
              onClick={onConfirm}
              data-testid="confirm-modal-confirm"
            >
              {confirmLabel}
            </Button>
            {showCancel && (
              <Button variant="ghost" type="button" onClick={requestClose}>
                {cancelLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
