import type { ElementType, ReactNode } from 'react';
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

export function SectionHeading({
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
