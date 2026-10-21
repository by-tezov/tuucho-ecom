import { useState } from 'react';
import type { Strings } from '../../assets/i18n/types';
import styles from '../cart/CartItemComment.module.css';

/** The note the customer typed on the cart card, frozen on the order line.
 * On the customer's order page it is hidden behind a link so it does not
 * lengthen every order card; the admin screen passes `label` and always shows
 * it. Renders nothing when the line has no note. */
export function OrderItemComment({
  t,
  comment,
  label,
}: {
  t: Strings;
  comment: string | null | undefined;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!comment) return null;
  if (label !== undefined) {
    return (
      <div className={styles.comment} data-testid="order-comment">
        <p className={`${styles.label} ${styles.commentLabel}`}>{label}</p>
        <p className={styles.commentText}>{comment}</p>
      </div>
    );
  }
  return (
    <div className={styles.comment}>
      <button
        type="button"
        className={styles.textLink}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="order-comment-toggle"
      >
        {open ? t.ordersPage.hideCommentLink : t.ordersPage.showCommentLink}
      </button>
      {open && (
        <p className={styles.commentText} data-testid="order-comment">
          {comment}
        </p>
      )}
    </div>
  );
}
