import { CloseIcon } from './CloseIcon';
import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { ModalBackdrop } from './ModalBackdrop';
import { ModalScrollBody } from './ModalScrollBody';
import styles from './BottomSheet.module.css';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  /** Sticky action row pinned under the scrollable body (e.g. Save/Cancel). */
  footer?: ReactNode;
}

/** Generic bottom sheet on mobile / centered dialog on desktop — same shell
 * and conventions as ConfirmModal (focus trap, history-back-close, body
 * scroll lock), for arbitrary content instead of a fixed message+buttons
 * layout. Used for admin nav ("Plus"), filter and create-record sheets. */
export function BottomSheet({ title, onClose, closeLabel, children, footer }: BottomSheetProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onClose);

  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={styles.backdrop ?? ''} label={title} onClose={requestClose}>
      <div ref={panelRef} className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={closeLabel}
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>
        <ModalScrollBody {...(styles.scrollBody ? { className: styles.scrollBody } : {})}>
          <div className={footer ? `${styles.body} ${styles.bodyWithFooter}` : styles.body}>{children}</div>
        </ModalScrollBody>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
