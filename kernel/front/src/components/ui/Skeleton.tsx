import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import styles from './Skeleton.module.css';

interface SkeletonProps {
  aspectRatio?: string | undefined;
  className?: string | undefined;
}

function SkeletonRoot({ aspectRatio, className }: SkeletonProps) {
  const cls = [styles.skeleton, className].filter(Boolean).join(' ');
  return <div className={cls} style={aspectRatio ? { aspectRatio } : undefined} aria-hidden="true" />;
}

export const Skeleton = withKernelUi(KERNEL_UI.Skeleton, SkeletonRoot);
