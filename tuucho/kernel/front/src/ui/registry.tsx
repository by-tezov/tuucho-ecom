import { createElement, useMemo, type ComponentType } from 'react';
import { useStorefrontBootstrap } from '../plugins/StorefrontBootstrap';
import type { StorefrontPlugin } from '../plugins/types';
import { isUiName } from './names';

/** Stored without a prop generic; replacements must match the original contract. */
export type UiComponent = ComponentType<object>;

export type UiReplace = {
  pluginId: string;
  component: UiComponent;
};

export type PluginUiEntry = {
  name: string;
  component: UiComponent;
  replace?: boolean;
};

type UiDefault = {
  pluginId: string | null;
  component: UiComponent;
};

const defaults = new Map<string, UiDefault>();
const replacements = new Map<string, UiReplace[]>();
const extensions = new Map<string, UiReplace[]>();

export function provideKernelUi(name: string, component: UiComponent): void {
  if (!isUiName(name)) return;
  defaults.set(name, { pluginId: null, component });
}

export function registerUiComponent(
  name: string,
  component: UiComponent,
  options: { pluginId: string; replace?: boolean },
): void {
  if (!isUiName(name) || !options.pluginId) return;
  if (options.replace) {
    const list = replacements.get(name) ?? [];
    replacements.set(name, [
      ...list.filter((entry) => entry.pluginId !== options.pluginId),
      { pluginId: options.pluginId, component },
    ]);
    return;
  }
  if (defaults.get(name)?.pluginId === null) return;
  const list = extensions.get(name) ?? [];
  extensions.set(name, [
    ...list.filter((entry) => entry.pluginId !== options.pluginId),
    { pluginId: options.pluginId, component },
  ]);
}

export function registerPluginUi(pluginId: string, entries: PluginUiEntry[]): void {
  for (const entry of entries) {
    registerUiComponent(entry.name, entry.component, { pluginId, replace: entry.replace === true });
  }
}

export function resetUiRegistry(): void {
  defaults.clear();
  replacements.clear();
  extensions.clear();
}

function lastEnabled(
  entries: UiReplace[] | undefined,
  plugins: StorefrontPlugin[],
  kind?: string,
): UiComponent | undefined {
  const enabled = plugins.filter((plugin) => plugin.enabled);
  return [...(entries ?? [])]
    .reverse()
    .find((entry) =>
      enabled.some(
        (plugin) =>
          plugin.id === entry.pluginId && (kind == null || plugin.kinds.includes(kind)),
      ),
    )?.component;
}

export function resolveUiComponent(name: string, plugins: StorefrontPlugin[] = []): UiComponent | undefined {
  const themeHit = lastEnabled(replacements.get(name), plugins, 'theme');
  if (themeHit) return themeHit;
  const otherHit = lastEnabled(replacements.get(name), plugins);
  if (otherHit) return otherHit;
  const kernel = defaults.get(name);
  if (kernel?.pluginId === null) return kernel.component;
  return lastEnabled(extensions.get(name), plugins);
}

export function useUiComponent<P extends object>(name: string): ComponentType<P> | undefined {
  const { plugins } = useStorefrontBootstrap();
  return useMemo(
    () => resolveUiComponent(name, plugins) as ComponentType<P> | undefined,
    [name, plugins],
  );
}

export function withKernelUi<P extends object>(name: string, Default: ComponentType<P>): ComponentType<P> {
  provideKernelUi(name, Default as UiComponent);
  function Bound(props: P) {
    const resolved = useUiComponent<P>(name);
    const Cmp = (resolved ?? Default) as ComponentType<P>;
    return createElement(Cmp, props);
  }
  Bound.displayName = `Ui(${name})`;
  return Bound;
}
