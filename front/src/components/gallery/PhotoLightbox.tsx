import { lazy, Suspense, type ComponentProps } from 'react';

const PhotoLightboxView = lazy(() =>
  import('./PhotoLightboxView').then((m) => ({ default: m.PhotoLightbox })),
);

export type PhotoLightboxProps = ComponentProps<typeof PhotoLightboxView>;

/**
 * Product zoom modal. Kept behind `lazy()` so the gesture/panel stack stays
 * out of the prerender entry chunk (home/gallery hydrate without it). Callers
 * already mount only when open; Suspense covers the chunk fetch.
 */
export function PhotoLightbox(props: PhotoLightboxProps) {
  return (
    <Suspense fallback={null}>
      <PhotoLightboxView {...props} />
    </Suspense>
  );
}
