/** Whole-target backup and restore: every `public` table's data plus every
 * media tree the database points at, in one archive.
 *
 * Why data-only rather than a schema dump: `src/db/migrations/` already
 * reproduces the schema exactly, so an archive only has to carry the rows and
 * the migration head they belong to. That also makes the version check
 * natural — the head recorded in the archive is the contract, and a restore
 * refuses whenever the running code's migration list is not a superset of it.
 * No `pg_dump` binary is required, so this behaves identically on the LWS
 * host and on a local Docker Postgres.
 *
 * Media is part of the unit, never optional: rows store relative paths, so a
 * database restored without its files leaves every product photo, invoice and
 * shipping label dangling.
 */
import { createHash, createHmac } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { runner } from 'node-pg-migrate';
import type { Pool, PoolClient } from 'pg';
import { config } from '../../../config/env.js';
import { resetPublicSchema } from '../../../db/resetPublicSchema.js';
import { withTransaction } from '../../../platform/db/transaction.js';
import {
  extractTarEntry,
  listTarEntries,
  readTarEntry,
  TarWriter,
  type TarEntry,
} from '../../../utils/tar.js';

const BACKUP_FORMAT_VERSION = 1;

/** dist/ and src/ lay out differently, so the caller passes its own resolved
 * migrations directory rather than having this module guess one.
 *
 * `databaseUrl` is explicit rather than read from config here: node-pg-migrate
 * opens its own connection, and it must be the same database as `pool` — which
 * a test harness, unlike the route, does not point at config.databaseUrl. */
export type BackupContext = { pool: Pool; databaseUrl: string; migrationsDir: string; appVersion: string };

/** Archive key → live directory. The key is what the archive stores, so an
 * environment whose PRIVATE_DIR differs still restores into the right place. */
function mediaRoots(): Record<string, string> {
  return {
    public: config.mediaDir,
    invoice: config.invoiceDir,
    shipment_label: config.shipmentLabelDir,
    contact: config.contactMediaDir,
    chat: config.chatMediaDir,
  };
}

export type MigrationRef = { name: string; sha256: string };

export type BackupManifest = {
  formatVersion: number;
  id: string;
  createdAt: string;
  mode: string;
  appVersion: string;
  migrationHead: string | null;
  migrations: MigrationRef[];
  postgres: string;
  piiKeyFingerprint: string;
  /** Present on archives taken after pepper was folded into the gate. Absent
   * on older tars — those only checked `PII_ENCRYPTION_KEY`. */
  piiPepperFingerprint?: string;
  tables: { name: string; rows: number }[];
  sequences: { name: string; lastValue: string; isCalled: boolean }[];
  media: { fileCount: number; bytes: number };
};

export type BackupSummary = {
  id: string;
  path: string;
  pathFromHome: string | null;
  bytes: number;
  manifest: BackupManifest;
};

function archiveName(id: string): string {
  return `${id}.tar`;
}

export function archivePath(id: string): string {
  return join(config.backupDir, archiveName(id));
}

function manifestSidecarPath(id: string): string {
  return join(config.backupDir, `${id}.manifest.json`);
}

/** `/home/<user>/...` → `...`, so the CLI can hand the path straight to an FTP
 * client, whose login root is the account home. Null when it sits elsewhere.
 *
 * Prefer `os.homedir()` over `process.env.HOME`: the FTP ops gateway starts
 * Node under Apache, which does not export HOME (see ops-gateway.php).
 * `homedir()` still resolves via the passwd entry for the running uid. */
function pathFromHome(absolute: string): string | null {
  const home = resolve(homedir());
  const abs = resolve(absolute);
  const rel = relative(home, abs);
  // Different-drive / unresolved absolute on some platforms returns the abs path.
  if (rel.startsWith('..') || rel === abs) return null;
  return rel;
}

/** Where archives live on this target, in both forms the CLI needs: absolute
 * for display, home-relative for FTP/scp, whose root is the account home. */
export function backupDirectory(): { path: string; pathFromHome: string | null } {
  return { path: config.backupDir, pathFromHome: pathFromHome(config.backupDir) };
}

function backupId(mode: string, appVersion: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  return `tuucho-${mode}-${stamp}-v${appVersion}`;
}

/** Same value on every target that shares PII_ENCRYPTION_KEY, and different
 * as soon as it is rotated — restoring rows encrypted under a retired key
 * would silently yield unreadable names, emails and addresses. */
function piiKeyFingerprint(): string {
  return createHmac('sha256', config.pii.encryptionKey)
    .update('kernel/backup-key-check')
    .digest('hex')
    .slice(0, 16);
}

/** Blind-index pepper: email/login lookups break if this differs, even when
 * AES decryption would still succeed. */
function piiPepperFingerprint(): string {
  return createHmac('sha256', config.pii.lookupPepper)
    .update('kernel/backup-pepper-check')
    .digest('hex')
    .slice(0, 16);
}

/** PII gate — never covered by `--bypass-preflight`. Wrong keys leave every
 * encrypted column and every email_lookup unusable (sign-in, user list, …). */
function assertPiiCompatible(manifest: BackupManifest): void {
  if (manifest.piiKeyFingerprint !== piiKeyFingerprint()) {
    throw new RestoreRefused(
      'PII_ENCRYPTION_KEY differs from the one in use when the archive was taken — every encrypted column would restore as unreadable ciphertext',
    );
  }
  if (manifest.piiPepperFingerprint && manifest.piiPepperFingerprint !== piiPepperFingerprint()) {
    throw new RestoreRefused(
      'PII_LOOKUP_PEPPER differs from the one in use when the archive was taken — email/login lookups would not match restored rows',
    );
  }
}

async function localMigrations(dir: string): Promise<MigrationRef[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.js')).sort();
  const refs: MigrationRef[] = [];
  for (const file of files) {
    const content = await readFile(join(dir, file));
    refs.push({
      name: file.replace(/\.js$/, ''),
      sha256: createHash('sha256').update(content).digest('hex'),
    });
  }
  return refs;
}

async function appliedMigrations(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(`select name from pgmigrations order by id`);
  return rows.map((row) => row.name);
}

type ColumnRef = { name: string; type: string };

/** `pg_attribute.attgenerated` exists only on PostgreSQL ≥ 12. LWS managed
 * preprod/prod is still on v10 (see docs/schema/00-overview.md), so the
 * filter must be omitted there — referencing the column fails at parse time
 * even inside an OR with a version guard. */
async function postgresMajorAtLeast(client: PoolClient, major: number): Promise<boolean> {
  const { rows } = await client.query<{ n: string }>(`select current_setting('server_version_num') as n`);
  return Number(rows[0]?.n ?? '0') >= major * 10000;
}

async function tableColumns(
  client: PoolClient,
  table: string,
  excludeGenerated: boolean,
): Promise<ColumnRef[]> {
  const generatedFilter = excludeGenerated ? `and a.attgenerated = ''` : '';
  const { rows } = await client.query<{ name: string; type: string }>(
    `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
       from pg_attribute a
      where a.attrelid = $1::regclass
        and a.attnum > 0
        and not a.attisdropped
        ${generatedFilter}
      order by a.attnum`,
    [`public.${quoteIdentifier(table)}`],
  );
  return rows;
}

async function baseTables(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ name: string }>(
    `select c.relname as name
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`,
  );
  return rows.map((row) => row.name);
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function sequenceState(
  client: PoolClient,
): Promise<{ name: string; lastValue: string; isCalled: boolean }[]> {
  // pg_sequences.last_value is null until the sequence has actually been
  // drawn from; such a sequence needs no setval at restore.
  const { rows } = await client.query<{ name: string; last_value: string | null }>(
    `select sequencename as name, last_value
       from pg_sequences where schemaname = 'public' order by sequencename`,
  );
  return rows
    .filter((row) => row.last_value !== null)
    .map((row) => ({ name: row.name, lastValue: String(row.last_value), isCalled: true }));
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}

// --- create ---------------------------------------------------------------

export async function createBackup(context: BackupContext): Promise<BackupSummary> {
  await mkdir(config.backupDir, { recursive: true });
  const now = new Date();
  const id = backupId(config.target, context.appVersion, now);
  const target = archivePath(id);
  const staging = join(config.backupDir, `.staging-${id}`);
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });

  const client = await context.pool.connect();
  const dataFiles: { path: string; file: string }[] = [];
  let manifest: BackupManifest;
  try {
    // One snapshot for the whole dump: tables read here are mutually
    // consistent even while the shop keeps taking orders.
    await client.query('begin isolation level repeatable read read only');
    await client.query(`set local timezone = 'UTC'`);
    await client.query(`set local datestyle = 'ISO, MDY'`);

    const applied = await appliedMigrations(client);
    const local = await localMigrations(context.migrationsDir);
    const localByName = new Map(local.map((entry) => [entry.name, entry.sha256]));
    const tables = await baseTables(client);
    const excludeGenerated = await postgresMajorAtLeast(client, 12);
    const tableCounts: { name: string; rows: number }[] = [];

    for (const table of tables) {
      const columns = await tableColumns(client, table, excludeGenerated);
      const file = join(staging, `${table}.jsonl`);
      const rows = await dumpTable(client, table, columns, file);
      tableCounts.push({ name: table, rows });
      dataFiles.push({ path: `data/${table}.jsonl.gz`, file: `${file}.gz` });
      await writeFile(`${file}.gz`, gzipSync(await readFile(file)));
      await rm(file, { force: true });
      await writeFile(join(staging, `${table}.columns.json`), JSON.stringify(columns));
      dataFiles.push({ path: `data/${table}.columns.json`, file: join(staging, `${table}.columns.json`) });
    }

    const { rows: versionRows } = await client.query<{ version: string }>(`select version() as version`);
    manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      id,
      createdAt: now.toISOString(),
      mode: config.target,
      appVersion: context.appVersion,
      migrationHead: applied.at(-1) ?? null,
      migrations: applied.map((name) => ({ name, sha256: localByName.get(name) ?? '' })),
      postgres: versionRows[0]?.version ?? 'unknown',
      piiKeyFingerprint: piiKeyFingerprint(),
      piiPepperFingerprint: piiPepperFingerprint(),
      tables: tableCounts,
      sequences: await sequenceState(client),
      media: { fileCount: 0, bytes: 0 },
    };
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    client.release();
  }

  // Media is walked outside the DB snapshot: files are only ever added under a
  // new name, so the worst case is an extra file that no restored row points
  // at — harmless, unlike a missing one.
  const media: { path: string; file: string }[] = [];
  for (const [key, root] of Object.entries(mediaRoots())) {
    const resolvedRoot = resolve(root);
    if (resolvedRoot === resolve(config.backupDir)) continue;
    for await (const file of walkFiles(resolvedRoot)) {
      media.push({ path: `media/${key}/${relative(resolvedRoot, file).split('\\').join('/')}`, file });
      manifest.media.fileCount += 1;
      manifest.media.bytes += (await stat(file)).size;
    }
  }

  const writer = new TarWriter(target);
  try {
    // Manifest first: a restore reads it and decides before touching anything.
    await writer.addBuffer('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), now);
    for (const entry of dataFiles) await writer.addFile(entry.path, entry.file);
    for (const entry of media) await writer.addFile(entry.path, entry.file);
    await writer.close();
  } catch (error) {
    await rm(target, { force: true });
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  await rm(staging, { recursive: true, force: true });
  await writeFile(manifestSidecarPath(id), JSON.stringify(manifest, null, 2));

  return {
    id,
    path: target,
    pathFromHome: pathFromHome(target),
    bytes: (await stat(target)).size,
    manifest,
  };
}

/** Every value goes out as Postgres' own text representation, so restoring is
 * the exact inverse cast — no JS type mapping to get wrong for numeric,
 * bytea, arrays, jsonb or timestamptz. */
async function dumpTable(
  client: PoolClient,
  table: string,
  columns: ColumnRef[],
  file: string,
): Promise<number> {
  if (columns.length === 0) {
    await writeFile(file, '');
    return 0;
  }
  const selection = columns.map((column) => `${quoteIdentifier(column.name)}::text`).join(', ');
  const cursor = `backup_${createHash('sha1').update(table).digest('hex').slice(0, 16)}`;
  await client.query(
    `declare ${cursor} cursor for select ${selection} from public.${quoteIdentifier(table)}`,
  );
  const chunks: string[] = [];
  let count = 0;
  try {
    for (;;) {
      const { rows } = await client.query<(string | null)[]>({
        text: `fetch 2000 from ${cursor}`,
        rowMode: 'array',
        values: [],
      });
      if (rows.length === 0) break;
      for (const row of rows) chunks.push(`${JSON.stringify(row)}\n`);
      count += rows.length;
      if (chunks.length >= 2000) {
        await writeFile(file, chunks.join(''), { flag: 'a' });
        chunks.length = 0;
      }
    }
  } finally {
    await client.query(`close ${cursor}`).catch(() => undefined);
  }
  await writeFile(file, chunks.join(''), { flag: 'a' });
  return count;
}

// --- list / prune ---------------------------------------------------------

export async function listBackups(): Promise<BackupSummary[]> {
  await mkdir(config.backupDir, { recursive: true });
  const names = (await readdir(config.backupDir))
    .filter((name) => name.endsWith('.tar'))
    .sort()
    .reverse();
  const summaries: BackupSummary[] = [];
  for (const name of names) {
    const id = name.replace(/\.tar$/, '');
    const manifest = await readManifest(id).catch(() => undefined);
    if (!manifest) continue;
    summaries.push({
      id,
      path: archivePath(id),
      pathFromHome: pathFromHome(archivePath(id)),
      bytes: (await stat(archivePath(id))).size,
      manifest,
    });
  }
  return summaries;
}

/** The sidecar is only a listing convenience; the copy inside the archive is
 * the one a restore trusts. */
async function readManifest(id: string): Promise<BackupManifest> {
  try {
    return JSON.parse(await readFile(manifestSidecarPath(id), 'utf8')) as BackupManifest;
  } catch {
    return readArchiveManifest(archivePath(id));
  }
}

async function readArchiveManifest(archive: string): Promise<BackupManifest> {
  const entries = await listTarEntries(archive);
  const entry = entries.find((candidate) => candidate.path === 'manifest.json');
  if (!entry) throw new Error('archive has no manifest.json');
  return JSON.parse((await readTarEntry(archive, entry)).toString('utf8')) as BackupManifest;
}

export async function pruneBackups(keep: number): Promise<string[]> {
  const kept = Math.max(1, Math.trunc(keep));
  const backups = await listBackups();
  const removed: string[] = [];
  for (const backup of backups.slice(kept)) {
    await rm(backup.path, { force: true });
    await rm(manifestSidecarPath(backup.id), { force: true });
    removed.push(backup.id);
  }
  return removed;
}

// --- version gate ---------------------------------------------------------

export type Preflight =
  { ok: true; rollForward: string[]; warnings: string[] } | { ok: false; reason: string };

/** The whole point of the feature: an archive may only be restored into code
 * whose migration list starts with the archive's own, file checksums
 * included. Equal heads restore as-is; an older archive restores and then
 * migrates forward; anything else is refused, because there are no down
 * migrations to walk back with.
 *
 * Refusals are collected so `--bypass-preflight` / verify print every gate
 * that failed (mode + squash + …), not only the first. PII key mismatch is
 * reported here too, and is additionally enforced in `restoreBackup` even
 * when bypass is set. */
export async function preflight(
  manifest: BackupManifest,
  context: { migrationsDir: string; appVersion: string },
  options: { fromMode?: string } = {},
): Promise<Preflight> {
  const refusals: string[] = [];
  const warnings: string[] = [];

  if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    refusals.push(`unknown archive format ${manifest.formatVersion} (expected ${BACKUP_FORMAT_VERSION})`);
  }
  if (manifest.mode !== config.target && options.fromMode !== manifest.mode) {
    refusals.push(
      `archive was taken on "${manifest.mode}" and this target is "${config.target}" — pass --from ${manifest.mode} to restore across environments`,
    );
  }

  const local = await localMigrations(context.migrationsDir);
  const backup = manifest.migrations;
  let rollForward: string[] = [];
  if (backup.length > local.length) {
    refusals.push(
      `archive is newer than this release: it holds ${backup.length} migrations, this code has ${local.length}. Deploy the matching version first (its head is "${manifest.migrationHead}") — there are no down migrations to roll back with.`,
    );
  } else {
    for (let index = 0; index < backup.length; index += 1) {
      const archived = backup[index];
      const current = local[index];
      if (!current || archived?.name !== current.name) {
        refusals.push(
          `divergent migration history at position ${index + 1}: archive has "${archived?.name}", this code has "${current?.name ?? '(nothing)'}"`,
        );
        break;
      }
      if (archived.sha256 && archived.sha256 !== current.sha256) {
        refusals.push(
          `migration "${archived.name}" was modified after the archive was taken (checksum mismatch) — the archive's rows may not match what that file now builds`,
        );
        break;
      }
    }
    rollForward = local.slice(backup.length).map((entry) => entry.name);
  }

  if (manifest.piiKeyFingerprint !== piiKeyFingerprint()) {
    refusals.push(
      'PII_ENCRYPTION_KEY differs from the one in use when the archive was taken — every encrypted column would restore as unreadable ciphertext',
    );
  }
  if (manifest.piiPepperFingerprint && manifest.piiPepperFingerprint !== piiPepperFingerprint()) {
    refusals.push(
      'PII_LOOKUP_PEPPER differs from the one in use when the archive was taken — email/login lookups would not match restored rows',
    );
  } else if (!manifest.piiPepperFingerprint) {
    warnings.push(
      'archive has no PII_LOOKUP_PEPPER fingerprint (taken before that gate) — ensure the target pepper matches the source by hand',
    );
  }

  if (manifest.appVersion !== context.appVersion) {
    warnings.push(
      `archive was taken on app version ${manifest.appVersion}, this release is ${context.appVersion} (schema matches, so this is informational)`,
    );
  }

  if (refusals.length > 0) {
    return { ok: false, reason: refusals.join(' | ') };
  }
  return { ok: true, rollForward, warnings };
}

// --- restore --------------------------------------------------------------

export type RestoreReport = {
  id: string;
  tables: { name: string; rows: number }[];
  rolledForward: string[];
  media: { restored: number; bytes: number };
  warnings: string[];
};

export async function restoreBackup(
  id: string,
  context: BackupContext,
  options: { fromMode?: string; bypassPreflight?: boolean } = {},
): Promise<RestoreReport> {
  const archive = archivePath(id);
  await stat(archive);
  const manifest = await readArchiveManifest(archive);
  // Wrong PII keys are never operator-bypassable: rows would load and look
  // fine in counts, then every sign-in / user list / order view would 500.
  assertPiiCompatible(manifest);
  const check = await preflight(manifest, context, options);
  const warnings: string[] = [];
  if (!check.ok) {
    if (!options.bypassPreflight) throw new RestoreRefused(check.reason);
    // Operator explicitly accepted an incompatible archive (e.g. after a
    // migration squash). Schema fitness is on them — we still migrate to this
    // release's full head before loading rows. PII was already asserted above.
    warnings.push(`preflight bypassed: ${check.reason}`);
  } else {
    warnings.push(...check.warnings);
  }

  const entries = await listTarEntries(archive);
  const dataEntries = new Map(
    entries.filter((entry) => entry.path.startsWith('data/')).map((entry) => [entry.path, entry]),
  );

  await withTransaction(context.pool, (client) => resetPublicSchema(client));

  const rolledForward: string[] = [];
  if (options.bypassPreflight && !check.ok) {
    // Bring the empty DB to the running release's schema in one shot, then
    // load the archive's rows into that schema. No separate roll-forward.
    const applied = await runner({
      databaseUrl: context.databaseUrl,
      dir: context.migrationsDir,
      direction: 'up',
      migrationsTable: 'pgmigrations',
    });
    rolledForward.push(...applied.map((migration) => migration.name));
  } else {
    // Migrate to exactly the archive's head, so the rows land in the schema
    // they were taken from, then roll forward to this release afterwards.
    if (manifest.migrations.length > 0) {
      await runner({
        databaseUrl: context.databaseUrl,
        dir: context.migrationsDir,
        direction: 'up',
        migrationsTable: 'pgmigrations',
        count: manifest.migrations.length,
      });
    }
  }

  const loaded = await loadData(context.pool, manifest, archive, dataEntries);

  if (check.ok && check.rollForward.length > 0) {
    const applied = await runner({
      databaseUrl: context.databaseUrl,
      dir: context.migrationsDir,
      direction: 'up',
      migrationsTable: 'pgmigrations',
    });
    rolledForward.push(...applied.map((migration) => migration.name));
  }

  const media = await restoreMedia(archive, entries);

  return { id, tables: loaded, rolledForward, media, warnings };
}

export class RestoreRefused extends Error {}

async function loadData(
  pool: Pool,
  manifest: BackupManifest,
  archive: string,
  dataEntries: Map<string, TarEntry>,
): Promise<{ name: string; rows: number }[]> {
  const loaded: { name: string; rows: number }[] = [];
  return withTransaction(pool, async (client) => {
    await client.query(`set local timezone = 'UTC'`);
    await client.query(`set local datestyle = 'ISO, MDY'`);

    // Foreign keys are dropped rather than ordered around: recreating them at
    // the end revalidates every row, which doubles as an integrity check on
    // the archive. User triggers are disabled meanwhile so the schema's own
    // guard triggers do not reject rows they already accepted once.
    const { rows: constraints } = await client.query<{ table: string; name: string; def: string }>(
      `select conrelid::regclass::text as table, conname as name, pg_get_constraintdef(oid) as def
         from pg_constraint
        where contype = 'f' and connamespace = 'public'::regnamespace`,
    );
    for (const constraint of constraints) {
      await client.query(
        `alter table ${constraint.table} drop constraint ${quoteIdentifier(constraint.name)}`,
      );
    }
    for (const table of manifest.tables) {
      await client.query(`alter table public.${quoteIdentifier(table.name)} disable trigger user`);
      // Migrations seed reference data of their own (address_countries and
      // friends), so "migrated to the archive's head" does not mean "empty".
      // The archive is the whole truth about row content — including those
      // seeds, which it captured too.
      await client.query(`truncate table public.${quoteIdentifier(table.name)}`);
    }

    for (const table of manifest.tables) {
      const columnsEntry = dataEntries.get(`data/${table.name}.columns.json`);
      const dataEntry = dataEntries.get(`data/${table.name}.jsonl.gz`);
      if (!columnsEntry || !dataEntry) throw new Error(`archive is missing data for table "${table.name}"`);
      const columns = JSON.parse((await readTarEntry(archive, columnsEntry)).toString('utf8')) as ColumnRef[];
      const rows = await insertRows(
        client,
        table.name,
        columns,
        gunzipSync(await readTarEntry(archive, dataEntry)),
      );
      if (rows !== table.rows) {
        throw new Error(`table "${table.name}": archive declares ${table.rows} rows, loaded ${rows}`);
      }
      loaded.push({ name: table.name, rows });
    }

    for (const sequence of manifest.sequences) {
      await client.query(`select setval($1, $2::bigint, $3)`, [
        `public.${sequence.name}`,
        sequence.lastValue,
        sequence.isCalled,
      ]);
    }

    for (const table of manifest.tables) {
      await client.query(`alter table public.${quoteIdentifier(table.name)} enable trigger user`);
    }
    for (const constraint of constraints) {
      await client.query(
        `alter table ${constraint.table} add constraint ${quoteIdentifier(constraint.name)} ${constraint.def}`,
      );
    }
    return loaded;
  });
}

async function insertRows(
  client: PoolClient,
  table: string,
  columns: ColumnRef[],
  payload: Buffer,
): Promise<number> {
  const lines = payload
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0);
  if (lines.length === 0 || columns.length === 0) return 0;

  const columnList = columns.map((column) => quoteIdentifier(column.name)).join(', ');
  // Postgres caps a statement at 65535 parameters; stay well under it.
  const perBatch = Math.max(1, Math.floor(20_000 / columns.length));
  let inserted = 0;

  for (let start = 0; start < lines.length; start += perBatch) {
    const batch = lines.slice(start, start + perBatch);
    const values: (string | null)[] = [];
    const tuples: string[] = [];
    for (const line of batch) {
      const row = JSON.parse(line) as (string | null)[];
      if (row.length !== columns.length) {
        throw new Error(
          `table "${table}": row has ${row.length} values, schema has ${columns.length} columns`,
        );
      }
      const placeholders = row.map((value, index) => {
        values.push(value);
        // The cast is what turns Postgres' text output back into the column's
        // own type, using the type's own input function.
        return `$${values.length}::${columns[index]?.type ?? 'text'}`;
      });
      tuples.push(`(${placeholders.join(', ')})`);
    }
    await client.query(
      `insert into public.${quoteIdentifier(table)} (${columnList}) values ${tuples.join(', ')}`,
      values,
    );
    inserted += batch.length;
  }
  return inserted;
}

/** Mirrors the archive: each media root is emptied, then refilled from the
 * archive, so files created after the backup disappear along with the rows
 * that referenced them. */
async function restoreMedia(
  archive: string,
  entries: TarEntry[],
): Promise<{ restored: number; bytes: number }> {
  const roots = mediaRoots();
  for (const root of Object.values(roots)) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }

  let restored = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (!entry.path.startsWith('media/')) continue;
    const [, key, ...rest] = entry.path.split('/');
    const root = key ? roots[key] : undefined;
    if (!root || rest.length === 0) continue;
    const target = join(root, ...rest);
    if (!resolve(target).startsWith(resolve(root))) continue;
    await extractTarEntry(archive, entry, target);
    restored += 1;
    bytes += entry.size;
  }
  return { restored, bytes };
}

/** Reads every header and the manifest without touching the database — what
 * `database-backup-verify` calls to prove an archive is intact and to print
 * the version verdict before anyone commits to a restore. */
export async function verifyArchive(id: string): Promise<{ entries: number; manifest: BackupManifest }> {
  const archive = archivePath(id);
  const entries = await listTarEntries(archive);
  return { entries: entries.length, manifest: await readArchiveManifest(archive) };
}
