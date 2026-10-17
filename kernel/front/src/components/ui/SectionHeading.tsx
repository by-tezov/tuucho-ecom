import type { ElementType, ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './SectionHeading.module.css';

interface SectionHeadingProps {
  eyebrow?: string | undefined;
  title: ReactNode;
  sub?: string | undefined;
  headingId?: string | undefined;
  as?: ElementType | undefined;
  align?: 'center' | 'left' | undefined;
  onDark?: boolean | undefined;
  className?: string | undefined;
}

function SectionHeadingRoot({
  eyebrow,
  title,
  sub,
  headingId,
  as: HeadingTag = 'h2',
  align = 'center',
  onDark = false,
  className,
}: SectionHeadingProps) {
  const wrapClass = [styles.wrap, align === 'center' && styles.wrapCenter, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={wrapClass}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <HeadingTag id={headingId} className={onDark ? `${styles.title} ${styles.titleOnDark}` : styles.title}>
        {title}
      </HeadingTag>
      {sub && <p className={onDark ? `${styles.sub} ${styles.subOnDark}` : styles.sub}>{sub}</p>}
    </div>
  );
}

export const SectionHeading = withKernelUi(KERNEL_UI.SectionHeading, SectionHeadingRoot);
