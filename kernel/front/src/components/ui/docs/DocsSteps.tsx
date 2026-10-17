import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import styles from './DocsSteps.module.css';

interface DocsStepsProps {
  items: string[];
}

function DocsStepsRoot({ items }: DocsStepsProps) {
  return (
    <ol className={styles.list}>
      {items.map((item, index) => (
        <li key={item} className={styles.item}>
          <span className={styles.index} aria-hidden="true">
            {index + 1}
          </span>
          <p className={styles.body}>{item}</p>
        </li>
      ))}
    </ol>
  );
}

export const DocsSteps = withKernelUi(KERNEL_UI.DocsSteps, DocsStepsRoot);
