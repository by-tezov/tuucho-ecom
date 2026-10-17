import { useLang } from '../../assets/i18n';
import { Button } from '../ui/Button';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  onReset?: () => void;
  /** Overrides the default "no results for these filters" text — e.g. the
   * Favorites filter with nothing favorited yet needs a message that isn't
   * about filters at all. */
  message?: string | undefined;
  action?: { to: string; label: string };
}

export function EmptyState({ onReset, message, action }: EmptyStateProps) {
  const { t } = useLang();

  return (
    <div className={styles.empty}>
      <p className={styles.text}>{message ?? t.gallery.empty}</p>
      {action ? (
        <Button to={action.to}>{action.label}</Button>
      ) : onReset ? (
        <button type="button" className={styles.resetButton} onClick={onReset}>
          {t.gallery.reset}
        </button>
      ) : null}
    </div>
  );
}
