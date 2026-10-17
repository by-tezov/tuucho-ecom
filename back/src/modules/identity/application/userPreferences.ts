import type pg from 'pg';
import { languageFromPreference, type Language } from '../../../utils/language.js';

export async function setUserPreference(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await client.query(
    `insert into user_preference (user_id, key, value)
     values ($1, $2, $3)
     on conflict (user_id, key) do update set value = excluded.value, updated_at = now()`,
    [userId, key, value],
  );
}

export async function getUserPreference(pool: pg.Pool, userId: string, key: string): Promise<string | null> {
  const { rows } = await pool.query<{ value: string }>(
    `select value from user_preference where user_id = $1 and key = $2`,
    [userId, key],
  );
  return rows[0]?.value ?? null;
}

export async function deleteUserPreference(pool: pg.Pool, userId: string, key: string): Promise<void> {
  await pool.query(`delete from user_preference where user_id = $1 and key = $2`, [userId, key]);
}

/** The user's saved site language (English when none is saved), for mail
 * the shop sends without a request to read the language from. */
export async function getUserLanguage(pool: pg.Pool, userId: string): Promise<Language> {
  return languageFromPreference(await getUserPreference(pool, userId, 'language'));
}
