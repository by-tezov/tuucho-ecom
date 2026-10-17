import { CloseIcon } from '../ui/CloseIcon';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import { Button } from '../ui/Button';
import confirmStyles from '../ui/ConfirmModal.module.css';
import { ModalBackdrop } from '../ui/ModalBackdrop';

interface GoogleEmailChoiceModalProps {
  title: string;
  message: string;
  currentEmail: string;
  /** Provider address shown in the message (`{googleEmail}` / `{facebookEmail}` / `{appleEmail}`). */
  providerEmail: string;
  keepLabel: string;
  switchLabel: string;
  closeLabel: string;
  onKeep: () => void;
  onSwitch: () => void;
  onCancel: () => void;
  busy?: boolean;
  testId?: string;
}

/** Keep-vs-switch dialog for Account social link — same shell as ConfirmModal
 * (sheet on mobile, centered on desktop). */
export function GoogleEmailChoiceModal({
  title,
  message,
  currentEmail,
  providerEmail,
  keepLabel,
  switchLabel,
  closeLabel,
  onKeep,
  onSwitch,
  onCancel,
  busy = false,
  testId = 'account-google-email-choice',
}: GoogleEmailChoiceModalProps) {
  useLockBodyScroll();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const requestClose = useHistoryBackClose(onCancel);
  useFocusTrap(panelRef, { onEscape: requestClose });

  return createPortal(
    <ModalBackdrop className={confirmStyles.backdrop ?? ''} label={title} onClose={requestClose}>
      <div ref={panelRef} className={confirmStyles.panel} data-testid={testId}>
        <div className={confirmStyles.header}>
          <span className={confirmStyles.title}>{title}</span>
          <button
            type="button"
            className={confirmStyles.closeButton}
            onClick={requestClose}
            aria-label={closeLabel}
            disabled={busy}
            data-modal-close
          >
            <CloseIcon />
          </button>
        </div>
        <div className={confirmStyles.body}>
          <p className={confirmStyles.message}>
            {message
              .replace('{currentEmail}', currentEmail)
              .replace('{googleEmail}', providerEmail)
              .replace('{facebookEmail}', providerEmail)
              .replace('{appleEmail}', providerEmail)}
          </p>
          <div className={confirmStyles.buttonRow}>
            <Button type="button" disabled={busy} onClick={onKeep} data-testid="account-social-email-keep">
              {keepLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={onSwitch}
              data-testid="account-social-email-switch"
            >
              {switchLabel}
            </Button>
          </div>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}
