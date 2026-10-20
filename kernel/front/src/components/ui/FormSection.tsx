import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './FormSection.module.css';

interface FormSectionProps {
  title: string;
  description?: string | undefined;
  children: ReactNode;
}

/** Compact admin field group. Not SectionHeading (storefront hero size). */
function FormSectionRoot({ title, description, children }: FormSectionProps) {
  return (
    <section className={styles.root}>
      <h2 className={styles.title}>{title}</h2>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export const FormSection = withKernelUi(KERNEL_UI.FormSection, FormSectionRoot);
