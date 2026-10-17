import { createPortal } from 'react-dom';
import styles from './Toast.module.css';

interface ToastProps {
  message: string;
}

/** Rendered by ToastProvider — not used directly. */
export function Toast({ message }: ToastProps) {
  return createPortal(
    <div className={styles.toast} role="status">
      {message}
    </div>,
    document.body,
  );
}
