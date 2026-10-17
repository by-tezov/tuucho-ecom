import type { ReactNode } from 'react';
import { CartBanner } from '../layout/CartBanner';
import styles from './IntroSurface.module.css';

interface IntroSurfaceProps {
  children: ReactNode;
  variant?: 'warm' | 'page';
}

/** Continuous decorated surface for a page's introductory content. */
export function IntroSurface({ children, variant = 'page' }: IntroSurfaceProps) {
  return (
    <div className={`${styles.surface} ${variant === 'warm' ? styles.warm : styles.page}`}>
      <CartBanner />
      {children}
    </div>
  );
}
