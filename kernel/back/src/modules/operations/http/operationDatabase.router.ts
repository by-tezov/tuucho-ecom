import { Router } from 'express';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from '../../../config/env.js';
import { packageVersion } from '../../../config/appVersion.js';
import { pool } from '../../../db/pool.js';
import { resetPublicSchema } from '../../../db/resetPublicSchema.js';
import {
  backupDirectory,
  createBackup,
  listBackups,
  preflight,
  pruneBackups,
  restoreBackup,
  RestoreRefused,
  verifyArchive,
  type BackupContext,
} from '../infrastructure/databaseBackup.js';
import { backfillGuestEmailLookups } from '../../orders/application/ordersFacade.js';
import { callPluginMethod } from '../../plugins/application/pluginBridges.js';
import { backfillUserIdentityEvents } from '../../identity/application/identityHistory.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const operationDatabaseRouter = Router();

const moduleDir = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(moduleDir, '..', '..', '..', 'db', 'migrations');

/** Kept to 3 on the host: a snapshot carries the whole media tree, and this
 * runs on shared hosting. */
const DEFAULT_BACKUP_KEEP = 3;

/** Running release version from root `package.json` (or the dist copy that
 * build injects). Recorded in every archive; reported, never enforced, at
 * restore. */
function backupContext(): BackupContext {
  return { pool, databaseUrl: config.databaseUrl, migrationsDir, appVersion: packageVersion };
}

/** No SSH on this LWS plan, so migrations run over HTTP instead of a CLI
 * command — see README "Deploying". Safe to leave deployed permanently:
 * the ops surface is OPS_TOKEN-gated at its mount point, and this route is a
 * no-op when nothing's pending. It only ever applies forward,
 * already-written migrations rather than performing an ad-hoc destructive
 * action. */
operationDatabaseRouter.post('/database-migrate', async (_req, res) => {
  try {
    const applied = await runner({
      databaseUrl: config.databaseUrl,
      dir: migrationsDir,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      // A database migrated before a squash still lists the deleted
      // intermediate names. Default checkOrder compares those lists by index
      // and refuses to apply anything newer. getMigrationsToRun still skips
      // names already in pgmigrations.
      checkOrder: false,
    });
    // orders.guest_email_lookup is an HMAC of the plaintext address, so
    // it cannot be backfilled in SQL (no pgcrypto on LWS). Doing it here
    // keeps "apply the schema" a single deploy step; it is a no-op once
    // every guest order has one.
    const guestEmailLookupsBackfilled = await backfillGuestEmailLookups(pool);
    const contactEmailLookupsBackfilled = Number(
      (await callPluginMethod('backfillUnconnectedContactEmailLookups', pool)) ?? 0,
    );
    const identityEventsBackfilled = await backfillUserIdentityEvents(pool);
    const appliedNames = applied.map((migration) => migration.name);
    await recordOperatorActivityBestEffort(pool, {
      category: 'operations',
      action: 'database.migrate',
      summary:
        appliedNames.length === 0
          ? 'Migration: aucun changement'
          : `Migration: ${appliedNames.length} appliquee(s)`,
      detail: {
        applied: appliedNames,
        guestEmailLookupsBackfilled,
        contactEmailLookupsBackfilled,
        identityEventsBackfilled,
      },
    });
    res.json({
      success: true,
      applied: appliedNames,
      guestEmailLookupsBackfilled,
      contactEmailLookupsBackfilled,
      identityEventsBackfilled,
    });
  } catch (error) {
    console.error('[operation] database-migrate failed', error);
    const message = error instanceof Error ? error.message : 'internal_error';
    res.status(500).json({ success: false, error: message });
  }
});

/** Empties `public` (tables, sequences, functions, `pgmigrations`, …) so the
 * next `database-migrate` rebuilds everything from the migrations. Uses `DROP SCHEMA` when allowed; on managed Postgres where the
 * app role does not own `public` (LWS), drops objects inside the schema
 * instead. Destructive: requires `{"confirm":true}`, and the CLI additionally
 * requires `--confirm` when targeting --prod. */
operationDatabaseRouter.post('/database-reset', async (req, res) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ success: false, error: { code: 'confirm_required' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    const mode = await resetPublicSchema(client);
    await client.query('commit');
    await recordOperatorActivityBestEffort(pool, {
      category: 'operations',
      action: 'database.reset',
      summary: 'Reinitialisation du schema public',
      detail: { mode },
    });
    res.json({
      success: true,
      reset: true,
      mode,
      message: 'public schema emptied — run database-migrate next',
    });
  } catch (error) {
    await client.query('rollback');
    console.error('[operation] database-reset failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  } finally {
    client.release();
  }
});

/** Whole-target snapshot: every `public` table's rows plus every media tree
 * (product photos, invoices, shipping labels, contact/chat attachments) in
 * one `.tar` under PRIVATE_BACKUP_DIR. Media is never optional — rows hold
 * relative paths, so a database restored without its files is broken.
 * Rotation runs straight after: only `keep` archives survive. */
operationDatabaseRouter.post('/database-backup', async (req, res) => {
  try {
    const backup = await createBackup(backupContext());
    const requestedKeep = Number(req.body?.keep ?? DEFAULT_BACKUP_KEEP);
    const keep =
      Number.isSafeInteger(requestedKeep) && requestedKeep > 0 ? requestedKeep : DEFAULT_BACKUP_KEEP;
    const pruned = await pruneBackups(keep);
    await recordOperatorActivityBestEffort(pool, {
      category: 'operations',
      action: 'database.backup',
      summary: `Sauvegarde base ${backup.id}`,
      targetType: 'backup',
      targetId: backup.id,
      detail: { backup, pruned, keep },
    });
    res.json({ success: true, backup, pruned });
  } catch (error) {
    console.error('[operation] database-backup failed', error);
    res
      .status(500)
      .json({ success: false, error: error instanceof Error ? error.message : 'internal_error' });
  }
});

operationDatabaseRouter.get('/database-backup', async (_req, res) => {
  try {
    // `directory` is what lets the CLI push a local archive back up without
    // having to know the target's PRIVATE_DIR layout.
    res.json({ success: true, directory: backupDirectory(), backups: await listBackups() });
  } catch (error) {
    console.error('[operation] database-backup list failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

operationDatabaseRouter.post('/database-backup/prune', async (req, res) => {
  const requested = Number(req.body?.keep ?? DEFAULT_BACKUP_KEEP);
  if (!Number.isSafeInteger(requested) || requested < 1) {
    res.status(400).json({ success: false, error: { code: 'invalid_keep' } });
    return;
  }
  try {
    res.json({ success: true, pruned: await pruneBackups(requested) });
  } catch (error) {
    console.error('[operation] database-backup prune failed', error);
    res.status(500).json({ success: false, error: { code: 'internal_error' } });
  }
});

/** Read-only verdict: reads the archive's own manifest and runs the version
 * gate against this release, without touching the database. What
 * `database-restore --dry-run` calls. */
operationDatabaseRouter.get('/database-backup/:id/verify', async (req, res) => {
  try {
    const { entries, manifest } = await verifyArchive(String(req.params.id));
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const verdict = await preflight(manifest, backupContext(), { fromMode: from });
    res.json({ success: true, entries, manifest, verdict });
  } catch (error) {
    console.error('[operation] database-backup verify failed', error);
    res.status(404).json({ success: false, error: error instanceof Error ? error.message : 'not_found' });
  }
});

/** Restores one archive, end to end, with nothing to prepare beforehand:
 * version gate, `public` emptied, migrated to exactly the archive's head,
 * rows loaded, migrated forward to this release, media trees mirrored.
 *
 * The version gate is the normal refusal path: the archive's migration list
 * must be a prefix of this release's, checksums included. Anything else
 * (a newer archive, a rewritten migration) is refused rather than guessed at,
 * because there are no down migrations to walk back with — unless
 * `bypassPreflight: true`, which the operator uses at their own risk (e.g.
 * after squashing migrations into a single init). Same door as
 * database-reset: `{"confirm":true}` here, `--confirm` on --prod in the CLI. */
operationDatabaseRouter.post('/database-restore', async (req, res) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ success: false, error: { code: 'confirm_required' } });
    return;
  }
  const id = typeof req.body?.id === 'string' ? req.body.id : '';
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'id_required' } });
    return;
  }
  const fromMode = typeof req.body?.from === 'string' ? req.body.from : undefined;
  const bypassPreflight = req.body?.bypassPreflight === true;
  try {
    const report = await restoreBackup(id, backupContext(), { fromMode, bypassPreflight });
    await recordOperatorActivityBestEffort(pool, {
      category: 'operations',
      action: 'database.restore',
      summary: `Restauration base ${id}`,
      targetType: 'backup',
      targetId: id,
      detail: { fromMode: fromMode ?? null, bypassPreflight, report },
    });
    res.json({ success: true, report });
  } catch (error) {
    if (error instanceof RestoreRefused) {
      res.status(409).json({ success: false, error: error.message });
      return;
    }
    console.error('[operation] database-restore failed', error);
    res
      .status(500)
      .json({ success: false, error: error instanceof Error ? error.message : 'internal_error' });
  }
});
