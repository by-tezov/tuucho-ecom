import { authHeaders, requestDownload, requestJson as request } from '../client';

export type DiskConfigStatus = { present: boolean; differ: boolean };

export function getRoleConfigStatus(accessToken: string) {
  return request<{ success: true } & DiskConfigStatus>('/admin/roles/config-files', {
    headers: authHeaders(accessToken),
  });
}

export function applyRoleConfig(accessToken: string) {
  return request<{ success: true; applied: string[]; skipped: string[] } & DiskConfigStatus>(
    '/admin/roles/config-files/apply',
    { method: 'POST', headers: authHeaders(accessToken), body: JSON.stringify({}) },
  );
}

export function importRoleConfig(accessToken: string, name: string, text: string) {
  return request<{ success: true } & DiskConfigStatus>('/admin/roles/config-files/import', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name, text }),
  });
}

export function exportRoleConfig(accessToken: string) {
  return requestDownload('/admin/roles/config-files/export', { headers: authHeaders(accessToken) });
}

export function getCoreConfig(accessToken: string) {
  return request<{ success: true; present: boolean; text: string }>('/admin/core-config', {
    headers: authHeaders(accessToken),
  });
}

export function saveCoreConfig(accessToken: string, text: string) {
  return request<{ success: true; present: boolean; text: string }>('/admin/core-config', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ text }),
  });
}

export function applyCoreConfig(accessToken: string) {
  return request<{ success: true; present: boolean; text: string }>('/admin/core-config/apply', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  });
}

export function importCoreConfig(accessToken: string, text: string) {
  return request<{ success: true; present: boolean; text: string }>('/admin/core-config/import', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ text }),
  });
}

export function exportCoreConfig(accessToken: string) {
  return requestDownload('/admin/core-config/export', { headers: authHeaders(accessToken) });
}

export type GithubAccessEntry = {
  repository: string;
  updatedAt: string;
};

export function listGithubAccess(accessToken: string) {
  return request<{ success: true; entries: GithubAccessEntry[] }>('/admin/github-access', {
    headers: authHeaders(accessToken),
  });
}

export function saveGithubAccess(accessToken: string, repository: string, token: string) {
  return request<{ success: true; entry: GithubAccessEntry }>('/admin/github-access', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ repository, token }),
  });
}

export function deleteGithubAccess(accessToken: string, repository: string) {
  return request<{ success: true }>('/admin/github-access', {
    method: 'DELETE',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ repository }),
  });
}
