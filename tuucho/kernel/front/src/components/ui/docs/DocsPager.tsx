import { Link } from 'react-router-dom';
import { KERNEL_UI } from '../../../ui/names';
import { withKernelUi } from '../../../ui/registry';
import styles from './DocsPager.module.css';

interface DocsPagerLink {
  to: string;
  title: string;
}

interface DocsPagerProps {
  previousLabel: string;
  nextLabel: string;
  previous?: DocsPagerLink | undefined;
  next?: DocsPagerLink | undefined;
}

function DocsPagerRoot({ previousLabel, nextLabel, previous, next }: DocsPagerProps) {
  if (!previous && !next) return null;
  return (
    <nav className={styles.row} aria-label={`${previousLabel} / ${nextLabel}`}>
      <div className={styles.slot}>
        {previous ? (
          <Link className={styles.link} to={previous.to}>
            <span className={styles.label}>{previousLabel}</span>
            <span className={styles.title}>{previous.title}</span>
          </Link>
        ) : null}
      </div>
      <div className={`${styles.slot} ${styles.slotNext}`}>
        {next ? (
          <Link className={`${styles.link} ${styles.linkNext}`} to={next.to}>
            <span className={styles.label}>{nextLabel}</span>
            <span className={styles.title}>{next.title}</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export const DocsPager = withKernelUi(KERNEL_UI.DocsPager, DocsPagerRoot);
