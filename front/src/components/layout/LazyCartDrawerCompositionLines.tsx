import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import type { CartDrawerCompositionLines as LinesComponent } from './CartDrawerCompositionLines';

const loadLines = () =>
  import('./CartDrawerCompositionLines').then((m) => {
    Loaded = m.CartDrawerCompositionLines;
    return { default: m.CartDrawerCompositionLines };
  });
const LinesChunk = lazy(loadLines);
/** Set once the chunk has loaded: from then on the lines render at once,
 * with no Suspense round trip. */
let Loaded: typeof LinesComponent | null = null;

/** Composed sets only ever show in the drawer once it opens (client side),
 * so their lines and mosaic load on demand, outside the entry chunk. */
export function LazyCartDrawerCompositionLines(props: ComponentProps<typeof LinesComponent>) {
  if (Loaded) return <Loaded {...props} />;
  return (
    <Suspense fallback={null}>
      <LinesChunk {...props} />
    </Suspense>
  );
}

/** False until the lines' chunk is loaded when the cart holds composed sets:
 * the drawer waits on it like on its product data, so a composed set never
 * pops in after the drawer has opened. Loaded once per page. */
export function useCompositionLinesReady(compositionCount: number): boolean {
  const [ready, setReady] = useState(() => Loaded !== null);
  const needed = compositionCount > 0 && !ready;
  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    void loadLines().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [needed]);
  return compositionCount === 0 || ready;
}
