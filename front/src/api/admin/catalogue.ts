/** Admin full-product JSON editor transport. */
import { authHeaders, requestJson as request } from '../client';
import type {
  AdminCatalogueDocument,
  AdminCatalogueKind,
  AdminCataloguePhotoPreview,
} from '../contract/admin/catalog';

export type { AdminCatalogueDocument, AdminCatalogueKind, AdminCataloguePhotoPreview };

export function getAdminCatalogueTemplate(
  accessToken: string,
  catalogue: AdminCatalogueKind,
): Promise<{ success: true; document: AdminCatalogueDocument }> {
  return request(`/admin/catalogue/${encodeURIComponent(catalogue)}/template`, {
    headers: authHeaders(accessToken),
  });
}

export function getAdminCatalogueProduct(
  accessToken: string,
  catalogue: AdminCatalogueKind,
  productUid: string,
): Promise<{ success: true; document: AdminCatalogueDocument; photos: AdminCataloguePhotoPreview[] }> {
  return request(`/admin/catalogue/${encodeURIComponent(catalogue)}/${encodeURIComponent(productUid)}`, {
    headers: authHeaders(accessToken),
  });
}

export function createAdminCatalogueProduct(
  accessToken: string,
  catalogue: AdminCatalogueKind,
  document: AdminCatalogueDocument,
  files: File[],
): Promise<{ success: true; productUid: string; created: boolean; changes: string[] }> {
  const form = new FormData();
  form.append('document', JSON.stringify(document));
  for (const file of files) form.append('photos', file, file.name);
  return request(`/admin/catalogue/${encodeURIComponent(catalogue)}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });
}

export function replaceAdminCatalogueProduct(
  accessToken: string,
  catalogue: AdminCatalogueKind,
  productUid: string,
  document: AdminCatalogueDocument,
  files: File[],
): Promise<{ success: true; productUid: string; created: boolean; changes: string[] }> {
  const form = new FormData();
  form.append('document', JSON.stringify(document));
  for (const file of files) form.append('photos', file, file.name);
  return request(
    `/admin/catalogue/${encodeURIComponent(catalogue)}/${encodeURIComponent(productUid)}`,
    {
      method: 'PUT',
      headers: authHeaders(accessToken),
      body: form,
    },
  );
}

export function deleteAdminCatalogueProduct(
  accessToken: string,
  catalogue: AdminCatalogueKind,
  productUid: string,
): Promise<{ success: true; deleted: true }> {
  return request(`/admin/catalogue/${encodeURIComponent(catalogue)}/${encodeURIComponent(productUid)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
}
