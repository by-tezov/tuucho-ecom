type GetSecret = (pluginId: string, key: string) => string | undefined;
type SetSecret = (pluginId: string, key: string, value: string) => Promise<void>;

let getter: GetSecret = () => undefined;
let setter: SetSecret = async () => {
  throw new Error('plugin_secret_store_unavailable');
};

export function setPluginSecretAccess(get: GetSecret, set: SetSecret): void {
  getter = get;
  setter = set;
}

export function getPluginSecret(pluginId: string, key: string): string | undefined {
  const value = getter(pluginId, key);
  return value?.trim() ? value : undefined;
}

export async function setPluginSecret(pluginId: string, key: string, value: string): Promise<void> {
  await setter(pluginId, key, value);
}

export function resetPluginSecretAccess(): void {
  getter = () => undefined;
  setter = async () => {
    throw new Error('plugin_secret_store_unavailable');
  };
}
