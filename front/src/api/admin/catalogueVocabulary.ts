/** Admin vocabulary page transport. */
import { authHeaders, requestJson as request } from '../client';
import type { CatalogueLibraryPart, CatalogueVocabularyIndex } from '../contract/admin/catalogueVocabulary';

export type { CatalogueLibraryPart, CatalogueVocabularyIndex };

export function getCatalogueVocabulary(accessToken: string): Promise<{ success: true } & CatalogueVocabularyIndex> {
  return request('/admin/catalogue-vocabulary', { headers: authHeaders(accessToken) });
}

export function getCatalogueLibraryPart(
  accessToken: string,
  part: CatalogueLibraryPart,
  key: string,
): Promise<{ success: true; document: Record<string, unknown> }> {
  return request(`/admin/catalogue-vocabulary/library/${part}/${encodeURIComponent(key)}`, {
    headers: authHeaders(accessToken),
  });
}

export function putCatalogueLibraryPart(
  accessToken: string,
  part: CatalogueLibraryPart,
  key: string,
  document: Record<string, unknown>,
): Promise<{ success: true; created: boolean }> {
  return request(`/admin/catalogue-vocabulary/library/${part}/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ document }),
  });
}

export function deleteCatalogueLibraryPart(
  accessToken: string,
  part: CatalogueLibraryPart,
  key: string,
): Promise<{ success: true; deleted: true }> {
  return request(`/admin/catalogue-vocabulary/library/${part}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function getCatalogueNailAxis(
  accessToken: string,
  axis: string,
): Promise<{ success: true; document: Record<string, unknown> }> {
  return request(`/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}`, {
    headers: authHeaders(accessToken),
  });
}

export function putCatalogueNailAxis(
  accessToken: string,
  axis: string,
  document: Record<string, unknown>,
): Promise<{ success: true; created: boolean }> {
  return request(`/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ document }),
  });
}

export function deleteCatalogueNailAxis(
  accessToken: string,
  axis: string,
): Promise<{ success: true; deleted: true }> {
  return request(`/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}

export function getCatalogueNailOption(
  accessToken: string,
  axis: string,
  option: string,
): Promise<{ success: true; document: Record<string, unknown> }> {
  return request(
    `/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}/${encodeURIComponent(option)}`,
    { headers: authHeaders(accessToken) },
  );
}

export function putCatalogueNailOption(
  accessToken: string,
  axis: string,
  option: string,
  document: Record<string, unknown>,
): Promise<{ success: true; created: boolean }> {
  return request(
    `/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}/${encodeURIComponent(option)}`,
    {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ document }),
    },
  );
}

export function deleteCatalogueNailOption(
  accessToken: string,
  axis: string,
  option: string,
): Promise<{ success: true; deleted: true }> {
  return request(
    `/admin/catalogue-vocabulary/nail/${encodeURIComponent(axis)}/${encodeURIComponent(option)}`,
    { method: 'DELETE', headers: authHeaders(accessToken) },
  );
}
