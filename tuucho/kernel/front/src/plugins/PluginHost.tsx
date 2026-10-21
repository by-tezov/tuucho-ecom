import { useSyncExternalStore, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { usePluginEnabled } from './StorefrontBootstrap';
import type { OrderLineChild } from '../api/orders';
import { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS } from './frontSlots';
import type { FrontSlotName, FrontViewName } from './frontSlots';
import { registerPluginUi, type PluginUiEntry } from '../ui/registry';

export { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS } from './frontSlots';
export type { FrontSlotName, FrontViewName } from './frontSlots';

/** Extra-set order lines from shop history or admin detail. */
export type PluginOrderLineItem = {
  id: string;
  title: string;
  size: string;
  quantity: number;
  lineTotal: number;
  comment?: string | null;
  productType?: string;
  nails?: OrderLineChild[];
};

export type PluginLocaleOverlay = {
  lang: string;
  catalog?: Record<string, unknown>;
  adminCatalog?: Record<string, unknown>;
};

export type PluginFrontModule = {
  pluginId: string;
  adminRoutes?: Array<{ path: string; element: ReactNode }>;
  publicRoutes?: Array<{ path: string; element: ReactNode }>;
  customerRoutes?: Array<{ path: string; element: ReactNode }>;
  cartSurface?: ReactNode;
  cartLines?: ReactNode;
  orderLines?: (props: { items: PluginOrderLineItem[]; hideMoney: boolean }) => ReactNode;
  drawerLines?: ReactNode;
  slots?: Partial<Record<FrontSlotName, ReactNode>>;
  /** Lower first. Default 10 (same as opening filters). Equal order keeps load order. */
  slotOrder?: Partial<Record<FrontSlotName, number>>;
  views?: Partial<Record<FrontViewName, ReactNode>>;
  locales?: PluginLocaleOverlay[];
  /** Use/extend/override kernel UI primitives. See `kernel/front/src/ui`. */
  ui?: PluginUiEntry[];
  /** Extra below the schema form on Plugins → Configure (`/admin/plugins/:id`).
   * Composes with `settingsSchema`; does not replace it. */
  configure?: ReactNode;
};

/** Non-eager globs: Vite still sees every `front/index.tsx`, but evaluating a
 * throwing user plugin must not brick the shop module. Loaders run through
 * `Promise.allSettled`; failed ids are skipped. `npm run sync:screens` only
 * reads kernel `App.tsx`, so plugin URLs stay absent from `docs/screens.md`. */
const frontLoaders = {
  ...import.meta.glob('../../../../plugins/**/front/index.tsx'),
  ...import.meta.glob('../../../../../../src/plugins/**/front/index.tsx'),
} as Record<string, () => Promise<{ pluginFront?: PluginFrontModule; default?: PluginFrontModule }>>;

let loaded: PluginFrontModule[] = [];
let frontRevision = 0;
const frontListeners = new Set<() => void>();

function emitFrontRevision(): void {
  frontRevision += 1;
  for (const listener of frontListeners) listener();
}

export function subscribePluginFronts(listener: () => void): () => void {
  frontListeners.add(listener);
  return () => {
    frontListeners.delete(listener);
  };
}

export function pluginFrontRevision(): number {
  return frontRevision;
}

/** Re-render kernel routes/slots after isolated plugin fronts settle. */
export function usePluginFrontRevision(): number {
  return useSyncExternalStore(subscribePluginFronts, pluginFrontRevision, pluginFrontRevision);
}

function frontFromPath(
  path: string,
  mod: { pluginFront?: PluginFrontModule; default?: PluginFrontModule },
): PluginFrontModule | null {
  const match = path.match(/\/plugins\/(?:.*\/)?([^/]+)\/front\/index\.tsx$/);
  if (!match) return null;
  const front = mod.pluginFront ?? mod.default;
  if (!front) return null;
  return { ...front, pluginId: front.pluginId ?? match[1] };
}

let frontsLoad: Promise<void> | null = null;

export function ensurePluginFrontsLoaded(): Promise<void> {
  frontsLoad ??= (async () => {
    const settled = await Promise.allSettled(
      Object.entries(frontLoaders).map(async ([path, load]) => {
        try {
          const mod = await load();
          return frontFromPath(path, mod);
        } catch (error) {
          console.error(`[plugins] front module failed (${path}); shop continues`, error);
          return null;
        }
      }),
    );
    const next: PluginFrontModule[] = [];
    for (const result of settled) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      next.push(result.value);
    }
    loaded = next;
    for (const mod of loaded) {
      try {
        registerPluginUi(mod.pluginId, mod.ui ?? []);
      } catch (error) {
        console.error(`[plugins] UI register failed for ${mod.pluginId}; shop continues`, error);
      }
    }
    emitFrontRevision();
  })();
  return frontsLoad;
}

void ensurePluginFrontsLoaded();

function EnabledRoute({ pluginId, element }: { pluginId: string; element: ReactNode }) {
  const on = usePluginEnabled(pluginId);
  if (!on) return null;
  return <>{element}</>;
}

function routesOf(
  key: 'adminRoutes' | 'publicRoutes' | 'customerRoutes',
  pathPrefix = '',
): ReactNode[] {
  return loaded.flatMap((mod) =>
    (mod[key] ?? []).map((route) => (
      <Route
        key={`${mod.pluginId}:${route.path}`}
        path={`${pathPrefix}${route.path}`}
        element={<EnabledRoute pluginId={mod.pluginId} element={route.element} />}
      />
    )),
  );
}

export function pluginPublicRouteElements(): ReactNode[] {
  return routesOf('publicRoutes');
}

export function pluginCustomerRouteElements(): ReactNode[] {
  return routesOf('customerRoutes');
}

export function pluginAdminRouteElements(): ReactNode[] {
  return routesOf('adminRoutes');
}

export function PluginView({ name, fallback }: { name: FrontViewName; fallback: ReactNode }) {
  const hit = loaded.find((mod) => mod.views?.[name] || (name === CORE_FRONT_VIEWS.cart && mod.cartSurface));
  const element = hit?.views?.[name] ?? (name === CORE_FRONT_VIEWS.cart ? hit?.cartSurface : undefined);
  const on = usePluginEnabled(hit?.pluginId ?? '');
  if (element && on) return <>{element}</>;
  return fallback;
}

/** Gift (or another plugin) can replace the shop cart while a receiver lock is on. */
export function PluginCartSurface({ fallback }: { fallback: ReactNode }) {
  return <PluginView name={CORE_FRONT_VIEWS.cart} fallback={fallback} />;
}

export function PluginSlot({ name }: { name: FrontSlotName }) {
  const hits = loaded
    .map((mod, index) => {
      const aliased =
        name === CORE_FRONT_SLOTS.cartLine ? (mod.slots?.[name] ?? mod.cartLines) : mod.slots?.[name];
      if (!aliased) return null;
      return { mod, aliased, index, order: mod.slotOrder?.[name] ?? 10 };
    })
    .filter((hit): hit is NonNullable<typeof hit> => hit !== null)
    .sort((left, right) => left.order - right.order || left.index - right.index);
  return (
    <>
      {hits.map(({ mod, aliased }) => (
        <EnabledRoute key={`${mod.pluginId}:${name}`} pluginId={mod.pluginId} element={aliased} />
      ))}
    </>
  );
}

function PluginLegacySlot({ slot }: { slot: 'cartLines' | 'drawerLines' }) {
  return (
    <>
      {loaded.map((mod) => {
        const node = mod[slot];
        if (!node) return null;
        return <EnabledRoute key={`${mod.pluginId}:${slot}`} pluginId={mod.pluginId} element={node} />;
      })}
    </>
  );
}

export function PluginCartLines() {
  return (
    <>
      <PluginSlot name={CORE_FRONT_SLOTS.cartLine} />
    </>
  );
}

export function PluginOrderLines({
  items,
  hideMoney,
}: {
  items: PluginOrderLineItem[];
  hideMoney: boolean;
}) {
  return (
    <>
      {loaded.map((mod) => {
        if (!mod.orderLines) return null;
        return (
          <EnabledRoute
            key={`${mod.pluginId}:orderLines`}
            pluginId={mod.pluginId}
            element={mod.orderLines({ items, hideMoney })}
          />
        );
      })}
    </>
  );
}

export function PluginDrawerLines() {
  return <PluginLegacySlot slot="drawerLines" />;
}

export function pluginLocaleOverlays(): Array<PluginLocaleOverlay & { pluginId: string }> {
  return loaded.flatMap((mod) =>
    (mod.locales ?? []).map((locale) => ({ ...locale, pluginId: mod.pluginId })),
  );
}

export function pluginHasFrontConfigure(pluginId: string): boolean {
  return loaded.some((mod) => mod.pluginId === pluginId && Boolean(mod.configure));
}

export function pluginConfigureElement(pluginId: string): ReactNode | null {
  return loaded.find((mod) => mod.pluginId === pluginId)?.configure ?? null;
}
