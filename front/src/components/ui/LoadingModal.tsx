import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import styles from './LoadingModal.module.css';

interface LoadingModalProps {
  message: string;
}

/** Non-dismissible centered spinner dialog — backdrop, no close while loading.
 * It takes focus as it opens, so screen readers announce the message as the
 * dialog's name (an `aria-busy` live region stays silent), and hands focus
 * back to the control that started the wait when it closes. */
export function LoadingModal({ message }: LoadingModalProps) {
  useLockBodyScroll();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const messageId = useId();

  // No control inside: the trap parks focus on the dialog, keeps Tab there,
  // and, as the front overlay, keeps keys (Escape) off the dialog it covers.
  useFocusTrap(dialogRef);

  return createPortal(
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={messageId}
        tabIndex={-1}
        data-focus-shell=""
      >
        <span className={styles.spinner} aria-hidden="true" />
        <p id={messageId} className={styles.message}>
          {message}
        </p>
      </div>
    </div>,
    document.body,
  );
}
