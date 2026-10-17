import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';
import { pool } from '../../../db/pool.js';
import type { PluginManifest } from '../domain/contracts.js';
import { pluginPackageDir } from './discoverPlugins.js';

const requireFromHere = createRequire(import.meta.url);

const MIGRATION_FILE = /^\d{3,}[_-][a-z0-9][a-z0-9_-]*\.js$/;

const TABLE_MUTATION =
  /\b(?:create|alter|drop)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)/gi;
const ROW_MUTATION =
  /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)/gi;

export type PluginMigrationFn = (client: pg.PoolClient) => Promise<void> | void;

export type PluginMigrationModule = {
  up?: PluginMigrationFn;
  down?: PluginMigrationFn;
};

export function pluginTablePrefix(pluginId: string): string {
  return `plugin_${pluginId.replace(/-/g, '_')}_`;
}

export function pluginMigrationsDir(manifest: Pick<PluginManifest, 'id' | 'sourceDir'>): string {
  return join(pluginPackageDir(manifest), 'back/migrations');
}

export function assertPluginMigrationSql(pluginId: string, sql: string): void {
  const prefix = pluginTablePrefix(pluginId);
  const names = new Set<string>();
  for (const pattern of [TABLE_MUTATION, ROW_MUTATION]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sql))) {
      names.add(match[1]!.toLowerCase());
    }
  }
  for (const name of names) {
    if (!name.startsWith(prefix)) {
      throw new Error(
        `plugin ${pluginId} may only create, drop or mutate tables named ${prefix}… (got ${name})`,
      );
    }
  }
}

function guardedClient(pluginId: string, client: pg.PoolClient): pg.PoolClient {
  return {
    query: (queryText: unknown, values?: unknown) => {
      if (typeof queryText === 'string') assertPluginMigrationSql(pluginId, queryText);
      return client.query(queryText as string, values as never);
    },
  } as pg.PoolClient;
}

export async function listPluginMigrationFiles(dir: string): Promise<string[]> {
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return names.filter((name) => MIGRATION_FILE.test(name)).sort((a, b) => a.localeCompare(b));
}

export function loadPluginMigration(filePath: string): PluginMigrationModule {
  return requireFromHere(filePath) as PluginMigrationModule;
}

/** Host bookkeeping table. Plural `plugins_` so it cannot collide with
 * plugin-owned tables `plugin_<id>_…`. */
async function appliedNames(db: pg.Pool | pg.PoolClient, pluginId: string): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `select name from plugins_schema_migrations where plugin_id = $1 order by name`,
    [pluginId],
  );
  return rows.map((row) => row.name);
}

export async function applyPluginMigrations(
  manifest: PluginManifest,
  db: pg.Pool = pool,
): Promise<{ applied: string[] }> {
  const dir = pluginMigrationsDir(manifest);
  const files = await listPluginMigrationFiles(dir);
  if (files.length === 0) {
    await db.query(`update plugins set schema_version = $2, updated_at = now() where id = $1`, [
      manifest.id,
      manifest.version,
    ]);
    return { applied: [] };
  }
  const already = new Set(await appliedNames(db, manifest.id));
  const pending = files.filter((name) => !already.has(name));
  const applied: string[] = [];
  const client = await db.connect();
  try {
    await client.query('begin');
    for (const name of pending) {
      const mod = loadPluginMigration(join(dir, name));
      if (typeof mod.up !== 'function') throw new Error(`plugin ${manifest.id} migration ${name} has no up()`);
      await mod.up(guardedClient(manifest.id, client));
      await client.query(
        `insert into plugins_schema_migrations (plugin_id, name) values ($1, $2)
         on conflict (plugin_id, name) do nothing`,
        [manifest.id, name],
      );
      applied.push(name);
    }
    await client.query(`update plugins set schema_version = $2, updated_at = now() where id = $1`, [
      manifest.id,
      manifest.version,
    ]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
  return { applied };
}

async function dropLeftoverPluginTables(client: pg.PoolClient, pluginId: string): Promise<string[]> {
  const prefix = pluginTablePrefix(pluginId);
  const { rows } = await client.query<{ table_name: string }>(
    `select table_name
       from information_schema.tables
      where table_schema = 'public' and table_name like $1
      order by table_name`,
    [`${prefix}%`],
  );
  const dropped: string[] = [];
  for (const row of rows) {
    const name = row.table_name;
    if (!name.startsWith(prefix)) continue;
    await client.query(`drop table if exists ${quoteIdent(name)} cascade`);
    dropped.push(name);
  }
  return dropped;
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`invalid table name ${name}`);
  return `"${name}"`;
}

export async function revertPluginMigrations(
  pluginId: string,
  manifest: PluginManifest | undefined,
  db: pg.Pool = pool,
): Promise<{ reverted: string[]; dropped: string[] }> {
  const files = manifest ? await listPluginMigrationFiles(pluginMigrationsDir(manifest)) : [];
  const applied = await appliedNames(db, pluginId);
  const reverted: string[] = [];
  const client = await db.connect();
  try {
    await client.query('begin');
    const toRevert = [...applied].reverse();
    for (const name of toRevert) {
      if (manifest && files.includes(name)) {
        const mod = loadPluginMigration(join(pluginMigrationsDir(manifest), name));
        if (typeof mod.down !== 'function') {
          throw new Error(`plugin ${pluginId} migration ${name} has no down()`);
        }
        await mod.down(guardedClient(pluginId, client));
      }
      await client.query(`delete from plugins_schema_migrations where plugin_id = $1 and name = $2`, [
        pluginId,
        name,
      ]);
      reverted.push(name);
    }
    const dropped = await dropLeftoverPluginTables(client, pluginId);
    await client.query(`delete from plugins_schema_migrations where plugin_id = $1`, [pluginId]);
    await client.query(`delete from plugins where id = $1`, [pluginId]);
    await client.query('commit');
    return { reverted, dropped };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
