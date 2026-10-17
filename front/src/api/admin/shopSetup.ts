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

export interface AdminDocsArticle {
  id: string;
  title: string;
  summary: string;
  group: string;
  groupTitle: string;
  pluginId: string;
  pluginEnabled: boolean;
  sections: Array<{ heading: string; paragraphs: string[]; code?: string }>;
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
    rates?: Array<{ code: string; packets: Array<{ key: string; price: CourierPriceValue }> }>;
  },
) {
  return request(`/admin/plugins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
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
