import { createPortal } from 'react-dom';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { ModalBackdrop } from './ModalBackdrop';
import { CloseIcon } from './CloseIcon';
import { useHistoryBackClose } from '../../hooks/useHistoryBackClose';
import { useLockBodyScroll } from '../../hooks/useLockBodyScroll';
import styles from './AdminPhotoLightbox.module.css';

type AdminPhotoLightboxProps = {
  src: string;
  alt: string;
  onClose: () => void;
  closeLabel: string;
};

function AdminPhotoLightboxRoot({ src, alt, onClose, closeLabel }: AdminPhotoLightboxProps) {
  useLockBodyScroll();
  const requestClose = useHistoryBackClose(onClose);
  return createPortal(
    <ModalBackdrop className={styles.panel} label={alt} onClose={requestClose}>
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={alt}>
        <button type="button" className={styles.close} onClick={requestClose} aria-label={closeLabel}>
          <CloseIcon />
        </button>
        <img src={src} alt={alt} className={styles.image} />
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

export const AdminPhotoLightbox = withKernelUi(KERNEL_UI.AdminPhotoLightbox, AdminPhotoLightboxRoot);
