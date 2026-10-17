import { CloseIcon } from '../ui/CloseIcon';
import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../ui/Button';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import type { Strings } from '../../assets/i18n/types';
import styles from '../ui/ModalShell.module.css';

interface FavoriteOrRemoveModalProps {
  t: Strings;
  title: string;
  text: string;
  /** Optional thumbnail + badge(s) row identifying exactly which item this
   * dialog is about — see PreviewRow below, built by each call site since
   * they each have different data at hand (a specific shape+size vs. just
   * a shape). */
  preview?: ReactNode;
  onMoveToWishlist?: () => void;
  /** Omit to hide the "Remove" button — the "Plus tard" button's own dialog
   * only ever offers moving to Wish List or cancelling; a plain removal is already
   * reachable from the delete icon separately. */
  onRemove?: () => void;
  onCancel: () => void;
}

/** Shared by three trigger points that all boil down to "what happens to
 * this line/group": the photo's "Plus tard" button (no onRemove — Wish List
 * or cancel only), the delete icon (Wish List, remove, or cancel), and the
 * quantity stepper hitting 1→0 (same shape as the delete icon, worded
 * around "this is the last one" via lastUnitTitle/lastUnitText). */
export function FavoriteOrRemoveModal({
  t,
  title,
  text,
  preview,
  onMoveToWishlist,
  onRemove,
  onCancel,
}: FavoriteOrRemoveModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={styles.backdrop ?? ''} label={title} onClose={requestClose}>
      <div ref={panelRef} className={styles.dialog}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={requestClose}
          aria-label={t.gallery.close}
        >
          <CloseIcon size={14} />
        </button>
        <p className={styles.title}>{title}</p>
        <p className={styles.text}>{text}</p>
        {preview}
        <div className={styles.actions}>
          {onMoveToWishlist && (
            <Button type="button" onClick={onMoveToWishlist}>
              {t.cart.keepWishlistButton}
            </Button>
          )}
          {onRemove && (
            <Button variant="ghostDanger" type="button" onClick={onRemove}>
              {t.cart.deleteButton}
            </Button>
          )}
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
