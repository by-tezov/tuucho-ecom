import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import styles from './DocsCards.module.css';

interface DocsCardsProps {
  items: Array<{ title: string; text: string }>;
}

function DocsCardsRoot({ items }: DocsCardsProps) {
  return (
    <div className={styles.grid} data-count={items.length <= 3 ? String(items.length) : '2'}>
      {items.map((item) => (
        <article key={item.title} className={styles.card}>
          <h3 className={styles.title}>{item.title}</h3>
          <p className={styles.body}>{item.text}</p>
        </article>
      ))}
    </div>
  );
}

export const DocsCards = withKernelUi(KERNEL_UI.DocsCards, DocsCardsRoot);
