import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './LoadingModal.module.css';

interface LoadingModalProps {
  message: string;
  children?: ReactNode;
}

/** Non-dismissible centered spinner dialog — backdrop, no close while loading.
 * It takes focus as it opens, so screen readers announce the message as the
 * dialog's name (an `aria-busy` live region stays silent), and hands focus
 * back to the control that started the wait when it closes. */
function LoadingModalRoot({ message, children }: LoadingModalProps) {
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
        className={children ? `${styles.dialog} ${styles.dialogWide}` : styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-busy="true"
        aria-labelledby={messageId}
        tabIndex={-1}
        data-focus-shell=""
      >
        <span className={styles.spinner} aria-hidden="true" />
        <p id={messageId} className={styles.message}>
          {message}
        </p>
        {children ? <div className={styles.detail}>{children}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export const LoadingModal = withKernelUi(KERNEL_UI.LoadingModal, LoadingModalRoot);
