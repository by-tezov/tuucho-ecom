/** Admin courier catalog transport. */
import { authHeaders, requestJson as request } from '../client';
import type {
  CourierCatalogCourier,
  CourierCatalogDocument,
  CourierCatalogLocaleText,
  CourierCatalogMeasurement,
} from '../contract/admin/courierCatalog';

export type {
  CourierCatalogCourier,
  CourierCatalogDocument,
  CourierCatalogLocaleText,
  CourierCatalogMeasurement,
};

export function getCourierCatalog(accessToken: string): Promise<{ success: true } & CourierCatalogDocument> {
  return request('/admin/courier-catalog', { headers: authHeaders(accessToken) });
}

export function putCourierCatalogCourier(
  accessToken: string,
  code: string,
  body: Record<string, unknown>,
): Promise<{ success: true }> {
  return request(`/admin/courier-catalog/couriers/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function putCourierCatalogCountry(
  accessToken: string,
  code: string,
  label: Record<string, unknown>,
): Promise<{ success: true }> {
  return request(`/admin/courier-catalog/countries/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(label),
  });
}

export function putCourierCatalogNetwork(
  accessToken: string,
  code: string,
  body: Record<string, unknown>,
): Promise<{ success: true }> {
  return request(`/admin/courier-catalog/networks/${encodeURIComponent(code)}`, {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}

export function putCourierCatalogMeasurements(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<{ success: true }> {
  return request('/admin/courier-catalog/measurements', {
    method: 'PUT',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
}
