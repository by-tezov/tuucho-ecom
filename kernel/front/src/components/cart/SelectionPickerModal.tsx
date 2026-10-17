import { CloseIcon } from '../ui/CloseIcon';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLang } from '../../assets/i18n';
import { localizedPath } from '../../config/i18nRoutes';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { useProductRequest } from '../../hooks/useProductRequest';
import { useOutOfStockSizeFlags } from '../../hooks/useFilterOptions';
import { FIELD_CART_QUANTITY_MAX } from '../../utils/fieldLimits';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { QuantityControl } from '../ui/QuantityControl';
import { ItemPreviewRow } from './ItemPreviewRow';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ProductRequestForm, ProductRequestSent } from './ProductRequestPanel';
import type { Strings } from '../../assets/i18n/types';
import styles from '../ui/ModalShell.module.css';
import ownStyles from './SelectionPickerModal.module.css';

interface SelectionPickerOption {
  key: string;
  label: string;
  muted: boolean;
  /** Size picker only: in-stock ceiling for this specific size — the
   * quantity control clamps to whichever option is currently selected. */
  maxQuantity?: number;
}

/** Turns a muted (out-of-stock) selection into an offer to have it made.
 * Only the size picker supplies this — see CartLine.tsx. */
interface UnavailableRequest {
  /** The signed-in account's address, or null for a guest. */
  accountEmail: string | null;
  /** Resolves once the request reached Shop; rejects on any failure. */
  submit: (key: string, quantity: number, email: string, comment?: string) => Promise<void>;
}

interface SelectionPreview {
  photo: string | null | undefined;
  title: string;
  shapeLabel: string;
  /** Length chip beside shape — same as SizeRequestModal's preview. */
  lengthLabel?: string;
}

interface SelectionPickerModalProps {
  t: Strings;
  /** "Shape" or "Size" — which axis this picker edits. */
  axisLabel: string;
  /** Size picker only: vignette + title + shape stay visible while the
   * heading swaps between choose / request. */
  preview?: SelectionPreview;
  options: SelectionPickerOption[];
  currentKey: string;
  /** Size picker only: quantity control starts here — the line's own
   * current count, so New item / Replace pre-fill instead of forcing a
   * re-entry. Unused (and the control hidden) on the shape axis. */
  currentQuantity?: number;
  onConfirm: (key: string, mode: 'new' | 'replace', quantity: number) => void;
  onCancel: () => void;
  unavailableRequest?: UnavailableRequest;
}

/** Shown when a cart-page shape/size badge is clicked — a cart line's
 * shape/size is part of its identity now (see useCart.tsx's
 * updateCartLine), so this folds "pick a different value" and "decide how
 * to apply it" into one modal instead of two separate steps: pick a chip
 * below, then either add it as a new line or replace this one. Same
 * portal/backdrop/shell as RemoveLineModal.
 *
 * Sold-out chips stay visible. Picking one opens the made-to-order request
 * flow when tuucho-commerce-product-requests is enabled; otherwise the
 * barred chip is inert.
 *
 * The request sub-view mirrors gallery SizeRequestModal (fixed header,
 * intro, enlarged preview with length, guide under chips, gallery notices).
 */
export function SelectionPickerModal({
  t,
  axisLabel,
  preview,
  options,
  currentKey,
  currentQuantity,
  onConfirm,
  onCancel,
  unavailableRequest,
}: SelectionPickerModalProps) {
  const { lang } = useLang();
  const { allowSizeRequest } = useOutOfStockSizeFlags();
  const [selected, setSelected] = useState(currentKey);
  const initialQuantity = Math.max(1, currentQuantity ?? 1);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const selectedOption = options.find((option) => option.key === selected);
  // A line whose own size just went out of stock opens straight on this
  // step — currentKey is itself muted then, which is exactly the moment the
  // offer is most useful.
  const requesting = allowSizeRequest && unavailableRequest !== undefined && selectedOption?.muted === true;
  const isSizePicker = unavailableRequest !== undefined;
  // Nothing is in stock to clamp against once requesting — the shop's own
  // per-line maximum stands in instead (same as the gallery's own
  // SizeRequestModal).
  const quantityMax = requesting
    ? FIELD_CART_QUANTITY_MAX
    : (selectedOption?.maxQuantity ?? FIELD_CART_QUANTITY_MAX);
  const cappedQuantity = Math.min(quantity, quantityMax);
  // A quantity-only edit (same size, new count) is as valid an apply as a
  // size change — the "Replace" path below lands it on the same line.
  const changed = selected !== currentKey || cappedQuantity !== initialQuantity;
  const request = useProductRequest({
    accountEmail: unavailableRequest?.accountEmail ?? null,
    // Unreachable without a handler — the form that calls this only renders
    // when one was supplied — but reject rather than resolve, so a future
    // caller can never get a "request sent" screen for a request nobody sent.
    submit: (email) =>
      unavailableRequest
        ? unavailableRequest.submit(
            selected,
            cappedQuantity,
            email,
            comment.trim() ? comment.trim() : undefined,
          )
        : Promise.reject(new Error('no product-request handler')),
  });
  const chooseHeading = isSizePicker ? t.cart.changeSizeTitle : axisLabel;
  const requestHeading = request.phase === 'sent' ? t.cart.requestSizeSentTitle : t.gallery.sizeRequestTitle;
  const backdropLabel = requesting
    ? requestHeading
    : isSizePicker
      ? chooseHeading
      : t.cart.changeSelectionTitle;
  const sending = request.sending;

  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onCancel);
  // Backdrop, close button and Escape all stand down mid-send: the request
  // is already in flight, and closing here would leave the customer unsure
  // whether it went out.
  useFocusTrap(panelRef, { onEscape: sending ? undefined : requestClose });

  function selectOption(key: string) {
    // The in-flight request is for the size that was selected when it was
    // sent — let the chips move under it and the confirmation would name
    // the wrong one.
    if (sending) return;
    setSelected(key);
    request.clearFailure();
  }

  const sizeChips = (
    <div
      className={isSizePicker ? ownStyles.sizeGrid : styles.pickerGroup}
      role="group"
      aria-label={requesting ? t.gallery.sizeLabel : axisLabel}
    >
      {options.map((option) => (
        <Chip
          key={option.key}
          active={option.key === selected}
          // Size axis: struck-through instead of Chip's own faded
          // look (see .sizeChipUnavailable) — same treatment as the
          // gallery zoom modal's size picker. Shape axis is
          // untouched, still the plain muted/faded look. Not at
          // all once `requesting` (the "Demande ta taille"
          // sub-view) — the customer is asking to have a size made
          // there, which has nothing to do with stock any more.
          muted={isSizePicker ? false : option.muted}
          className={isSizePicker && !requesting && option.muted ? ownStyles.sizeChipUnavailable : undefined}
          // Either look (strike or muted) is visual only: name the state.
          srState={option.muted ? t.product.outOfStock : undefined}
          data-testid="cart-picker-option"
          data-size={option.key}
          onClick={
            isSizePicker && option.muted && !allowSizeRequest ? undefined : () => selectOption(option.key)
          }
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );

  return createPortal(
    <ModalBackdrop
      className={`${styles.backdrop} ${styles.bottomSheetBackdrop}`}
      label={backdropLabel}
      onClose={sending ? () => {} : requestClose}
    >
      <div ref={panelRef} className={`${styles.dialog} ${styles.dialogScrollable} ${styles.bottomSheet}`}>
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

        {requesting ? (
          <>
            <div className={ownStyles.requestHeader}>
              <p className={`${styles.title} ${ownStyles.requestHeaderTitle}`}>{requestHeading}</p>
            </div>
            <ModalScrollBody
              className={styles.bodyUnderHeader!}
              contentKey={`${request.phase}-${commentOpen}-${selected}`}
            >
              {request.phase === 'sent' ? (
                <ProductRequestSent t={t} onDone={onCancel} showTitle={false} />
              ) : (
                <>
                  <p className={styles.text}>{t.gallery.sizeRequestText}</p>
                  {preview && (
                    <ItemPreviewRow
                      photo={preview.photo}
                      alt={preview.title}
                      title={preview.title}
                      shapeLabel={preview.shapeLabel}
                      {...(preview.lengthLabel ? { lengthLabel: preview.lengthLabel } : {})}
                      enlarged
                    />
                  )}
                  <div className={ownStyles.requestSizeSection}>
                    <span className={ownStyles.requestSizeGridLabel}>{t.gallery.sizeLabel}</span>
                    {sizeChips}
                    <Link
                      to={localizedPath('/sizes', lang)}
                      className={ownStyles.requestSizeGuideLink}
                      data-testid="cart-size-request-guide-link"
                    >
                      {t.gallery.sizeGuideLink} <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                  <div className={ownStyles.requestQuantityRow}>
                    <span className={ownStyles.quantityLabel}>{t.cart.quantityLabel}</span>
                    <QuantityControl
                      value={cappedQuantity}
                      max={quantityMax}
                      onChange={setQuantity}
                      ariaLabel={t.cart.quantityLabel}
                      decreaseAria={t.cart.qtyDecreaseAria}
                      increaseAria={t.cart.qtyIncreaseAria}
                      disabled={sending}
                    />
                  </div>
                  <ProductRequestForm
                    t={t}
                    request={request}
                    notice={t.gallery.sizeRequestNotice}
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
          </>
        ) : (
          <ModalScrollBody contentKey={`${request.phase}-${requesting}-${commentOpen}-${selected}`}>
            {request.phase === 'sent' ? (
              <ProductRequestSent t={t} onDone={onCancel} />
            ) : (
              <>
                <p className={`${styles.title} ${styles.titleSwap}`} key={chooseHeading} aria-live="polite">
                  {chooseHeading}
                </p>
                {preview && (
                  <ItemPreviewRow
                    photo={preview.photo}
                    alt={preview.title}
                    title={preview.title}
                    shapeLabel={preview.shapeLabel}
                    {...(preview.lengthLabel ? { lengthLabel: preview.lengthLabel } : {})}
                    enlarged
                  />
                )}
                {isSizePicker && <span className={ownStyles.sizeGridLabel}>{axisLabel}</span>}
                {sizeChips}

                {isSizePicker && (
                  <div className={ownStyles.quantityRow}>
                    <span className={ownStyles.quantityLabel}>{t.cart.quantityLabel}</span>
                    <div className={ownStyles.quantityControlRow}>
                      <QuantityControl
                        className={quantityMax === 1 ? ownStyles.quantityControlLastOne : undefined}
                        value={cappedQuantity}
                        max={quantityMax}
                        onChange={setQuantity}
                        ariaLabel={t.cart.quantityLabel}
                        decreaseAria={t.cart.qtyDecreaseAria}
                        increaseAria={t.cart.qtyIncreaseAria}
                        disabled={sending || quantityMax === 1}
                      />
                      {quantityMax === 1 && (
                        <span className={ownStyles.lastOneNotice}>{t.cart.lastOneInStockNotice}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className={styles.actions}>
                  <Button
                    type="button"
                    disabled={!changed}
                    onClick={() => onConfirm(selected, 'new', cappedQuantity)}
                  >
                    {t.cart.addAsNewLineButton}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={!changed}
                    onClick={() => onConfirm(selected, 'replace', cappedQuantity)}
                  >
                    {t.cart.changeThisLineButton}
                  </Button>
                </div>

                {/* Size axis only. Same .textLink look as ProductRequestPanel's
                    comment toggle — not a one-off style — pushed to the dialog's
                    right edge instead of that one's plain left-aligned flow (see
                    .sizeGuideLink). A real route, not another overlay — see
                    CartLine's own history-tagging effect and CartPage's
                    useCartSizePickerRestore for how platform back / browser
                    back lands here again with this same picker reopened,
                    instead of just a bare cart. */}
                {isSizePicker && (
                  <Link
                    to={localizedPath('/sizes', lang)}
                    className={`${styles.textLink} ${ownStyles.sizeGuideLink}`}
                  >
                    {t.gallery.sizeGuideLink} <span aria-hidden="true">→</span>
                  </Link>
                )}
              </>
            )}
          </ModalScrollBody>
        )}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
