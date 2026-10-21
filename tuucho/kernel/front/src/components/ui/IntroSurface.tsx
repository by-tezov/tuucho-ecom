import type { ReactNode } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { CartBanner } from '../layout/CartBanner';
import styles from './IntroSurface.module.css';

interface IntroSurfaceProps {
  children: ReactNode;
  variant?: 'warm' | 'page';
}

/** Continuous decorated surface for a page's introductory content. */
function IntroSurfaceRoot({ children, variant = 'page' }: IntroSurfaceProps) {
  return (
    <div className={`${styles.surface} ${variant === 'warm' ? styles.warm : styles.page}`}>
      <CartBanner host="intro" />
      {children}
    </div>
  );
}

export const IntroSurface = withKernelUi(KERNEL_UI.IntroSurface, IntroSurfaceRoot);
