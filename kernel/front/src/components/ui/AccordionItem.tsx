import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './AccordionItem.module.css';

interface AccordionItemProps {
  question: string;
  answer: ReactNode;
}

function AccordionItemRoot({ question, answer }: AccordionItemProps) {
  return (
    <details className={styles.item}>
      <summary className={styles.summary}>
        {question}
        <span className={styles.icon} aria-hidden="true">
          +
        </span>
      </summary>
      <p className={styles.answer}>{answer}</p>
    </details>
  );
}

export const AccordionItem = withKernelUi(KERNEL_UI.AccordionItem, AccordionItemRoot);
