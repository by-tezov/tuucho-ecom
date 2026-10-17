import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import type { DocsTone } from './docsTypes';
import styles from './DocsCallout.module.css';

interface DocsCalloutProps {
  tone: DocsTone;
  title?: string | undefined;
  children: string;
}

function DocsCalloutRoot({ tone, title, children }: DocsCalloutProps) {
  return (
    <aside className={`${styles.callout} ${styles[tone]}`} role="note">
      {title ? <p className={styles.title}>{title}</p> : null}
      <p className={styles.body}>{children}</p>
    </aside>
  );
}

export const DocsCallout = withKernelUi(KERNEL_UI.DocsCallout, DocsCalloutRoot);
