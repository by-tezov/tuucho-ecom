import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import type { CartDrawer as DrawerComponent } from './CartDrawer';

const loadDrawer = () =>
  import('./CartDrawer').then((m) => {
    Loaded = m.CartDrawer;
    return { default: m.CartDrawer };
  });
const DrawerChunk = lazy(loadDrawer);
/** Set once the chunk has loaded: from then on the drawer renders at once. */
let Loaded: typeof DrawerComponent | null = null;

/** The header cart drawer, out of the entry chunk. It is fetched while the
 * browser is idle after the first paint (useCartDrawerChunk), so by the
 * first "Ajouter" it is already there and opens instantly. */
export function LazyCartDrawer(props: ComponentProps<typeof DrawerComponent>) {
  if (Loaded) return <Loaded {...props} />;
  return (
    <Suspense fallback={null}>
      <DrawerChunk {...props} />
    </Suspense>
  );
}

/** True once the drawer's chunk is loaded. Fetched while the browser is
 * idle after first paint, or at once when the drawer is wanted before that
 * (the caller then keeps its loading modal up until this turns true). */
export function useCartDrawerChunk(wanted: boolean): boolean {
  const [loaded, setLoaded] = useState(() => Loaded !== null);
  useEffect(() => {
    if (loaded) return;
    let cancelled = false;
    const load = () =>
      void loadDrawer().then(
        () => !cancelled && setLoaded(true),
        () => undefined,
      );
    if (wanted) {
      load();
      return () => {
        cancelled = true;
      };
    }
    // Safari has no requestIdleCallback: a short delay does the same job.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(load, 1500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [loaded, wanted]);
  return loaded;
}
