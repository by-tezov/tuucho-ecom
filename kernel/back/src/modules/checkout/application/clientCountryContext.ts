import type { Request } from 'express';
import {
  buildClientCountryContext,
  normalizeCountryCode,
  type ClientCountryContext,
} from '../../commerce/domain/clientCountryContext.js';
import { resolveGeoCountryCodeAsync } from '../../../platform/network/geoLocation.js';

export async function buildClientCountryContextFromRequest(
  req: Request,
  deliveryCountry?: string | null,
): Promise<ClientCountryContext> {
  const cfCountry = typeof req.headers['cf-ipcountry'] === 'string' ? req.headers['cf-ipcountry'] : undefined;
  const geoCountry = await resolveGeoCountryCodeAsync(req.ip, cfCountry);
  const delivery = normalizeCountryCode(deliveryCountry ?? null);
  return buildClientCountryContext(delivery, geoCountry);
}
