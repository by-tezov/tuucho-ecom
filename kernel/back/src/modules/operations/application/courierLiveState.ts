import type pg from 'pg';
import {
  findByCode,
  listCouriers,
  setCourierCountryEnabled,
  setCourierEnabled,
} from '../../delivery/application/couriers.js';

export type CourierLiveStateEntry = {
  code: string;
  enabled: boolean;
  /** ISO codes to enable on this courier; every other catalogued row is disabled. */
  enabledCountries: string[];
};

export type CourierLiveStateSnapshot = Array<{
  code: string;
  enabled: boolean;
  countries: Array<{ code: string; enabled: boolean }>;
}>;

export async function readCourierLiveState(pool: pg.Pool): Promise<CourierLiveStateSnapshot> {
  const couriers = await listCouriers(pool);
  return couriers.map((courier) => ({
    code: courier.code,
    enabled: courier.enabled,
    countries: courier.countries.map((entry) => ({ code: entry.code, enabled: entry.enabled })),
  }));
}

export async function applyCourierLiveState(
  pool: pg.Pool,
  entries: CourierLiveStateEntry[],
): Promise<CourierLiveStateSnapshot> {
  for (const entry of entries) {
    const courier = await findByCode(pool, entry.code);
    if (!courier) {
      throw new Error(`courier "${entry.code}" is not in the database`);
    }
    if (courier.enabled !== entry.enabled) {
      const ok = await setCourierEnabled(pool, entry.code, entry.enabled);
      if (!ok) throw new Error(`failed to set courier "${entry.code}" enabled=${entry.enabled}`);
    }
    const enableSet = new Set(entry.enabledCountries.map((code) => code.toUpperCase()));
    for (const country of courier.countries) {
      const next = enableSet.has(country.code);
      if (country.enabled === next) continue;
      const result = await setCourierCountryEnabled(pool, entry.code, country.code, next);
      if (!result.ok) {
        throw new Error(`failed to set ${entry.code}/${country.code} enabled=${next}: ${result.reason}`);
      }
    }
  }
  return readCourierLiveState(pool);
}
