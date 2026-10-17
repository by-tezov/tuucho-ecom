import { useId } from 'react';
import type { Strings } from '../../assets/i18n/types';
import type { ProductRequestState } from '../../hooks/useProductRequest';
import { FIELD_PRODUCT_REQUEST_COMMENT_MAX } from '../../utils/fieldLimits';
import { Button } from '../ui/Button';
import styles from '../ui/ModalShell.module.css';
import commentStyles from './CartItemComment.module.css';

interface ProductRequestCommentProps {
  open: boolean;
  comment: string;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  disabled?: boolean;
}

interface ProductRequestFormProps {
  t: Strings;
  request: ProductRequestState;
  /** The explanatory line above the field — each modal words the same
   * situation for its own context. */
  notice?: string;
  /** Optional note — rendered after the email field and before the send
   * button when supplied. */
  comment?: ProductRequestCommentProps;
}

/** The made-to-order offer: why it's shown, where to answer, and the
 * send button. Rendered by both SelectionPickerModal and OutOfStockModal;
 * the phase lives in useProductRequest so each can also swap its whole
 * dialog for ProductRequestSent below once it goes through. */
export function ProductRequestForm({ t, request, notice, comment }: ProductRequestFormProps) {
  return (
    <div className={styles.requestBlock} data-testid="cart-size-request">
      <p className={styles.requestNotice}>{notice ?? t.cart.requestSizeNotice}</p>
      {request.needsEmail && (
        <label className={styles.requestField}>
          <span className={styles.requestFieldLabel}>{t.cart.requestSizeEmailLabel}</span>
          <input
            type="email"
            className={styles.requestInput}
            value={request.email}
            onChange={(e) => request.setEmail(e.target.value)}
            disabled={request.sending}
            autoComplete="email"
            inputMode="email"
          />
        </label>
      )}
      {comment && (
        <ProductRequestComment t={t} {...comment} disabled={comment.disabled === true || request.sending} />
      )}
      {request.sending && (
        <p className={styles.requestStatus} role="status" aria-live="polite">
          <span className={styles.requestSpinner} aria-hidden="true" />
          {t.cart.requestSizeSending}
        </p>
      )}
      {request.phase === 'failed' && (
        <p className={styles.requestError} role="alert">
          {t.cart.requestSizeError}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          type="button"
          disabled={!request.canSubmit}
          onClick={request.submitRequest}
          data-testid="cart-size-request-send"
        >
          {t.cart.requestSizeButton}
        </Button>
      </div>
    </div>
  );
}

/** Optional note after the email field — same add / field / Supprimer
 * pattern as the address form's raison sociale. */
function ProductRequestComment({
  t,
  open,
  comment,
  onOpen,
  onClose,
  onChange,
  disabled,
}: {
  t: Strings;
  open: boolean;
  comment: string;
  onOpen: () => void;
  onClose: () => void;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const commentId = useId();
  if (!open) {
    return (
      <button
        type="button"
        className={styles.textLink}
        onClick={onOpen}
        disabled={disabled}
        data-testid="cart-size-request-comment-toggle"
      >
        + {t.cart.addCommentLink}
      </button>
    );
  }
  return (
    <div className={styles.requestField}>
      <span className={styles.fieldHeader}>
        <label className={styles.requestFieldLabel} htmlFor={commentId}>
          {t.cart.requestCommentLabel}
        </label>
        <button
          type="button"
          className={styles.textLink}
          onClick={onClose}
          disabled={disabled}
          data-testid="cart-size-request-comment-remove"
        >
          {t.address.removeCompanyLink}
        </button>
      </span>
      <textarea
        id={commentId}
        className={`${styles.requestInput} ${styles.requestTextarea}`}
        value={comment}
        onChange={(e) => onChange(e.target.value)}
        maxLength={FIELD_PRODUCT_REQUEST_COMMENT_MAX}
        disabled={disabled}
        data-testid="cart-size-request-comment"
        aria-describedby={`${commentId}-count`}
      />
      <span
        id={`${commentId}-count`}
        className={commentStyles.charCount}
        data-testid="cart-size-request-comment-count"
      >
        {comment.length}/{FIELD_PRODUCT_REQUEST_COMMENT_MAX}
      </span>
    </div>
  );
}

/** Replaces the dialog body once the request is out — "we'll get back to
 * you", then a single OK that closes back to the cart. */
export function ProductRequestSent({
  t,
  onDone,
  showTitle = true,
}: {
  t: Strings;
  onDone: () => void;
  showTitle?: boolean;
}) {
  return (
    <>
      {showTitle && <p className={styles.title}>{t.cart.requestSizeSentTitle}</p>}
      <p className={styles.text}>{t.cart.requestSizeSentText}</p>
      <div className={styles.actions}>
        <Button type="button" onClick={onDone} data-testid="cart-size-request-ok">
          {t.cart.requestSizeOkButton}
        </Button>
      </div>
    </>
  );
}
