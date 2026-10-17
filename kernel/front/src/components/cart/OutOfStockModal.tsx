import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useProductRequest } from '../../hooks/useProductRequest';
import { useOutOfStockSizeFlags } from '../../hooks/useFilterOptions';
import { Button } from '../ui/Button';
import { ItemPreviewRow } from './ItemPreviewRow';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ProductRequestForm, ProductRequestSent } from './ProductRequestPanel';
import type { Strings } from '../../assets/i18n/types';
import styles from '../ui/ModalShell.module.css';

interface OutOfStockModalProps {
  t: Strings;
  /** Thumbnail + title + shape/length/size badges, so the customer can tell
   * which of several lines this is about without closing the dialog. */
  photo: string | null | undefined;
  title: string;
  shapeLabel: string;
  lengthLabel: string;
  size: string;
  /** Null for a guest — they type where the answer should go. */
  accountEmail: string | null;
  /** Resolves once the request reached Shop; rejects on any failure. */
  onRequestMade: (email: string, comment?: string) => Promise<void>;
  /** Drops the line outright — no second confirmation, the customer has
   * already been told the item is gone and chose this over waiting. */
  onRemove: () => void;
  onCancel: () => void;
}

/** Opened from the "no longer in stock" notice under a cart line (see
 * CartLine.tsx). That notice used to be a dead end: the line sat there
 * unbuyable with nothing to do about it. Here the same two ways out the
 * size picker offers are spelled out — have it made, or remove it — with
 * the item shown so neither choice is made blind. */
export function OutOfStockModal({
  t,
  photo,
  title,
  shapeLabel,
  lengthLabel,
  size,
  accountEmail,
  onRequestMade,
  onRemove,
  onCancel,
}: OutOfStockModalProps) {
  const { allowSizeRequest } = useOutOfStockSizeFlags();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const request = useProductRequest({
    accountEmail,
    submit: (email) => onRequestMade(email, comment.trim() ? comment.trim() : undefined),
  });
  const sending = request.sending;

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: sending ? undefined : requestClose });

  return createPortal(
    <ModalBackdrop
      className={`${styles.backdrop} ${styles.bottomSheetBackdrop}`}
      label={t.cart.outOfStockModalTitle}
      onClose={sending ? () => {} : requestClose}
    >
      <div
        ref={panelRef}
        className={`${styles.dialog} ${styles.dialogScrollable} ${styles.bottomSheet}`}
        data-testid="cart-out-of-stock-modal"
      >
        {!sending && (
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label={t.gallery.close}
          >
            <CloseIcon size={14} />
          </button>
        )}

        <ModalScrollBody contentKey={`${request.phase}-${commentOpen}`}>
          {request.phase === 'sent' ? (
            <ProductRequestSent t={t} onDone={onCancel} />
          ) : (
            <>
              <p className={styles.title}>{t.cart.outOfStockModalTitle}</p>
              <p className={styles.text}>{t.cart.outOfStockModalText}</p>
              <ItemPreviewRow
                photo={photo}
                alt={title}
                title={title}
                shapeLabel={shapeLabel}
                lengthLabel={lengthLabel}
                sizeLabels={size ? [size] : []}
              />
              {allowSizeRequest && (
                <ProductRequestForm
                  t={t}
                  request={request}
                  notice={t.cart.outOfStockModalRequestNotice}
                  comment={{
                    open: commentOpen,
                    comment,
                    onOpen: () => setCommentOpen(true),
                    onClose: () => {
                      setCommentOpen(false);
                      setComment('');
                    },
                    onChange: setComment,
                  }}
                />
              )}
              {/* Outside the request block: removing is the alternative to
                requesting, not a step of it. */}
              <div className={styles.actions}>
                <Button
                  variant="ghostDanger"
                  type="button"
                  disabled={sending}
                  onClick={onRemove}
                  data-testid="cart-out-of-stock-remove"
                >
                  {t.cart.outOfStockRemoveButton}
                </Button>
              </div>
            </>
          )}
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
