import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useProductRequest, useSubmitProductRequest } from '../../hooks/useProductRequest';
import { useAuthSession } from '../../state/AuthContext';
import { useOptionalGiftReceiver } from '../../hooks/useGiftReceiver';
import { SIZES } from '../../data/sizes';
import { FIELD_CART_QUANTITY_MAX } from '../../utils/fieldLimits';
import type { Size } from '../../api/cart';
import { Chip } from '../ui/Chip';
import { QuantityControl } from '../ui/QuantityControl';
import { ItemPreviewRow } from '../cart/ItemPreviewRow';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ProductRequestForm, ProductRequestSent } from '../cart/ProductRequestPanel';
import styles from '../ui/ModalShell.module.css';
import ownStyles from './SizeRequestModal.module.css';

interface SizeRequestModalProps {
  productId: string;
  shapeKey: string;
  lengthKey: string;
  photo: string | null | undefined;
  title: string;
  shapeLabel: string;
  lengthLabel: string;
  /** Size already chosen in the product modal (muted OOS chip). Omit when
   * opened from a fully-out-of-stock CTA — the customer picks here. */
  initialSize?: Size;
  /** Set when opened from the product modal, which is itself a full-screen
   * backdrop this has to clear. */
  aboveLightbox?: boolean;
  onClose: () => void;
}

/** "Demandez votre taille" — from a card/product modal when a shape has
 * no size left, or from a muted size chip in the zoom modal (then
 * initialSize is that chip). */
export function SizeRequestModal({
  productId,
  shapeKey,
  lengthKey,
  photo,
  title,
  shapeLabel,
  lengthLabel,
  initialSize,
  aboveLightbox = false,
  onClose,
}: SizeRequestModalProps) {
  const { t, lang } = useLang();
  const gift = useOptionalGiftReceiver();
  const { status, user } = useAuthSession();
  const submitProductRequest = useSubmitProductRequest();
  const [size, setSize] = useState<Size | null>(initialSize ?? null);
  const [quantity, setQuantity] = useState(1);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const request = useProductRequest({
    accountEmail: status === 'authenticated' ? (user?.email ?? null) : null,
    submit: (email) =>
      size
        ? submitProductRequest(
            {
              productId,
              shapeKey,
              lengthKey,
              size,
              quantity,
              ...(comment.trim() ? { comment: comment.trim() } : {}),
            },
            email,
          )
        : Promise.reject(new Error('no size selected')),
  });
  const sending = request.sending;

  useLockBodyScroll(!gift.active);
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: sending || gift.active ? undefined : requestClose });
  if (gift.active) return null;

  return createPortal(
    <ModalBackdrop
      className={[styles.backdrop, ownStyles.bottomSheetBackdrop, aboveLightbox && ownStyles.aboveLightbox]
        .filter(Boolean)
        .join(' ')}
      label={t.gallery.sizeRequestTitle}
      onClose={sending ? () => {} : requestClose}
      // Above the zoom modal: close on pointerdown and cancel the click so
      // the gesture cannot land on the lightbox (or the gallery under it).
      {...(aboveLightbox ? { dismissOnPointerDown: true } : {})}
    >
      <div
        ref={panelRef}
        className={`${styles.dialog} ${styles.dialogScrollable} ${ownStyles.bottomSheet}`}
        data-testid="gallery-size-request-modal"
      >
        {!sending && (
          <button
            type="button"
            className={styles.closeButton}
            onPointerDown={(event) => {
              if (sending || event.button !== 0) return;
              if (!aboveLightbox) return;
              event.preventDefault();
              requestClose();
            }}
            onClick={(event) => {
              if (sending) return;
              // Same as backdrop: avoid a second history.back() after the
              // pointerdown close when opened above the zoom modal.
              if (aboveLightbox && event.detail !== 0) return;
              requestClose();
            }}
            aria-label={t.gallery.close}
          >
            <CloseIcon size={14} />
          </button>
        )}

        <div className={ownStyles.header}>
          <p className={`${styles.title} ${ownStyles.headerTitle}`}>
            {request.phase === 'sent' ? t.cart.requestSizeSentTitle : t.gallery.sizeRequestTitle}
          </p>
        </div>

        <ModalScrollBody
          className={styles.bodyUnderHeader!}
          contentKey={`${request.phase}-${commentOpen}-${size ?? ''}`}
        >
          {request.phase === 'sent' ? (
            <ProductRequestSent t={t} onDone={requestClose} showTitle={false} />
          ) : (
            <>
              <p className={styles.text}>{t.gallery.sizeRequestText}</p>
              <ItemPreviewRow
                photo={photo}
                alt={title}
                title={title}
                shapeLabel={shapeLabel}
                lengthLabel={lengthLabel}
              />
              <div className={ownStyles.sizeSection}>
                <span className={ownStyles.sizeGridLabel}>{t.gallery.sizeLabel}</span>
                <div className={ownStyles.sizeGrid} role="group" aria-label={t.gallery.sizeLabel}>
                  {SIZES.map((option) => (
                    <Chip
                      key={option}
                      active={option === size}
                      data-testid="gallery-size-request-size"
                      data-size={option}
                      onClick={() => {
                        if (sending) return;
                        setSize(option);
                        request.clearFailure();
                      }}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
                <Link
                  to={localizedPath('/sizes', lang)}
                  className={ownStyles.sizeGuideLink}
                  data-testid="gallery-size-request-guide-link"
                >
                  {t.gallery.sizeGuideLink} →
                </Link>
              </div>
              <div className={ownStyles.quantityRow}>
                <span className={ownStyles.quantityLabel}>{t.cart.quantityLabel}</span>
                <QuantityControl
                  value={quantity}
                  max={FIELD_CART_QUANTITY_MAX}
                  onChange={setQuantity}
                  ariaLabel={t.cart.quantityLabel}
                  decreaseAria={t.cart.qtyDecreaseAria}
                  increaseAria={t.cart.qtyIncreaseAria}
                  disabled={sending}
                  aboveLightbox={aboveLightbox}
                />
              </div>
              <ProductRequestForm
                t={t}
                request={size ? request : { ...request, canSubmit: false }}
                notice={size ? t.gallery.sizeRequestNotice : t.gallery.sizeRequestPickSize}
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
            </>
          )}
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
