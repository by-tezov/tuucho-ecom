import styles from './Skeleton.module.css';

interface SkeletonProps {
  aspectRatio?: string | undefined;
  className?: string | undefined;
}

export function Skeleton({ aspectRatio, className }: SkeletonProps) {
  const cls = [styles.skeleton, className].filter(Boolean).join(' ');
  return <div className={cls} style={aspectRatio ? { aspectRatio } : undefined} aria-hidden="true" />;
}
