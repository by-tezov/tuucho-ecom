import { forwardRef, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import styles from './ModalBackdrop.module.css';

interface ModalBackdropProps {
  className: string;
  label: string;
  /** Screen-reader-only description, announced with the dialog's name. */
  description?: string | undefined;
  onClose: () => void;
  /** Forms may require their explicit close control to avoid losing edits. */
  closeOnBackdropClick?: boolean | undefined;
  hidden?: boolean | undefined;
  /** Nested overlay open above this layer — blocks focus and pointer hit-testing. */
  inert?: boolean | undefined;
  /**
   * Close on pointerdown and cancel the compatibility click. Use when this
   * layer sits above another interactive surface: unmounting on `click` can
   * leave that click for the layer below (e.g. size request over zoom).
   */
  dismissOnPointerDown?: boolean | undefined;
  children: ReactNode;
  onPointerDown?: (event: PointerEvent<HTMLDialogElement>) => void;
  onPointerMove?: (event: PointerEvent<HTMLDialogElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLDialogElement>) => void;
  onPointerCancel?: (event: PointerEvent<HTMLDialogElement>) => void;
}

/**
 * Native dialog backdrop shared by modal features. A button covers the
 * backdrop, keeping panel markup free from click-to-stop-propagation
 * handlers while retaining pointer support for draggable sheets. It is a
 * pointer affordance only: hidden from assistive technologies and out of the
 * tab order, since the panel's own × and Escape already close the dialog. A
 * screen reader would otherwise meet a button named after the dialog title
 * (e.g. "Supprimer cette adresse ?") that actually cancels.
 */
export const ModalBackdrop = forwardRef<HTMLDialogElement, ModalBackdropProps>(function ModalBackdrop(
  {
    className,
    label,
    description,
    onClose,
    closeOnBackdropClick = true,
    hidden,
    inert,
    dismissOnPointerDown = false,
    children,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  },
  ref,
) {
  const descriptionId = useId();
  // A click is a press and a release. A layer opened on `pointerup` (gallery
  // card tap) mounts before the browser's compatibility click for that same
  // tap, which then hit-tests onto this new layer: on mobile the zoom closed
  // straight away ("blink, tap again"). Only a click whose press started
  // inside this dialog counts. Keyboard and scripted clicks (detail 0) pass.
  const pressedInsideRef = useRef(false);
  return (
    <dialog
      ref={ref}
      open
      hidden={hidden}
      aria-label={label}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      className={`${styles.root} ${className}`}
      {...(inert ? { inert: true } : {})}
      onPointerDownCapture={() => {
        pressedInsideRef.current = true;
      }}
      onClickCapture={(event) => {
        if (pressedInsideRef.current || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {closeOnBackdropClick && (
        <button
          type="button"
          className={styles.dismiss}
          tabIndex={-1}
          aria-hidden="true"
          onPointerDown={
            dismissOnPointerDown
              ? (event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  onClose();
                }
              : undefined
          }
          onClick={(event) => {
            if (dismissOnPointerDown) {
              // Pointer path already closed on pointerdown. A leftover
              // mouse click (detail > 0) must not call onClose again —
              // that would history.back() the parent overlay. A scripted
              // click() uses detail 0.
              if (event.detail !== 0) return;
            }
            onClose();
          }}
        />
      )}
      {description && (
        <span id={descriptionId} className={styles.description}>
          {description}
        </span>
      )}
      {children}
    </dialog>
  );
});
