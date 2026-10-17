import type pg from 'pg';
import { config } from '../../../config/env.js';
import type { GiftSettings } from '../domain/settings.js';

function programFromEnv(): Omit<GiftSettings, 'enabled'> {
  return { ...config.gift };
}

/** Programme numbers from env. `enabled` is always true: the leftover
 * `gift_settings.enabled` column is not read. */
export async function getGiftSettings(_db: pg.Pool | pg.PoolClient): Promise<GiftSettings> {
  return {
    ...programFromEnv(),
    enabled: true,
  };
}
