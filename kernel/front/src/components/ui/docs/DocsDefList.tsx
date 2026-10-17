import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import styles from './DocsDefList.module.css';

interface DocsDefListProps {
  items: Array<{ term: string; description: string }>;
}

function DocsDefListRoot({ items }: DocsDefListProps) {
  return (
    <dl className={styles.list}>
      {items.map((item) => (
        <div key={item.term} className={styles.row}>
          <dt className={styles.term}>{item.term}</dt>
          <dd className={styles.description}>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export const DocsDefList = withKernelUi(KERNEL_UI.DocsDefList, DocsDefListRoot);
