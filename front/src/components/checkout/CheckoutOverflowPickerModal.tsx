import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { CloseIcon } from '../ui/CloseIcon';
import { ModalBackdrop } from '../ui/ModalBackdrop';
import { ModalScrollBody } from '../ui/ModalScrollBody';
import styles from '../ui/ModalShell.module.css';
import ownStyles from './CheckoutOverflowPickerModal.module.css';

export type CheckoutOverflowPickerOption = {
  id: string;
  label: string;
  description?: string;
  leading?: ReactNode;
};

interface CheckoutOverflowPickerModalProps {
  title: string;
  closeLabel: string;
  options: CheckoutOverflowPickerOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

/** Ephemeral checkout overflow — pick a payment method or courier hidden from
 * the primary list for this cart session only. */
export function CheckoutOverflowPickerModal({
  title,
  closeLabel,
  options,
  onSelect,
  onClose,
}: CheckoutOverflowPickerModalProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onClose);
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop
      className={`${styles.backdrop} ${styles.bottomSheetBackdrop}`}
      label={title}
      onClose={requestClose}
    >
      <div
        ref={panelRef}
        className={`${styles.dialog} ${styles.dialogScrollable} ${styles.bottomSheet} ${ownStyles.dialogWide}`}
      >
        <button type="button" className={styles.closeButton} onClick={requestClose} aria-label={closeLabel}>
          <CloseIcon size={14} />
        </button>
        <ModalScrollBody>
          <p className={styles.title}>{title}</p>
          <ul className={ownStyles.list}>
            {options.map((option) => (
              <li key={option.id}>
                <button type="button" className={ownStyles.option} onClick={() => onSelect(option.id)}>
                  {option.leading}
                  <span className={ownStyles.optionText}>
                    <span className={ownStyles.optionName}>{option.label}</span>
                    {option.description && (
                      <span className={ownStyles.optionDescription}>{option.description}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ModalScrollBody>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
