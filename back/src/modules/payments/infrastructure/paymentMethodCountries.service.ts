import type { Pool } from 'pg';
import {
  COUNTRY_LIST_ALL,
  normalizeCountryCode,
  type CountryCode,
} from '../../commerce/domain/clientCountryContext.js';

export type PaymentMethodKey = 'card' | 'paypal' | 'bancontact' | 'google_pay' | 'apple_pay';

const PAYMENT_METHOD_COUNTRIES_KEY = 'payment_method_countries';

export type PaymentMethodCountriesMap = Record<PaymentMethodKey, CountryCode[]>;

const METHODS: PaymentMethodKey[] = ['card', 'paypal', 'bancontact', 'google_pay', 'apple_pay'];

const DEFAULTS: PaymentMethodCountriesMap = {
  card: [COUNTRY_LIST_ALL],
  paypal: [COUNTRY_LIST_ALL],
  bancontact: ['BE'],
  google_pay: [COUNTRY_LIST_ALL],
  apple_pay: [COUNTRY_LIST_ALL],
};

let cache: PaymentMethodCountriesMap | null = null;
let loadPromise: Promise<void> | null = null;

function emptyMap(): PaymentMethodCountriesMap {
  return { card: [], paypal: [], bancontact: [], google_pay: [], apple_pay: [] };
}

function parseCountryList(value: unknown): CountryCode[] {
  if (!Array.isArray(value)) return [];
  const out: CountryCode[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const upper = entry.trim().toUpperCase();
    if (upper === COUNTRY_LIST_ALL) {
      if (!out.includes(COUNTRY_LIST_ALL)) out.push(COUNTRY_LIST_ALL);
      continue;
    }
    const code = normalizeCountryCode(entry);
    if (code && !out.includes(code)) out.push(code);
  }
  if (out.includes(COUNTRY_LIST_ALL)) return [COUNTRY_LIST_ALL];
  return out;
}

function parseStored(value: unknown): PaymentMethodCountriesMap {
  const base = emptyMap();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULTS };
  const record = value as Record<string, unknown>;
  for (const method of METHODS) {
    base[method] = parseCountryList(record[method]);
  }
  // Preserve seeded default for bancontact when row exists but field omitted.
  if (!('bancontact' in record)) base.bancontact = [...DEFAULTS.bancontact];
  return base;
}

async function load(db: Pool): Promise<void> {
  const { rows } = await db.query<{ value: unknown }>(`select value from app_preferences where key = $1`, [
    PAYMENT_METHOD_COUNTRIES_KEY,
  ]);
  cache = rows[0] ? parseStored(rows[0].value) : { ...DEFAULTS };
}

export async function warmPaymentMethodCountries(db: Pool): Promise<void> {
  if (cache) return;
  if (!loadPromise) {
    loadPromise = load(db).finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

export function getPaymentMethodCountriesSnapshot(): PaymentMethodCountriesMap {
  return cache
    ? {
        ...cache,
        bancontact: [...cache.bancontact],
        card: [...cache.card],
        paypal: [...cache.paypal],
        google_pay: [...cache.google_pay],
        apple_pay: [...cache.apple_pay],
      }
    : { ...DEFAULTS };
}


export async function readPaymentMethodCountriesSnapshot(db: Pool): Promise<PaymentMethodCountriesMap> {
  const { rows } = await db.query<{ value: unknown }>(`select value from app_preferences where key = $1`, [
    PAYMENT_METHOD_COUNTRIES_KEY,
  ]);
  return rows[0] ? parseStored(rows[0].value) : { ...DEFAULTS };
}

export async function patchPaymentMethodCountries(
  db: Pool,
  patch: Partial<PaymentMethodCountriesMap>,
): Promise<PaymentMethodCountriesMap> {
  await warmPaymentMethodCountries(db);
  const current = getPaymentMethodCountriesSnapshot();
  for (const method of METHODS) {
    if (patch[method] !== undefined) {
      current[method] = parseCountryList(patch[method]);
    }
  }
  await db.query(
    `insert into app_preferences (key, value) values ($1, $2::jsonb)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [PAYMENT_METHOD_COUNTRIES_KEY, JSON.stringify(current)],
  );
  cache = { ...current };
  return getPaymentMethodCountriesSnapshot();
}

export function invalidatePaymentMethodCountriesCache(): void {
  cache = null;
}
