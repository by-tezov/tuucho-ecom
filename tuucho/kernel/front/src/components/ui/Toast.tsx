import { createPortal } from 'react-dom';
import { useAdminStrings } from '../../assets/i18n/admin';
import styles from './Toast.module.css';

interface ToastProps {
  message: string;
  onDismiss: () => void;
}

/** Rendered by ToastProvider — not used directly. Stays until dismissed. */
export function Toast({ message, onDismiss }: ToastProps) {
  const a = useAdminStrings();
  return createPortal(
    <div className={styles.toast} role="status">
      <span className={styles.message}>{message}</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label={a.prefs.close}>
        ×
      </button>
    </div>,
    document.body,
  );
}
