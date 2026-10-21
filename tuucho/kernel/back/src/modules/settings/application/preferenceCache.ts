/**
 * The process-local preference cache.
 *
 * The API, the OPS server and the CLIs are separate processes sharing one
 * table, so `app_preferences.updated_at` is the coherency watermark between
 * them. Two invariants keep that honest, and both were broken here before:
 *
 * - the watermark is never newer than the values it describes, so a reader
 *   cannot believe it is current while holding older data;
 * - a write reloads rather than patching its own keys in, so another
 *   process's writes since the last load are not masked.
 */
import type { Pool } from 'pg';
import { pool } from '../../../db/pool.js';
import { allKeys, defaultForKey, parseBool, type AppPreferenceKey } from './preferenceKeys.js';

type CacheState = {
  values: Map<string, boolean>;
  updatedAt: Date | null;
  loaded: boolean;
};

const cache: CacheState = {
  values: new Map(),
  updatedAt: null,
  loaded: false,
};

let loadPromise: Promise<void> | null = null;

async function loadCache(db: Pool = pool): Promise<void> {
  const { rows } = await db.query<{ key: string; value: unknown; updated_at: Date | string }>(
    `select key, value, updated_at from app_preferences`,
  );
  const next = new Map<string, boolean>();
  let latest: Date | null = null;
  for (const row of rows) {
    const parsed = parseBool(row.value);
    if (parsed === undefined) continue;
    // Rename leftover key from the first preferences draft (processing gate).
    if (row.key === 'cron_shipment_enabled') {
      next.set('cron_shipment_log_enabled', parsed);
    } else if (row.key === 'cron_guest_saved_checkout_log_enabled') {
      next.set('cron_guest_saved_cleanup_log_enabled', parsed);
    } else {
      next.set(row.key, parsed);
    }
    const rowAt = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
    if (!Number.isNaN(rowAt.getTime()) && (!latest || rowAt > latest)) latest = rowAt;
  }
  if (next.has('cron_shipment_log_enabled') && rows.some((row) => row.key === 'cron_shipment_enabled')) {
    const value = next.get('cron_shipment_log_enabled')!;
    await db.query(
      `insert into app_preferences (key, value)
       values ('cron_shipment_log_enabled', $1::jsonb)
       on conflict (key) do nothing`,
      [JSON.stringify({ enabled: value })],
    );
    await db.query(`delete from app_preferences where key = 'cron_shipment_enabled'`);
  }
  if (
    next.has('cron_guest_saved_cleanup_log_enabled') &&
    rows.some((row) => row.key === 'cron_guest_saved_checkout_log_enabled')
  ) {
    const value = next.get('cron_guest_saved_cleanup_log_enabled')!;
    await db.query(
      `insert into app_preferences (key, value)
       values ('cron_guest_saved_cleanup_log_enabled', $1::jsonb)
       on conflict (key) do nothing`,
      [JSON.stringify({ enabled: value })],
    );
    await db.query(`delete from app_preferences where key = 'cron_guest_saved_checkout_log_enabled'`);
  }
  // Seed missing keys from env-derived defaults so first boot matches prior behaviour.
  const missing = allKeys().filter((key) => !next.has(key));
  if (missing.length > 0) {
    for (const key of missing) {
      const value = defaultForKey(key);
      next.set(key, value);
      await db.query(
        `insert into app_preferences (key, value) values ($1, $2::jsonb)
         on conflict (key) do nothing`,
        [key, JSON.stringify({ enabled: value })],
      );
    }
    // Deliberately leave `latest` on the rows actually read above.
    //
    // The watermark must never be newer than the data it describes. Stamping
    // it from the process clock, or from a second `max(updated_at)` query, both
    // let the cache claim to be current while holding older values: a write
    // landing between the row scan and the stamp is then invisible for the
    // rest of the process's life. That is what served a seeded
    // `sign_in_google_enabled = true` as the `false` default.
    //
    // Keeping the older watermark means the next refresh sees these inserts as
    // newer and reloads once more, which converges instead of going stale.
  }
  cache.values = next;
  cache.updatedAt = latest;
  cache.loaded = true;
}

let watermarkPromise: Promise<Date | null> | null = null;

/** The newest `updated_at` in the table, on the database's clock. */
async function readWatermark(db: Pool): Promise<Date | null> {
  const { rows } = await db.query<{ max: Date | string | null }>(
    `select max(updated_at) as max from app_preferences`,
  );
  const raw = rows[0]?.max ?? null;
  if (raw == null) return null;
  const at = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** One in-flight load at a time, shared by every caller.
 *
 * `loadCache` publishes by assigning `cache.values` at the very end, so a
 * reload is invisible until it is complete. Nothing here may clear
 * `cache.loaded` first: `readBool` falls back to env defaults while the cache
 * is unloaded, and those defaults are `false` for every sign-in and payment
 * method. Clearing the flag around an await therefore reported the shop as
 * having no sign-in and no payment methods to any request that arrived during
 * the reload. */
async function loadOnce(db: Pool): Promise<void> {
  if (!loadPromise) {
    loadPromise = loadCache(db).finally(() => {
      loadPromise = null;
    });
  }
  await loadPromise;
}

export async function ensureLoaded(db: Pool = pool): Promise<void> {
  if (cache.loaded) return;
  await loadOnce(db);
}

/**
 * OPS and the public API are separate processes. Seeds / admin patches written
 * through OPS update Postgres but leave this process's in-memory map stale.
 * Reload when `max(updated_at)` is newer than the cached watermark.
 */
async function refreshIfStale(db: Pool = pool): Promise<void> {
  if (!cache.loaded) return;
  // Concurrent requests share one watermark read instead of each sending its
  // own `max(updated_at)`: every public gallery request lands here. Only an
  // in-flight read is shared, never a finished one, so a change written just
  // before a request is still seen by it.
  if (!watermarkPromise) {
    watermarkPromise = readWatermark(db).finally(() => {
      watermarkPromise = null;
    });
  }
  const maxAt = await watermarkPromise;
  if (!maxAt) return;
  if (cache.updatedAt && !(maxAt > cache.updatedAt)) return;
  // Reload in place. The previous values stay readable until the new map is
  // assigned, so a concurrent request never sees the unloaded state.
  await loadOnce(db);
}

export function readBool(key: AppPreferenceKey): boolean {
  if (!cache.loaded) {
    // Sync callers (spyRecipient / apiLogEnabled) before first await: use env defaults.
    return defaultForKey(key);
  }
  return cache.values.get(key) ?? defaultForKey(key);
}

/** Warm the preference cache (call from boot). Safe to call repeatedly.
 * Re-reads Postgres when another process (OPS seed / remote admin) changed
 * `app_preferences` after this process last loaded the map. */
export async function warmAppPreferences(db: Pool = pool): Promise<void> {
  await ensureLoaded(db);
  await refreshIfStale(db);
}

/** The watermark of the values currently cached, for snapshots. */
export function cachedPreferencesUpdatedAt(): Date | null {
  return cache.updatedAt;
}

/** Used by the writer to publish freshly committed values. */
export async function reloadPreferences(db: Pool): Promise<void> {
  cache.loaded = false;
  await loadOnce(db);
}
