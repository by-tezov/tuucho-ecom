import { useEffect, useRef, useState } from 'react';
import { KERNEL_UI } from '../../ui/names';
import { withKernelUi } from '../../ui/registry';
import { Skeleton } from './Skeleton';
import styles from './Figure.module.css';

interface FigureProps {
  src: string;
  alt: string;
  aspectRatio?: string | undefined;
  badge?: string | undefined;
  className?: string | undefined;
  loading?: 'lazy' | 'eager' | undefined;
  /** raise on the LCP image (hero) so the browser fetches it first */
  fetchPriority?: 'high' | 'low' | 'auto' | undefined;
  /** set to false when nesting inside a card that already provides its own border/radius */
  bordered?: boolean | undefined;
  /** set to true only for a Figure the browser should be allowed to drag out
   * (e.g. dragging an image to another app) — off by default since native
   * image drag otherwise fights click/drag gestures on the figure itself. */
  draggable?: boolean | undefined;
  /** 'cover' (default) fills the frame, cropping overflow; 'contain' shrinks the
   * image to fit entirely inside the frame (letterboxed); 'fill' stretches the
   * image to fill the frame exactly, distorting its aspect ratio. */
  fit?: 'cover' | 'contain' | 'fill' | undefined;
}

function FigureRoot({
  src,
  alt,
  aspectRatio = '1 / 1',
  badge,
  className,
  loading = 'lazy',
  fetchPriority = 'auto',
  bordered = true,
  draggable = false,
  fit = 'cover',
}: FigureProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const frameClass = [styles.frame, bordered && styles.frameBordered, className].filter(Boolean).join(' ');

  // With prerendered HTML the image can finish loading before hydration, in
  // which case the load event already fired before the native listener is
  // attached.
  useEffect(() => {
    const image = imgRef.current;
    if (!image) return;
    const handleLoad = () => setLoaded(true);
    image.addEventListener('load', handleLoad);
    if (image.complete) setLoaded(true);
    return () => image.removeEventListener('load', handleLoad);
  }, []);

  return (
    <div className={frameClass} style={{ aspectRatio }}>
      {!loaded && <Skeleton className={styles.skeleton} />}
      <img
        ref={imgRef}
        className={styles.img}
        src={src}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        style={{ opacity: loaded ? 1 : 0, objectFit: fit }}
        draggable={draggable}
      />
      {badge && <span className={styles.badge}>{badge}</span>}
    </div>
  );
}

export const Figure = withKernelUi(KERNEL_UI.Figure, FigureRoot);
