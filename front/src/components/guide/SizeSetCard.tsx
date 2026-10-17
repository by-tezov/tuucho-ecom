import type { SizeSet } from '../../data/sizeSets';
import styles from './SizeSetCard.module.css';

interface SizeSetCardProps {
  set: SizeSet;
  widthLabel: string;
}

export function SizeSetCard({ set, widthLabel }: SizeSetCardProps) {
  const width = Math.max(...set.mm);
  return (
    <li>
      <div className={styles.card}>
        <div className={styles.header}>
          <div aria-hidden="true" className={styles.headerStar}>
            ✦
          </div>
          <div className={styles.headerKey}>{set.key}</div>
        </div>
        <p className={styles.width}>
          {widthLabel}: {width} mm
        </p>
      </div>
    </li>
  );
}
