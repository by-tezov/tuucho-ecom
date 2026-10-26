import { useSyncExternalStore, type ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { usePluginEnabled, useStorefrontBootstrap } from './StorefrontBootstrap';
import type { OrderLineChild } from '../api/orders';
import { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS } from './frontSlots';
import type { FrontSlotName, FrontViewName } from './frontSlots';
import { registerPluginUi, type PluginUiEntry } from '../ui/registry';
import { groupPluginRoutes, pickRouteCandidate, type PluginRouteCandidate } from './routeGrouping';
import { findViewCandidate } from './viewSelection';
import { NotFoundPage } from '../routes/NotFoundPage';
import { SlotPropsContext } from './slotProps';

export { CORE_FRONT_SLOTS, CORE_FRONT_VIEWS } from './frontSlots';
export type { FrontSlotName, FrontViewName } from './frontSlots';
export { SlotPropsContext, useSlotProps } from './slotProps';

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
   * Composes with `settingsSchema`; does not replace it.
   * With `configureTab`, this is the second tab instead of a block under the form. */
  configure?: ReactNode;
  /** Label of the second Configure tab. English fallback; a locale catalog may
   * override it under `configureTabs[pluginId]`. */
  configureTab?: string;
};

/** Non-eager globs: Vite still sees every `front/index.tsx`, but evaluating a
 * throwing user plugin must not brick the shop module. Loaders run through
 * `Promise.allSettled`; failed ids are skipped. `npm run sync:screens` only
 * reads kernel `App.tsx`, so plugin URLs stay absent from `tuucho/docs/front/screens.md`.
 *
 * Spread order is priority order: bundled plugins first, user plugins last.
 * `loaded` keeps this order (`Promise.allSettled` preserves input order), and
 * `groupPluginRoutes` treats later candidates as shadowing earlier ones, so a
 * user plugin can take over a bundled route. The `@plugins-*` vite aliases
 * (see `importAliases.ts`) replace relative `../` chains, which for user
 * plugins used to resolve outside the repo and silently match nothing. */
const frontLoaders = {
  ...import.meta.glob('@plugins-bundled/**/front/index.tsx'),
  ...import.meta.glob('@plugins-user/**/front/index.tsx'),
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
  // The plugin id is the leaf folder name, so parse it off the end of the
  // path: glob keys may come back aliased (`@plugins-user/…`) or as resolved
  // absolute paths, and both trees nest differently (`<group>/<id>` bundled,
  // `<group>/<feature>/<id>` user).
  const match = path.match(/([^/]+)\/front\/index\.tsx$/);
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

/** One matched route per path. Renders the last candidate whose plugin is
 * enabled (user plugins shadow bundled ones; disabling the shadow falls back
 * to the bundled page). When no candidate is enabled the route must not
 * render null — that would swallow the URL and blank `<main>` while blocking
 * the `*` NotFound route — so it renders the shared 404 page instead. */
function CandidateRoute({ candidates }: { candidates: PluginRouteCandidate[] }) {
  const { plugins } = useStorefrontBootstrap();
  const enabled = new Set(plugins.filter((plugin) => plugin.enabled).map((plugin) => plugin.id));
  const winner = pickRouteCandidate(candidates, enabled);
  if (!winner) return <NotFoundPage />;
  return <>{winner.element}</>;
}

function routesOf(key: 'adminRoutes' | 'publicRoutes' | 'customerRoutes', pathPrefix = ''): ReactNode[] {
  // `loaded` is bundled-first, user-last (glob spread order above), which is
  // what makes "last enabled candidate wins" mean "user shadows bundled".
  const grouped = groupPluginRoutes(
    loaded.map((mod) => ({ pluginId: mod.pluginId, routes: mod[key] })),
    pathPrefix,
  );
  return grouped.map(({ path, candidates }) => (
    <Route key={path} path={path} element={<CandidateRoute candidates={candidates} />} />
  ));
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

/** A plugin `views[name]` replaces the kernel's own surface when its plugin is
 * enabled; otherwise `fallback` renders. `props` are published through
 * `SlotPropsContext` so the static ReactNode still receives per-render context
 * (copy/timing for `view.boot.splash`, for example) via `useSlotProps`. */
export function PluginView({
  name,
  fallback,
  props,
}: {
  name: FrontViewName;
  fallback: ReactNode;
  props?: Record<string, unknown>;
}) {
  const hit = findViewCandidate(loaded, name, CORE_FRONT_VIEWS.cart);
  const element = hit?.views?.[name] ?? (name === CORE_FRONT_VIEWS.cart ? hit?.cartSurface : undefined);
  const on = usePluginEnabled(hit?.pluginId ?? '');
  if (element && on) {
    return <SlotPropsContext.Provider value={props ?? {}}>{element}</SlotPropsContext.Provider>;
  }
  return fallback;
}

/** Gift (or another plugin) can replace the shop cart while a receiver lock is on. */
export function PluginCartSurface({ fallback }: { fallback: ReactNode }) {
  return <PluginView name={CORE_FRONT_VIEWS.cart} fallback={fallback} />;
}

export function PluginSlot({ name, props }: { name: FrontSlotName; props?: Record<string, unknown> }) {
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
    <SlotPropsContext.Provider value={props ?? {}}>
      {hits.map(({ mod, aliased }) => (
        <EnabledRoute key={`${mod.pluginId}:${name}`} pluginId={mod.pluginId} element={aliased} />
      ))}
    </SlotPropsContext.Provider>
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

export function PluginOrderLines({ items, hideMoney }: { items: PluginOrderLineItem[]; hideMoney: boolean }) {
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

export function pluginConfigureTab(pluginId: string): string | null {
  const label = loaded.find((mod) => mod.pluginId === pluginId)?.configureTab?.trim();
  return label ? label : null;
}
