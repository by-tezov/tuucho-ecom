/** Read and write one vocabulary entry. Library shapes, lengths and colours
 * update the shop tables. Nail variation titles and options update variation
 * tables. */
import type pg from 'pg';
import type { AuthenticatedUser } from '../../../types.js';
import { pool } from '../../../db/pool.js';
import { withTransaction } from '../../../platform/db/transaction.js';
import { recordAdminActivity } from '../../activity/application/recordAdminActivity.js';
import type { CatalogueVocabularyIndex } from '../../../contract/admin/catalogueVocabulary.js';
import {
  VocabularyEditError,
  type LengthPart,
  type ShapePart,
  type VocabularyTranslation,
} from '../domain/catalogueVocabulary.js';

export async function listCatalogueVocabulary(): Promise<CatalogueVocabularyIndex> {
  const [shapes, lengths, colors, axes, options] = await Promise.all([
    pool.query<{ key: string }>(`select key from shapes order by key`),
    pool.query<{ key: string }>(`select key from vocabulary_lengths order by key`),
    pool.query<{ key: string }>(`select key from colors order by key`),
    pool.query<{ key: string }>(`select key from variation_axes order by key`),
    pool.query<{ axis_key: string; option_key: string }>(
      `select axis_key, option_key from variation_options order by axis_key, sort_order, option_key`,
    ),
  ]);
  const nail = new Map<string, string[]>();
  for (const axis of axes.rows) nail.set(axis.key, []);
  for (const option of options.rows) {
    const list = nail.get(option.axis_key) ?? [];
    list.push(option.option_key);
    nail.set(option.axis_key, list);
  }
  return {
    library: {
      shapes: shapes.rows.map((row) => row.key),
      lengths: lengths.rows.map((row) => row.key),
      colors: colors.rows.map((row) => row.key),
    },
    nail: [...nail.entries()].map(([key, optionKeys]) => ({ key, options: optionKeys })),
  };
}

export async function readShape(key: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{
    label: VocabularyTranslation;
    gender: Record<string, string>;
    attributive: VocabularyTranslation;
  }>(`select label, gender, attributive from shapes where key = $1`, [key]);
  const shape = rows[0];
  if (!shape) throw new VocabularyEditError(404, 'Not found.');
  const lengths = await pool.query<{ length_key: string }>(
    `select length_key from shape_lengths where shape_key = $1 order by sort_order, length_key`,
    [key],
  );
  return {
    title: shape.label,
    gender: shape.gender ?? {},
    attributive: shape.attributive ?? {},
    length: lengths.rows.map((row) => `$${row.length_key}`),
  };
}

export async function writeShape(
  user: AuthenticatedUser,
  key: string,
  part: ShapePart,
): Promise<{ created: boolean }> {
  return write(async (client) => {
    const { rows: defs } = await client.query<{
      key: string;
      value: string;
      label: VocabularyTranslation;
      gender: Record<string, string>;
    }>(`select key, value, label, gender from vocabulary_lengths where key = any($1::text[])`, [part.lengths]);
    const byKey = new Map(defs.map((row) => [row.key, row]));
    const missing = part.lengths.filter((length) => !byKey.has(length));
    if (missing.length > 0) {
      throw new VocabularyEditError(400, `Unknown length: ${missing.join(', ')}. Add it under lengths first.`);
    }
    const created = await missingKey(client, `select key from shapes where key = $1`, key);
    await client.query(
      `insert into shapes (key, label, gender, attributive) values ($1, $2, $3, $4)
       on conflict (key) do update set label = excluded.label, gender = excluded.gender,
         attributive = excluded.attributive`,
      [key, part.title, part.gender, part.attributive],
    );
    await client.query(`delete from shape_lengths where shape_key = $1 and length_key <> all($2::text[])`, [
      key,
      part.lengths,
    ]);
    for (const [index, lengthKey] of part.lengths.entries()) {
      const length = byKey.get(lengthKey);
      if (!length) throw new VocabularyEditError(400, `Unknown length: ${lengthKey}.`);
      await client.query(
        `insert into shape_lengths (shape_key, length_key, value, label, gender, sort_order)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (shape_key, length_key) do update set value = excluded.value, label = excluded.label,
           gender = excluded.gender, sort_order = excluded.sort_order`,
        [key, lengthKey, length.value, length.label, length.gender ?? {}, index],
      );
    }
    await journal(
      client,
      user,
      'catalogue.vocabulary.update',
      `Forme ${key}: ${created ? 'créée' : 'mise à jour'}`,
      `shape:${key}`,
    );
    return { created };
  });
}

export async function deleteShape(user: AuthenticatedUser, key: string): Promise<boolean> {
  return remove(user, `delete from shapes where key = $1`, key, `Forme ${key}: retirée`, `shape:${key}`);
}

export async function readLength(key: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{
    value: string;
    label: VocabularyTranslation;
    gender: Record<string, string>;
  }>(`select value, label, gender from vocabulary_lengths where key = $1`, [key]);
  const length = rows[0];
  if (!length) throw new VocabularyEditError(404, 'Not found.');
  return { value: length.value, title: length.label, gender: length.gender ?? {} };
}

export async function writeLength(
  user: AuthenticatedUser,
  key: string,
  part: LengthPart,
): Promise<{ created: boolean }> {
  return write(async (client) => {
    const created = await missingKey(client, `select key from vocabulary_lengths where key = $1`, key);
    await client.query(
      `insert into vocabulary_lengths (key, value, label, gender) values ($1, $2, $3, $4)
       on conflict (key) do update set value = excluded.value, label = excluded.label, gender = excluded.gender`,
      [key, part.value, part.title, part.gender],
    );
    await client.query(`update shape_lengths set value = $2, label = $3, gender = $4 where length_key = $1`, [
      key,
      part.value,
      part.title,
      part.gender,
    ]);
    await journal(
      client,
      user,
      'catalogue.vocabulary.update',
      `Longueur ${key}: ${created ? 'créée' : 'mise à jour'}`,
      `length:${key}`,
    );
    return { created };
  });
}

export async function deleteLength(user: AuthenticatedUser, key: string): Promise<boolean> {
  return write(async (client) => {
    const deleted = await client.query(`delete from vocabulary_lengths where key = $1`, [key]);
    if (deleted.rowCount !== 1) return false;
    await client.query(`delete from shape_lengths where length_key = $1`, [key]);
    await journal(client, user, 'catalogue.vocabulary.delete', `Longueur ${key}: retirée`, `length:${key}`);
    return true;
  });
}

export async function readColor(key: string): Promise<VocabularyTranslation> {
  const { rows } = await pool.query<{ label: VocabularyTranslation }>(
    `select label from colors where key = $1`,
    [key],
  );
  const color = rows[0];
  if (!color) throw new VocabularyEditError(404, 'Not found.');
  return color.label;
}

export async function writeColor(
  user: AuthenticatedUser,
  key: string,
  title: VocabularyTranslation,
): Promise<{ created: boolean }> {
  return write(async (client) => {
    const created = await missingKey(client, `select key from colors where key = $1`, key);
    await client.query(
      `insert into colors (key, label) values ($1, $2) on conflict (key) do update set label = excluded.label`,
      [key, title],
    );
    await journal(
      client,
      user,
      'catalogue.vocabulary.update',
      `Couleur ${key}: ${created ? 'créée' : 'mise à jour'}`,
      `color:${key}`,
    );
    return { created };
  });
}

export async function deleteColor(user: AuthenticatedUser, key: string): Promise<boolean> {
  return remove(user, `delete from colors where key = $1`, key, `Couleur ${key}: retirée`, `color:${key}`);
}

export async function readNailAxis(axis: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query<{ title: VocabularyTranslation }>(
    `select title from variation_axes where key = $1`,
    [axis],
  );
  const row = rows[0];
  if (!row) throw new VocabularyEditError(404, 'Not found.');
  return { title: row.title };
}

export async function writeNailAxis(
  user: AuthenticatedUser,
  axis: string,
  title: VocabularyTranslation,
): Promise<{ created: boolean }> {
  return write(async (client) => {
    const created = await missingKey(client, `select key from variation_axes where key = $1`, axis);
    await client.query(
      `insert into variation_axes (key, title) values ($1, $2)
       on conflict (key) do update set title = excluded.title`,
      [axis, title],
    );
    await journal(
      client,
      user,
      'catalogue.vocabulary.update',
      `Axe ${axis}: ${created ? 'créé' : 'mis à jour'}`,
      `axis:${axis}`,
    );
    return { created };
  });
}

export async function deleteNailAxis(user: AuthenticatedUser, axis: string): Promise<boolean> {
  return remove(
    user,
    `delete from variation_axes where key = $1`,
    axis,
    `Axe ${axis}: retiré`,
    `axis:${axis}`,
  );
}

export async function readNailOption(axis: string, option: string): Promise<VocabularyTranslation> {
  const { rows } = await pool.query<{ title: VocabularyTranslation }>(
    `select title from variation_options where axis_key = $1 and option_key = $2`,
    [axis, option],
  );
  const row = rows[0];
  if (!row) throw new VocabularyEditError(404, 'Not found.');
  return row.title;
}

export async function writeNailOption(
  user: AuthenticatedUser,
  axis: string,
  option: string,
  title: VocabularyTranslation,
): Promise<{ created: boolean }> {
  return write(async (client) => {
    const axisRow = await client.query(`select key from variation_axes where key = $1`, [axis]);
    if (axisRow.rowCount !== 1) throw new VocabularyEditError(404, 'Create the axis first.');
    const created = await missingKey(
      client,
      `select option_key from variation_options where axis_key = $1 and option_key = $2`,
      axis,
      option,
    );
    await client.query(
      `insert into variation_options (axis_key, option_key, title, sort_order)
       select $1, $2, $3, coalesce(max(sort_order) + 1, 0) from variation_options where axis_key = $1
       on conflict (axis_key, option_key) do update set title = excluded.title`,
      [axis, option, title],
    );
    await journal(
      client,
      user,
      'catalogue.vocabulary.update',
      `Option ${axis}.${option}: ${created ? 'créée' : 'mise à jour'}`,
      `option:${axis}.${option}`,
    );
    return { created };
  });
}

export async function deleteNailOption(user: AuthenticatedUser, axis: string, option: string): Promise<boolean> {
  return write(async (client) => {
    const deleted = await client.query(
      `delete from variation_options where axis_key = $1 and option_key = $2`,
      [axis, option],
    );
    if (deleted.rowCount !== 1) return false;
    await journal(
      client,
      user,
      'catalogue.vocabulary.delete',
      `Option ${axis}.${option}: retirée`,
      `option:${axis}.${option}`,
    );
    return true;
  });
}

async function missingKey(client: pg.PoolClient, sql: string, ...params: string[]): Promise<boolean> {
  const existing = await client.query(sql, params);
  return existing.rowCount !== 1;
}

async function journal(
  client: pg.PoolClient,
  user: AuthenticatedUser,
  action: 'catalogue.vocabulary.update' | 'catalogue.vocabulary.delete',
  summary: string,
  targetId: string,
): Promise<void> {
  await recordAdminActivity(client, user, {
    category: 'catalogue',
    action,
    summary,
    targetType: 'vocabulary',
    targetId,
  });
}

async function write<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(pool, work);
  } catch (error) {
    if (error instanceof VocabularyEditError) throw error;
    if (isPg(error, '23503')) {
      throw new VocabularyEditError(409, 'This entry is still used by a product.');
    }
    throw error;
  }
}

async function remove(
  user: AuthenticatedUser,
  sql: string,
  key: string,
  summary: string,
  targetId: string,
): Promise<boolean> {
  return write(async (client) => {
    const deleted = await client.query(sql, [key]);
    if (deleted.rowCount !== 1) return false;
    await journal(client, user, 'catalogue.vocabulary.delete', summary, targetId);
    return true;
  });
}

function isPg(error: unknown, code: string): boolean {
  return !!error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === code;
}
