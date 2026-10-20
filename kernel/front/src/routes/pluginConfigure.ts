import type { AdminPlugin } from '../api/admin/shopSetup';
import { pluginHasFrontConfigure } from '../plugins/PluginHost';
import { adminPath } from '../utils/adminRoute';

/** True when Configure opens this plugin's own settings form
 * (`/admin/plugins/:id`). Admin CRUD pages (docs, SEO, journals, commerce)
 * and the kernel Couriers JSON catalog are sidebar items, not Configure. */
export function pluginHasConfigure(plugin: AdminPlugin): boolean {
  if (pluginHasFrontConfigure(plugin.id)) return true;
  if (plugin.manifest.kind === 'theme') return true;
  const schema = plugin.manifest.settingsSchema ?? {};
  const settings = plugin.settings ?? {};
  return Object.keys(schema).length > 0 || Object.keys(settings).length > 0;
}

export function pluginConfigurePath(plugin: AdminPlugin): string | null {
  if (!pluginHasConfigure(plugin)) return null;
  return adminPath(`/plugins/${plugin.id}`);
}
