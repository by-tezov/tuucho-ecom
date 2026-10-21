import { useLang } from '../../assets/i18n';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import typography from './Typography.module.css';

/** The `*` after a required field's label. Hidden from assistive technologies:
 * the field itself carries `aria-required`, and RequiredFieldsNote explains
 * the symbol once above the form (RGAA 11.10). */
function RequiredMarkRoot() {
  return (
    <span className={typography.requiredMark} aria-hidden="true">
      *
    </span>
  );
}

export const RequiredMark = withKernelUi(KERNEL_UI.RequiredMark, RequiredMarkRoot);

/** "Fields marked with an asterisk (*) are required." Placed once at the top
 * of every form that uses RequiredMark. */
function RequiredFieldsNoteRoot({ className }: { className?: string | undefined }) {
  const { t } = useLang();
  return (
    <p className={[typography.requiredNote, className].filter(Boolean).join(' ')}>{t.requiredFieldsNote}</p>
  );
}

export const RequiredFieldsNote = withKernelUi(KERNEL_UI.RequiredFieldsNote, RequiredFieldsNoteRoot);
