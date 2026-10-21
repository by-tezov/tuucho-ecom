import { useEffect, useId, useRef, useState } from 'react';
import type { Strings } from '../../assets/i18n/types';
import { CART_COMMENT_MAX } from '../../utils/cartComment';
import styles from './CartItemComment.module.css';

/** Pause after the last keystroke before the note is saved; blur saves at once. */
const SAVE_DEBOUNCE_MS = 600;

interface CartItemCommentProps {
  t: Strings;
  /** The saved note ('' when none). */
  comment: string;
  onSave: (comment: string) => void;
  disabled?: boolean;
}

/** "+ Ajouter un commentaire" at the bottom right of a cart card. Same
 * add / field / Supprimer pattern as the size request's own comment
 * (ProductRequestPanel). The note follows the item onto the order, the
 * admin order screen and the invoice. */
export function CartItemComment({ t, comment, onSave, disabled = false }: CartItemCommentProps) {
  const fieldId = useId();
  const [open, setOpen] = useState(comment !== '');
  const [draft, setDraft] = useState(comment);
  const savedRef = useRef(comment);
  const timerRef = useRef<number | null>(null);
  const focusedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Set by the "+ Ajouter" click only, never by a note loaded with the cart. */
  const focusOnOpenRef = useRef(false);

  // A note saved elsewhere (another tab, a cart refresh) replaces the field
  // unless the customer is typing in it.
  useEffect(() => {
    savedRef.current = comment;
    if (focusedRef.current) return;
    setDraft(comment);
    if (comment !== '') setOpen(true);
  }, [comment]);

  useEffect(() => {
    if (!open || !focusOnOpenRef.current) return;
    focusOnOpenRef.current = false;
    textareaRef.current?.focus();
  }, [open]);

  // Leaving the cart mid-pause still saves what was typed.
  const saveRef = useRef<(value: string) => void>(() => undefined);
  const pendingRef = useRef('');
  useEffect(
    () => () => {
      if (timerRef.current === null) return;
      window.clearTimeout(timerRef.current);
      saveRef.current(pendingRef.current);
    },
    [],
  );

  function save(value: string) {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    const next = value.trim();
    if (next === savedRef.current) return;
    savedRef.current = next;
    onSave(next);
  }

  saveRef.current = save;

  function change(value: string) {
    setDraft(value);
    pendingRef.current = value;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save(value), SAVE_DEBOUNCE_MS);
  }

  function remove() {
    setDraft('');
    setOpen(false);
    save('');
  }

  if (!open) {
    return (
      <div className={styles.comment}>
        <button
          type="button"
          className={styles.textLink}
          onClick={() => {
            focusOnOpenRef.current = true;
            setOpen(true);
          }}
          disabled={disabled}
          data-testid="cart-comment-toggle"
        >
          + {t.cart.addCommentLink}
        </button>
      </div>
    );
  }
  return (
    <div className={styles.comment}>
      <div className={styles.field}>
        <span className={styles.fieldHeader}>
          <label className={styles.label} htmlFor={fieldId}>
            {t.cart.requestCommentLabel}
          </label>
          <button
            type="button"
            className={styles.textLink}
            onClick={remove}
            disabled={disabled}
            data-testid="cart-comment-remove"
          >
            {t.address.removeCompanyLink}
          </button>
        </span>
        <textarea
          id={fieldId}
          ref={textareaRef}
          className={styles.textarea}
          value={draft}
          onChange={(event) => change(event.target.value)}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            save(draft);
            if (draft.trim() === '') setOpen(false);
          }}
          maxLength={CART_COMMENT_MAX}
          disabled={disabled}
          data-testid="cart-comment"
          aria-describedby={`${fieldId}-count`}
        />
        <span id={`${fieldId}-count`} className={styles.charCount} data-testid="cart-comment-count">
          {draft.length}/{CART_COMMENT_MAX}
        </span>
      </div>
    </div>
  );
}
