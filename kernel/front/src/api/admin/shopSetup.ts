import { authHeaders, requestJson as request } from '../client';

export type CourierPriceValue = number | Record<string, number>;

export interface AdminPluginRatePacket {
  key: string;
  maxQuantity: number;
  price: CourierPriceValue;
}

export interface AdminPluginRate {
  code: string;
  name: string;
  packets: AdminPluginRatePacket[];
}

export interface AdminPluginCompatibility {
  ok: boolean;
  errors: Array<{ code: string; message: string; dependencyId?: string }>;
}

export interface AdminPlugin {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  schemaVersion?: string | null;
  missingFromDisk?: boolean;
  bundled?: boolean;
  repository?: string | null;
  manifest: {
    name: string;
    kind: string;
    version?: string;
    required?: boolean;
    description: string;
    engines?: { core?: string };
    dependsOn?: Array<string | { id: string; version?: string }>;
    courierCodes?: string[];
    settingsSchema?: Record<string, { type: 'string' | 'text' | 'number' | 'boolean'; label?: string }>;
  };
  compatibility?: AdminPluginCompatibility;
  rates: AdminPluginRate[];
}

export type UpdateScope = 'all' | 'kernel' | 'plugins' | 'plugin';

export interface AdminUpdateCheck {
  currentTag: string;
  currentKernel: string;
  inferred: boolean;
  latestTag: string | null;
  officialUpToDate: boolean;
  canApplyOfficial: boolean;
  officialRefuse?: string;
  dirtyPaths: string[];
  tagPath: string[];
  kernel?: { id: string; from: string; to: string };
  plugins: Array<{ id: string; from: string; to: string; installPath?: string }>;
  userPlugins: Array<{
    id: string;
    name: string;
    repository: string;
    from: string;
    to: string;
    toTag: string;
    tags: string[];
    changelog?: string;
    error?: string;
  }>;
  restartRequired: boolean;
}

export interface AdminUpdateJob {
  id: string;
  status: 'running' | 'ok' | 'error';
  log: Array<{ name: string; status: 'pending' | 'installing' | 'ok' | 'error'; message?: string }>;
  restartRequired: boolean;
  error?: string;
}

export type AdminDocsBlock =
  | { type: 'p'; text: string }
  | { type: 'callout'; tone: 'info' | 'warning' | 'important'; title?: string; text: string }
  | { type: 'cards'; items: Array<{ title: string; text: string }> }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'defs'; items: Array<{ term: string; description: string }> }
  | { type: 'code'; language: string; code: string; caption?: string };

export interface AdminDocsArticle {
  id: string;
  title: string;
  summary: string;
  group: string;
  groupTitle: string;
  pluginId: string;
  pluginEnabled: boolean;
  sections: Array<{ heading: string; blocks: AdminDocsBlock[]; paragraphs?: string[]; code?: string }>;
}

export interface AdminDocsGroup {
  id: string;
  title: string;
  pluginId?: string;
  enabled: boolean;
  articles: Array<{ id: string; title: string; summary: string }>;
}

export function getAdminPlugin(accessToken: string, id: string) {
  return request<{ success: true; plugin: AdminPlugin }>(`/admin/plugins/${encodeURIComponent(id)}`, {
    headers: authHeaders(accessToken),
  });
}

export function getAdminPlugins(accessToken: string) {
  return request<{ success: true; coreVersion: string; plugins: AdminPlugin[] }>('/admin/plugins', {
    headers: authHeaders(accessToken),
  });
}

export function getAdminDocs(accessToken: string) {
  return request<{
    success: true;
    coreVersion: string;
    groups: AdminDocsGroup[];
    articles: AdminDocsArticle[];
  }>('/admin/docs', {
    headers: authHeaders(accessToken),
  });
}

export function scanAdminPlugins(accessToken: string) {
  return request<{
    success: true;
    coreVersion: string;
    added: string[];
    incompatible: string[];
    plugins: AdminPlugin[];
  }>('/admin/plugins/scan', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  });
}

export function patchAdminPlugin(
  accessToken: string,
  id: string,
  body: {
    enabled?: boolean;
    settings?: Record<string, unknown>;
  },
) {
  return request(`/admin/plugins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function uploadAdminPlugin(accessToken: string, file: File) {
  const body = new FormData();
  body.append('archive', file);
  return request<{ success: true; id: string; enabled: boolean; plugin: AdminPlugin | null }>(
    '/admin/plugins/upload',
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body,
    },
  );
}

export function checkAdminPluginUpdates(accessToken: string) {
  return request<{ success: true; check: AdminUpdateCheck }>('/admin/plugins/updates/check', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  });
}

export function applyAdminPluginUpdates(accessToken: string, scope: UpdateScope, pluginId?: string) {
  return request<{ success: true; job: AdminUpdateJob }>('/admin/plugins/updates/apply', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ scope, pluginId }),
  });
}

export function getAdminPluginUpdateStatus(accessToken: string) {
  return request<{ success: true; job: AdminUpdateJob | null }>('/admin/plugins/updates/status', {
    headers: authHeaders(accessToken),
  });
}

export function uninstallAdminPlugin(accessToken: string, id: string) {
  return request<{ success: true; reverted: string[] }>(
    `/admin/plugins/${encodeURIComponent(id)}/uninstall`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ confirm: true }),
    },
  );
}

export function getAdminStore(accessToken: string) {
  return request<{
    success: true;
    identity: {
      name: string;
      suffix: string;
      contactEmail: string;
      taxMode: 'none';
    };
    axes: Array<{
      key: 'shape' | 'length' | 'size';
      enabled: boolean;
      hideInUi: boolean;
      autoHideSingle: boolean;
      label: Record<string, string>;
    }>;
    theme: { tokens: Record<string, string> };
    menus: Array<{
      key: string;
      pluginId: string;
      label: string;
      visible: boolean;
      order: number;
      bottomBar: boolean;
    }>;
  }>('/admin/store', { headers: authHeaders(accessToken) });
}

export function patchAdminStore(accessToken: string, body: Record<string, unknown>) {
  return request('/admin/store', {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
