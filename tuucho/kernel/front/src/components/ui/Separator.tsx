import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './Separator.module.css';

interface SeparatorProps {
  /** `full` reaches the parent’s left and right edges. `inset` is the Plugins
   * locale-collapse rule only. */
  bleed?: 'full' | 'inset' | undefined;
  className?: string | undefined;
}

function SeparatorRoot({ bleed = 'full', className }: SeparatorProps) {
  const names = [styles.rule, bleed === 'inset' ? styles.inset : null, className].filter(Boolean);
  return <hr className={names.join(' ')} aria-hidden="true" />;
}

export const Separator = withKernelUi(KERNEL_UI.Separator, SeparatorRoot);
