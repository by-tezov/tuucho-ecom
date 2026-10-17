import { lazy, Suspense, type ComponentProps } from 'react';

const PickerChunk = lazy(() => import('./VariationTag').then((m) => ({ default: m.NailVariationPicker })));

/** A single nail's variation picker, loaded on demand. It only ever renders
 * for a nail with variations, which is never part of a prerendered page (the
 * nail catalogue arrives after hydration), so it stays out of the entry
 * chunk. */
export function LazyVariationTag(props: ComponentProps<typeof PickerChunk>) {
  return (
    <Suspense fallback={null}>
      <PickerChunk {...props} />
    </Suspense>
  );
}
