import { useLang } from '../../assets/i18n';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { ConfirmModal } from './ConfirmModal';

interface StatusModalProps {
  message: string;
  /** Runs when the customer dismisses the notice (button, Escape, backdrop,
   * platform back). Put the follow-up here (close the parent, navigate): a
   * message that closes or redirects on a timer fails RGAA 13.1. */
  onClose: () => void;
}

/** Success notice shown between a confirmed server action and what follows
 * it. A one-button ConfirmModal: the dialog takes focus as it opens, so the
 * message is announced, and nothing happens until the customer continues. */
function StatusModalRoot({ message, onClose }: StatusModalProps) {
  const { t } = useLang();
  return (
    <ConfirmModal
      title={message}
      message={null}
      confirmLabel={t.continueAction}
      onConfirm={onClose}
      onCancel={onClose}
      variant="dialog"
      closeIcon={false}
      testId="status-modal"
    />
  );
}

export const StatusModal = withKernelUi(KERNEL_UI.StatusModal, StatusModalRoot);
