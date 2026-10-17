import type { ReactNode } from 'react';
import styles from './AccordionItem.module.css';

interface AccordionItemProps {
  question: string;
  answer: ReactNode;
}

export function AccordionItem({ question, answer }: AccordionItemProps) {
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
