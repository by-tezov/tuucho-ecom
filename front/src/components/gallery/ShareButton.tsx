import { useLang } from '../../assets/i18n';
import styles from './ShareButton.module.css';

interface ShareButtonProps {
  title: string;
  url: string;
  className?: string;
  'data-testid'?: string;
}

// Feature-detected rather than device-sniffed: navigator.share opens the
// OS-native share sheet (Messages, WhatsApp, etc.), which desktop browsers
// mostly don't implement — hiding the button there is a side effect of the
// same check, not a separate mobile/desktop branch.
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export function ShareButton({ title, url, className, 'data-testid': dataTestId }: ShareButtonProps) {
  const { t } = useLang();

  if (!canShare) return null;

  return (
    <button
      type="button"
      data-testid={dataTestId}
      className={[styles.button, className].filter(Boolean).join(' ')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        // A visitor dismissing the share sheet rejects this promise
        // (AbortError) — not an error worth surfacing.
        navigator.share({ title, url }).catch(() => {});
      }}
      aria-label={t.gallery.shareLabel}
    >
      <svg width="23" height="23" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="3" r="1.6" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="3.5" cy="7" r="1.6" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="10.5" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.1" />
        <path d="M4.9 6.1 9.1 3.9M4.9 7.9 9.1 10.1" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    </button>
  );
}
