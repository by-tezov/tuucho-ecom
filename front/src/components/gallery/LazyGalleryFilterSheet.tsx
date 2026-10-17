import { lazy, Suspense, type ComponentProps } from 'react';

const SheetChunk = lazy(() =>
  import('./GalleryFilterSheet').then((m) => ({ default: m.GalleryFilterSheet })),
);

/** The gallery filter sheet, loaded on first open. It only renders after a
 * tap on "Filtres", so it stays out of the entry chunk the prerendered
 * gallery page would otherwise pull it into. */
export function LazyGalleryFilterSheet(props: ComponentProps<typeof SheetChunk>) {
  return (
    <Suspense fallback={null}>
      <SheetChunk {...props} />
    </Suspense>
  );
}
