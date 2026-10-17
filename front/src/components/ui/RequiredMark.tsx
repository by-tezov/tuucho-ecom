import { useLang } from '../../assets/i18n';
import typography from './Typography.module.css';

/** The `*` after a required field's label. Hidden from assistive technologies:
 * the field itself carries `aria-required`, and RequiredFieldsNote explains
 * the symbol once above the form (RGAA 11.10). */
export function RequiredMark() {
  return (
    <span className={typography.requiredMark} aria-hidden="true">
      *
    </span>
  );
}

/** "Fields marked with an asterisk (*) are required." Placed once at the top
 * of every form that uses RequiredMark. */
export function RequiredFieldsNote({ className }: { className?: string | undefined }) {
  const { t } = useLang();
  return (
    <p className={[typography.requiredNote, className].filter(Boolean).join(' ')}>{t.requiredFieldsNote}</p>
  );
}
