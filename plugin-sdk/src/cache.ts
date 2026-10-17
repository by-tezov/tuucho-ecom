export type PluginCacheSensitivity = 'public' | 'private';

export interface PluginCacheSetOptions {
  ttl?: number;
  sensitivity?: PluginCacheSensitivity;
}

export interface PluginCacheNamespace {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown, options?: PluginCacheSetOptions): void;
  del(key: string): void;
  flush(): void;
}

type SealFn = (value: unknown) => unknown;
type UnsealFn = (value: unknown) => unknown;

const PUBLIC_SECRET_KEY = /token|password|secret|pan|card|cvv|cvc/i;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

type Entry = {
  value: unknown;
  expiresAt: number;
  sensitivity: PluginCacheSensitivity;
};

const stores = new Map<string, Map<string, Entry>>();
let sealPrivate: SealFn = (value) => value;
let unsealPrivate: UnsealFn = (value) => value;

export function setPluginCacheSealer(seal: SealFn, unseal: UnsealFn): void {
  sealPrivate = seal;
  unsealPrivate = unseal;
}

function storeFor(pluginId: string): Map<string, Entry> {
  let store = stores.get(pluginId);
  if (!store) {
    store = new Map();
    stores.set(pluginId, store);
  }
  return store;
}

function assertPublicKey(key: string, sensitivity: PluginCacheSensitivity): void {
  if (sensitivity === 'public' && PUBLIC_SECRET_KEY.test(key)) {
    throw new Error('plugin_cache_secret_forbidden');
  }
}

export function pluginCacheNamespace(pluginId: string): PluginCacheNamespace {
  return {
    get<T = unknown>(key: string): T | undefined {
      const store = stores.get(pluginId);
      const entry = store?.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        store?.delete(key);
        return undefined;
      }
      const raw = entry.sensitivity === 'private' ? unsealPrivate(entry.value) : entry.value;
      return raw as T;
    },
    set(key: string, value: unknown, options?: PluginCacheSetOptions): void {
      const sensitivity = options?.sensitivity ?? 'public';
      assertPublicKey(key, sensitivity);
      const ttl = options?.ttl && options.ttl > 0 ? options.ttl : DEFAULT_TTL_MS;
      const stored = sensitivity === 'private' ? sealPrivate(value) : value;
      storeFor(pluginId).set(key, {
        value: stored,
        expiresAt: Date.now() + ttl,
        sensitivity,
      });
    },
    del(key: string): void {
      stores.get(pluginId)?.delete(key);
    },
    flush(): void {
      stores.delete(pluginId);
    },
  };
}

export function flushPluginCache(pluginId: string): void {
  stores.delete(pluginId);
}

export function resetPluginCache(): void {
  stores.clear();
}
