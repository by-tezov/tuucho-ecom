import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import { docsSectionId } from './docsTypes';
import styles from './DocsOutline.module.css';

interface DocsOutlineProps {
  label: string;
  headings: string[];
}

function DocsOutlineRoot({ label, headings }: DocsOutlineProps) {
  if (headings.length < 2) return null;
  return (
    <nav className={styles.box} aria-label={label}>
      <p className={styles.label}>{label}</p>
      <ol className={styles.list}>
        {headings.map((heading, index) => (
          <li key={heading}>
            <a className={styles.link} href={`#${docsSectionId(heading, index)}`}>
              {heading}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export const DocsOutline = withKernelUi(KERNEL_UI.DocsOutline, DocsOutlineRoot);
