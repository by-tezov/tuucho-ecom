import { CloseIcon } from './CloseIcon';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { ModalBackdrop } from './ModalBackdrop';
import styles from './Lightbox.module.css';

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  closeLabel: string;
}

/** Full-screen photo zoom — order items, product-request photos, stock
 * thumbnails. */
export function Lightbox({ src, alt, onClose, closeLabel }: LightboxProps) {
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(dialogRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={styles.backdrop ?? ''} label={alt || closeLabel} onClose={requestClose}>
      <div ref={dialogRef} className={styles.dialog} tabIndex={-1}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={requestClose}
          aria-label={closeLabel}
          data-modal-close
        >
          <CloseIcon />
        </button>
        {/* The photo sits above the backdrop's dismiss layer, so a second
            click on it needs its own close path — otherwise only the frame
            around the photo dismisses. The button (rather than a click
            handler on the img) is what makes that path reachable with a
            keyboard too. */}
        <button
          type="button"
          className={styles.imageButton}
          onClick={requestClose}
          aria-label={closeLabel}
          tabIndex={-1}
        >
          <img className={styles.image} src={src} alt={alt} loading="eager" draggable={false} />
        </button>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
