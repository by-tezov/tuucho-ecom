import { register as registerLoader } from 'node:module';
import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import {
  createPluginRegisterApi,
  resetHooks,
  resetMailTemplates,
  resetEmailCatalogs,
  resetLanguages,
  resetPluginServices,
  resetShells,
  setPluginCacheSealer,
  setPluginSecretAccess,
  setPluginSettingsAccess,
  resetPluginSettingsAccess,
  type PluginRegisterFn,
} from '@tuucho/plugin-sdk';
import { config } from '../../../config/env.js';
import { decryptJsonPii, encryptJsonPii } from '../../../platform/security/piiCrypto.js';
import { bindPluginMailShell } from '../../../platform/pluginMailShell.js';
import { assertConfiguredLanguagesRegistered } from '../../../utils/language.js';
import { pluginPackageDir } from './discoverPlugins.js';
import {
  getCachedPluginSecret,
  getCachedPluginSettings,
  listPlugins,
  markPluginLoadFailed,
  markPluginLoadOk,
  patchPluginSecrets,
  type InstalledPlugin,
} from './pluginStore.js';
import { seedPluginConfigFilesOnce } from './pluginConfigApply.js';
import { applyPluginMigrations } from './pluginSchema.js';
import { pluginSurfaceEnabled } from './pluginSurface.js';
import { setRuntimeEnabledPluginIds } from './runtimeEnabledPlugins.js';

let hookRegistered = false;
export function ensurePluginImportHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;
  registerLoader(new URL('./pluginImportHook.mjs', import.meta.url));
}

let loadChain: Promise<void> = Promise.resolve();
let loadedKey = '';

export function resetPluginRuntime(): void {
  setRuntimeEnabledPluginIds([]);
  resetHooks();
  resetPluginServices();
  resetShells();
  resetMailTemplates();
  resetEmailCatalogs();
  resetLanguages();
  resetPluginSettingsAccess();
  loadedKey = '';
  loadChain = Promise.resolve();
}

async function importRegister(plugin: InstalledPlugin): Promise<PluginRegisterFn | null> {
  ensurePluginImportHook();
  const file = join(pluginPackageDir(plugin.manifest), 'back/register.ts');
  try {
    await stat(file);
  } catch {
    return null;
  }
  const stamp = (await stat(file)).mtimeMs;
  const href = `${pathToFileURL(file).href}?mtime=${stamp}`;
  const mod = (await import(href)) as { register?: PluginRegisterFn; default?: PluginRegisterFn };
  return mod.register ?? mod.default ?? null;
}

async function loadEnabledPluginsLocked(force: boolean): Promise<void> {
  await seedPluginConfigFilesOnce();
  const plugins = await listPlugins();
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const enabled = plugins.filter((plugin) => pluginSurfaceEnabled(plugin, byId));
  const key = enabled.map((plugin) => plugin.id).join(',');
  if (!force && key === loadedKey) return;
  setPluginCacheSealer(
    (value) => encryptJsonPii(value) ?? value,
    (value) => (typeof value === 'string' ? (decryptJsonPii(value) ?? value) : value),
  );
  setPluginSecretAccess(
    (pluginId, key) => getCachedPluginSecret(pluginId, key),
    async (pluginId, key, value) => {
      await patchPluginSecrets(pluginId, { [key]: value });
    },
  );
  setPluginSettingsAccess((pluginId) => getCachedPluginSettings(pluginId));
  bindPluginMailShell();
  resetHooks();
  resetPluginServices();
  resetShells();
  resetMailTemplates();
  resetEmailCatalogs();
  resetLanguages();
  const runtimeIds: string[] = [];
  for (const plugin of enabled) {
    try {
      await applyPluginMigrations(plugin.manifest);
      const register = await importRegister(plugin);
      if (register) {
        const api = createPluginRegisterApi(plugin.id, plugin.manifest);
        await register(api);
      }
      runtimeIds.push(plugin.id);
      await markPluginLoadOk(plugin.id);
    } catch (error) {
      console.error(`[plugins] incompatible ${plugin.id}; disabling without stopping the shop`, error);
      if (!plugin.manifest.required) {
        await markPluginLoadFailed(plugin.id, error);
      }
    }
  }
  assertConfiguredLanguagesRegistered(config.i18n.defaultLanguage, config.i18n.enabledLanguages);
  setRuntimeEnabledPluginIds(runtimeIds);
  loadedKey = key;
}

export async function loadEnabledPlugins(force = false): Promise<void> {
  ensurePluginImportHook();
  const run = loadChain.then(() => loadEnabledPluginsLocked(force));
  loadChain = run.catch(() => undefined);
  await run;
}

export async function ensurePluginsLoaded(): Promise<void> {
  await loadEnabledPlugins();
}

export async function reloadPluginRuntime(): Promise<void> {
  await loadEnabledPlugins(true);
}
