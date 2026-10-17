/** OPS_TOKEN-gated CLI for /operation/* plus local secret generation.
 *
 * Usage:
 *   npm run operation -- database-migrate [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-reset [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-reset-and-seed [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup [--keep 3] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup-list [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup-verify <id> [--from <mode>] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup-fetch <id> [--out <dir>] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup-push <id-or-file> [--json] --dev|--preprod|--prod
 *   npm run operation -- database-backup-prune [--keep 3] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- database-restore <id> [--dry-run] [--from <mode>] [--bypass-preflight] [--confirm] [--json] --dev|--preprod|--prod
 *   npm run operation -- generate-key ops|jwt|db [--replace] [--json] --dev|--preprod|--prod
 *   npm run operation -- email-folder true|false [--json] --preprod
 *
 * email-folder sets the real ROUTE_EMAIL_FOLDER process env var on preprod's
 * cPanel Node app (cloudlinux-selector) and restarts it — never a DB row, so
 * a crashed preprod functional-test run can never leave mail silently
 * folder-routed with no visible trace. dev has no selector and prod ignores
 * this var by design (config/env.ts), so both return 404.
 *
 * --confirm is required on every writing command only when targeting --prod
 * (never for --dev/--preprod) — see cliCommon.ts's requireConfirmForProdWrite.
 * database-reset, database-reset-and-seed, and database-restore also
 * independently require `{"confirm":true}` server-side regardless of mode
 * (see operation.routes.ts).
 *
 * A backup is one .tar carrying the rows, the sequences, the migration head
 * they belong to, and every media tree; a restore replaces all of that in one
 * step and refuses when the archive's migration list is not a prefix of this
 * release's — unless `--bypass-preflight` (operator accepts incompatibility,
 * e.g. after squashing migrations). See docs/command/03-ops.md.
 *
 * generate-key is local-only (does not call the API / does not need OPS_TOKEN):
 * without --replace it prints secrets to stdout; with --replace it upserts
 * into `.env/<mode>/.private.env`. Never requires --confirm — it never
 * touches the target database/environment, even with --replace --prod (that
 * only rewrites a local file the operator already controls directly).
 *
 * --json: prints one JSON object to stdout instead of the human-readable
 * line, and moves the banner to stderr — safe to pipe into `jq`, a file, or
 * another script.
 */
import { Argument, Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken, upsertPrivateEnv } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, printJson } from './cliOutput.js';
import { downloadArchive, uploadArchive } from './backupTransfer.js';
import type {
  BackupManifest,
  Preflight as RestoreVerdict,
} from '../src/modules/operations/infrastructure/databaseBackup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Kept in step with the API's own default (see operation.routes.ts). */
const DEFAULT_KEEP = 3;
/** Off-host copy, alongside the order/voucher archives the manager already
 * holds. Gitignored. Shared by fetch (write) and push (read). */
const DEFAULT_LOCAL_BACKUP_DIR = '../pamsurin-manager/backup';

/** Resolve a push argument to a local `.tar`: absolute/relative path first,
 * then the same manager backup folder fetch writes to (id or id.tar). */
function resolveLocalArchive(fileOrId: string): string {
  const asGiven = resolve(fileOrId);
  if (existsSync(asGiven)) return asGiven;
  const localDir = resolve(root, DEFAULT_LOCAL_BACKUP_DIR);
  const candidates = [
    join(localDir, fileOrId),
    join(localDir, fileOrId.endsWith('.tar') ? fileOrId : `${fileOrId}.tar`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  fail(`no such archive "${fileOrId}" (looked in cwd and ${DEFAULT_LOCAL_BACKUP_DIR}/)`);
}

type DbCommand = 'database-migrate' | 'database-reset';
type DbCommandResult = { command: DbCommand; status: number; ok: boolean; body: unknown };
type KeyKind = 'ops' | 'jwt' | 'db';

const program = new Command();
program.name('operation').description('Operational CLI plus local secret generation.');
const fail: (message: string) => never = makeFail(program, 'operation');

function generateKeyValues(kind: KeyKind): Record<string, string> {
  if (kind === 'ops') return { OPS_TOKEN: randomBytes(48).toString('base64url') };
  if (kind === 'jwt') return { JWT_SECRET: randomBytes(48).toString('base64url') };
  return {
    PII_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    PII_LOOKUP_PEPPER: randomBytes(32).toString('base64'),
  };
}

type Parsed =
  | { command: DbCommand; json: boolean; mode: Mode; confirm: boolean }
  | { command: 'generate-key'; kind: KeyKind; json: boolean; mode: Mode; replace: boolean };

function runGenerateKey(args: Extract<Parsed, { command: 'generate-key' }>): void {
  const values = generateKeyValues(args.kind);
  log(
    args.json,
    `[operation] command=generate-key kind=${args.kind} mode=${args.mode} replace=${args.replace}`,
  );

  if (args.replace) {
    const { path, replaced } = upsertPrivateEnv(root, args.mode, values);
    if (replaced.length > 0) {
      if (args.kind === 'db') {
        log(
          args.json,
          'warning: replaced PII keys — any existing ciphertext encrypted with the old key is unreadable',
        );
      } else if (args.kind === 'jwt') {
        log(args.json, 'warning: replaced JWT_SECRET — existing access tokens become invalid');
      } else if (args.kind === 'ops') {
        log(
          args.json,
          'warning: replaced OPS_TOKEN — existing gateway and operations clients must be updated',
        );
      }
    }
    if (args.json) {
      printJson({
        success: true,
        command: 'generate-key',
        kind: args.kind,
        mode: args.mode,
        path,
        replaced,
        keys: Object.keys(values),
      });
    } else {
      console.log(`[operation] Wrote ${Object.keys(values).join(', ')} → ${path}`);
      if (replaced.length > 0) console.log(`[operation] Overwrote: ${replaced.join(', ')}`);
    }
    return;
  }

  if (args.json) {
    printJson({ success: true, command: 'generate-key', kind: args.kind, mode: args.mode, ...values });
  } else {
    for (const [key, value] of Object.entries(values)) {
      console.log(`${key}=${value}`);
    }
  }
}

async function runDbCommand(
  args: Extract<Parsed, { command: DbCommand }>,
  printResult = true,
): Promise<DbCommandResult> {
  const { command, json, mode, confirm } = args;

  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${mode}/.public.env`);
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) fail(`OPS_TOKEN not found for ${mode}`);

  if (printResult) log(json, `[operation] command=${command} mode=${mode} api=${apiBaseUrl}`);

  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const init: RequestInit = {
    method: 'POST',
    headers: {
      ...opsRequestHeaders(opsToken, mode),
      ...(command === 'database-reset' ? { 'content-type': 'application/json' } : {}),
    },
    ...(command === 'database-reset' ? { body: JSON.stringify({ confirm }) } : {}),
  };
  const res = await fetch(`${apiBaseUrl}/operation/${command}`, init);
  const body: unknown = await res.json().catch(() => undefined);
  if (printResult) {
    if (json) {
      printJson({ command, status: res.status, ok: res.ok, body });
    } else {
      console.log(`[operation] ${res.status}`, body);
    }
  }
  if (!res.ok) process.exitCode = 1;
  return { command, status: res.status, ok: res.ok, body };
}

function activeTransportFlag(): '--ssh' | '--ftp' | undefined {
  if (process.env.PAM_OPS_TRANSPORT === 'ssh') return '--ssh';
  if (process.env.PAM_OPS_TRANSPORT === 'ftp') return '--ftp';
  return undefined;
}

/** Run the existing aggregate seed through the operations endpoint already
 * opened by withOpsTunnel. PAM_OPS_REUSE prevents every child seeder from
 * opening another SSH tunnel or repeating the FTP PHP-gateway health check. */
function runAggregateSeed(mode: Mode, confirm: boolean, json: boolean): unknown {
  const transport = activeTransportFlag();
  const commandArgs = [
    'run',
    'seed',
    '--',
    ...(transport ? [transport] : []),
    `--${mode}`,
    ...(confirm ? ['--confirm'] : []),
    ...(json ? ['--json'] : []),
  ];
  log(json, `[operation] command=seed mode=${mode}`);
  const result = spawnSync('npm', commandArgs, {
    cwd: root,
    env: { ...process.env, PAM_OPS_REUSE: '1' },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: json ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw new Error(`seed failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`seed failed (exit ${result.status ?? 'signal'})`);
  }
  if (!json) return { success: true };
  const output = (result.stdout ?? '').trim();
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) throw new Error('seed returned no JSON result');
  try {
    return JSON.parse(output.slice(jsonStart)) as unknown;
  } catch (error) {
    throw new Error(`seed returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type OpsCall = { method: 'GET' | 'POST' | 'PUT'; path: string; body?: unknown };

/** One authenticated call to the ops surface, returning the parsed body so a
 * command can act on it rather than only printing it. */
async function callOps(mode: Mode, call: OpsCall): Promise<{ status: number; ok: boolean; body: any }> {
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${mode}/.public.env`);
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) fail(`OPS_TOKEN not found for ${mode}`);

  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}${call.path}`, {
    method: call.method,
    headers: {
      ...opsRequestHeaders(opsToken, mode),
      ...(call.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
  });
  const body: unknown = await res.json().catch(() => undefined);
  return { status: res.status, ok: res.ok, body };
}

function parseKeep(value: string | undefined): number {
  if (value === undefined) return DEFAULT_KEEP;
  const keep = Number(value);
  if (!Number.isSafeInteger(keep) || keep < 1) fail(`--keep must be a positive integer, got "${value}"`);
  return keep;
}

/** The restore verdict, printed the same way by `verify` and by
 * `restore --dry-run`. */
function printVerdict(manifest: BackupManifest, verdict: RestoreVerdict): void {
  console.log(`[operation] ${manifest.id}`);
  console.log(`[operation]   taken ${manifest.createdAt} on ${manifest.mode} (app ${manifest.appVersion})`);
  console.log(`[operation]   head=${manifest.migrationHead} (${manifest.migrations.length} migrations)`);
  console.log(`[operation]   media=${manifest.media.fileCount} files (${formatBytes(manifest.media.bytes)})`);
  if (verdict.ok) {
    console.log('[operation]   verdict: RESTORABLE');
    if (verdict.rollForward.length > 0) {
      console.log(`[operation]   will migrate forward: ${verdict.rollForward.join(', ')}`);
    }
    for (const warning of verdict.warnings) console.log(`[operation]   warning: ${warning}`);
  } else {
    console.log(`[operation]   verdict: REFUSED — ${verdict.reason}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

async function runAction(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[operation] failed', error);
    process.exitCode = 1;
  }
}

type CommonModeOpts = { mode: Mode; json?: boolean };

addConfirmOption(addCommonOptions(program.command('database-migrate')))
  .description('Run pending database migrations.')
  .action((opts: CommonModeOpts & { confirm?: boolean }) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-migrate');
      await runDbCommand({
        command: 'database-migrate',
        json: Boolean(opts.json),
        mode: opts.mode,
        confirm: false,
      });
    }),
  );

addConfirmOption(
  addCommonOptions(program.command('database-reset')),
  'required when targeting --prod — destroys all tables in the target database',
)
  .description('Reset (drop + recreate) the target database. Destructive.')
  .action((opts: CommonModeOpts & { confirm?: boolean }) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-reset');
      // The API itself independently requires {"confirm":true} in the body
      // regardless of mode (a server-side safety net, see operation.routes.ts)
      // — always send it once the CLI-level, prod-only gate above has passed.
      await runDbCommand({
        command: 'database-reset',
        json: Boolean(opts.json),
        mode: opts.mode,
        confirm: true,
      });
    }),
  );

addConfirmOption(
  addCommonOptions(program.command('database-reset-and-seed')),
  'required when targeting --prod — destroys all tables before rebuilding and seeding the target database',
)
  .description(
    'Reset the target database, run all migrations, then run the standard aggregate seed. Destructive.',
  )
  .action((opts: CommonModeOpts & { confirm?: boolean }) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-reset-and-seed');
      const json = Boolean(opts.json);
      log(json, `[operation] command=database-reset-and-seed mode=${opts.mode}`);

      const reset = await runDbCommand(
        { command: 'database-reset', json, mode: opts.mode, confirm: true },
        !json,
      );
      if (!reset.ok) {
        if (json) printJson({ command: 'database-reset-and-seed', mode: opts.mode, ok: false, reset });
        return;
      }

      const migrate = await runDbCommand(
        { command: 'database-migrate', json, mode: opts.mode, confirm: false },
        !json,
      );
      if (!migrate.ok) {
        if (json) {
          printJson({ command: 'database-reset-and-seed', mode: opts.mode, ok: false, reset, migrate });
        }
        return;
      }

      let seed: unknown;
      try {
        seed = runAggregateSeed(opts.mode, Boolean(opts.confirm), json);
      } catch (error) {
        if (!json) throw error;
        process.exitCode = 1;
        printJson({
          command: 'database-reset-and-seed',
          mode: opts.mode,
          ok: false,
          reset,
          migrate,
          seed: { success: false, error: error instanceof Error ? error.message : String(error) },
        });
        return;
      }
      if (json) {
        printJson({ command: 'database-reset-and-seed', mode: opts.mode, ok: true, reset, migrate, seed });
      } else {
        console.log('[operation] database reset, migrations, and aggregate seed completed.');
      }
    }),
  );

addConfirmOption(addCommonOptions(program.command('database-backup')), 'required when targeting --prod')
  .option('--keep <count>', `archives to keep on the host (default ${DEFAULT_KEEP})`)
  .description('Snapshot the target: every table plus every media tree, one .tar on the host.')
  .action((opts: CommonModeOpts & { confirm?: boolean; keep?: string }) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-backup');
      const keep = parseKeep(opts.keep);
      log(Boolean(opts.json), `[operation] command=database-backup mode=${opts.mode} keep=${keep}`);
      const { status, ok, body } = await callOps(opts.mode, {
        method: 'POST',
        path: '/operation/database-backup',
        body: { keep },
      });
      if (opts.json) {
        printJson({ command: 'database-backup', status, ok, body });
      } else if (ok) {
        const backup = body.backup;
        console.log(`[operation] ${backup.id}`);
        console.log(`[operation]   ${formatBytes(backup.bytes)} — ${backup.path}`);
        console.log(
          `[operation]   head=${backup.manifest.migrationHead} rows=${backup.manifest.tables.reduce((total: number, table: { rows: number }) => total + table.rows, 0)} media=${backup.manifest.media.fileCount} files`,
        );
        if (body.pruned?.length) console.log(`[operation]   pruned: ${body.pruned.join(', ')}`);
      } else {
        console.log(`[operation] ${status}`, body);
      }
      if (!ok) process.exitCode = 1;
    }),
  );

addCommonOptions(program.command('database-backup-list'))
  .description('List the archives held on the target.')
  .action((opts: CommonModeOpts) =>
    runAction(async () => {
      const { status, ok, body } = await callOps(opts.mode, {
        method: 'GET',
        path: '/operation/database-backup',
      });
      if (opts.json) {
        printJson({ command: 'database-backup-list', status, ok, body });
      } else if (ok) {
        if (body.backups.length === 0) {
          console.log(`[operation] no archive in ${body.directory.path}`);
        }
        for (const backup of body.backups) {
          console.log(
            `${backup.id}  ${formatBytes(backup.bytes).padStart(9)}  head=${backup.manifest.migrationHead}  media=${backup.manifest.media.fileCount}`,
          );
        }
      } else {
        console.log(`[operation] ${status}`, body);
      }
      if (!ok) process.exitCode = 1;
    }),
  );

addCommonOptions(program.command('database-backup-verify'))
  .addArgument(new Argument('<id>', 'archive id, as printed by database-backup-list'))
  .option('--from <mode>', 'accept an archive taken on another target (dev|preprod|prod)')
  .description('Read-only: check an archive and print the restore verdict. Touches nothing.')
  .action((id: string, opts: CommonModeOpts & { from?: string }) =>
    runAction(async () => {
      const query = opts.from ? `?from=${encodeURIComponent(opts.from)}` : '';
      const { status, ok, body } = await callOps(opts.mode, {
        method: 'GET',
        path: `/operation/database-backup/${encodeURIComponent(id)}/verify${query}`,
      });
      if (opts.json) {
        printJson({ command: 'database-backup-verify', status, ok, body });
      } else if (ok) {
        printVerdict(body.manifest, body.verdict);
      } else {
        console.log(`[operation] ${status}`, body);
      }
      if (!ok || body?.verdict?.ok === false) process.exitCode = 1;
    }),
  );

addConfirmOption(
  addCommonOptions(program.command('database-restore')),
  'required when targeting --prod — replaces the target database and every media tree',
)
  .addArgument(new Argument('<id>', 'archive id, as printed by database-backup-list'))
  .option('--dry-run', 'print the version verdict and stop, changing nothing')
  .option('--from <mode>', 'accept an archive taken on another target (dev|preprod|prod)')
  .option(
    '--bypass-preflight',
    'skip the migration compatibility gate (and related preflight refusals); you accept schema/data risk — e.g. restore after squashing migrations into a single init',
  )
  .description('Restore one archive in full: schema, rows, sequences and media. Destructive.')
  .action(
    (
      id: string,
      opts: CommonModeOpts & {
        confirm?: boolean;
        dryRun?: boolean;
        from?: string;
        bypassPreflight?: boolean;
      },
    ) =>
      runAction(async () => {
        requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-restore');
        if (opts.dryRun) {
          const query = opts.from ? `?from=${encodeURIComponent(opts.from)}` : '';
          const { status, ok, body } = await callOps(opts.mode, {
            method: 'GET',
            path: `/operation/database-backup/${encodeURIComponent(id)}/verify${query}`,
          });
          if (opts.json) {
            printJson({
              command: 'database-restore',
              dryRun: true,
              bypassPreflight: Boolean(opts.bypassPreflight),
              status,
              ok,
              body,
            });
          } else if (ok) {
            printVerdict(body.manifest, body.verdict);
            if (opts.bypassPreflight && body?.verdict?.ok === false) {
              console.log(
                '[operation] --bypass-preflight set: a real restore would proceed despite the refusal above',
              );
            }
          } else {
            console.log(`[operation] ${status}`, body);
          }
          // Dry-run still exits non-zero on a hard refuse unless bypass is set,
          // so scripts can detect "would fail without --bypass-preflight".
          if (!ok || (body?.verdict?.ok === false && !opts.bypassPreflight)) process.exitCode = 1;
          return;
        }

        log(
          Boolean(opts.json),
          `[operation] command=database-restore mode=${opts.mode} id=${id}${opts.bypassPreflight ? ' bypassPreflight=true' : ''}`,
        );
        // The API independently requires {"confirm":true} whatever the target,
        // exactly like database-reset — send it once the prod-only CLI gate has
        // passed.
        const { status, ok, body } = await callOps(opts.mode, {
          method: 'POST',
          path: '/operation/database-restore',
          body: {
            id,
            confirm: true,
            ...(opts.from ? { from: opts.from } : {}),
            ...(opts.bypassPreflight ? { bypassPreflight: true } : {}),
          },
        });
        if (opts.json) {
          printJson({ command: 'database-restore', status, ok, body });
        } else if (ok) {
          const report = body.report;
          const rows = report.tables.reduce(
            (total: number, table: { rows: number }) => total + table.rows,
            0,
          );
          console.log(`[operation] restored ${report.id}`);
          console.log(`[operation]   ${report.tables.length} tables, ${rows} rows`);
          console.log(
            `[operation]   media: ${report.media.restored} files (${formatBytes(report.media.bytes)})`,
          );
          if (report.rolledForward.length > 0) {
            console.log(`[operation]   migrated forward: ${report.rolledForward.join(', ')}`);
          }
          for (const warning of report.warnings) console.log(`[operation]   warning: ${warning}`);
        } else {
          console.log(`[operation] ${status}`, body?.error ?? body);
        }
        if (!ok) process.exitCode = 1;
      }),
  );

addCommonOptions(program.command('database-backup-fetch'))
  .addArgument(new Argument('<id>', 'archive id, as printed by database-backup-list'))
  .option('--out <dir>', `local directory (default ${DEFAULT_LOCAL_BACKUP_DIR})`)
  .description('Download one archive from the target to this machine.')
  .action((id: string, opts: CommonModeOpts & { out?: string }) =>
    runAction(async () => {
      const { ok, status, body } = await callOps(opts.mode, {
        method: 'GET',
        path: '/operation/database-backup',
      });
      if (!ok) fail(`could not list the target's archives (HTTP ${status})`);
      const backup = body.backups.find((candidate: { id: string }) => candidate.id === id);
      if (!backup) fail(`no archive "${id}" on ${opts.mode}`);
      const outDir = opts.out ?? join(root, DEFAULT_LOCAL_BACKUP_DIR);
      const localPath = join(outDir, `${id}.tar`);
      log(Boolean(opts.json), `[operation] fetching ${formatBytes(backup.bytes)} → ${localPath}`);
      downloadArchive(root, opts.mode, backup, localPath);
      if (opts.json) printJson({ command: 'database-backup-fetch', id, localPath, bytes: backup.bytes });
      else console.log(`[operation] ${localPath}`);
    }),
  );

addCommonOptions(program.command('database-backup-push'))
  .addArgument(
    new Argument('<id-or-file>', `archive id (from ${DEFAULT_LOCAL_BACKUP_DIR}/) or path to a local .tar`),
  )
  .description(
    `Upload a local archive into the target's backup directory, ready to restore. Defaults to the same ${DEFAULT_LOCAL_BACKUP_DIR}/ folder as database-backup-fetch.`,
  )
  .action((fileOrId: string, opts: CommonModeOpts) =>
    runAction(async () => {
      const localPath = resolveLocalArchive(fileOrId);
      const name = basename(localPath);
      if (!name.endsWith('.tar')) fail('expected a .tar archive produced by database-backup');
      const { ok, status, body } = await callOps(opts.mode, {
        method: 'GET',
        path: '/operation/database-backup',
      });
      if (!ok) fail(`could not read the target's backup directory (HTTP ${status})`);
      const remote = {
        path: `${body.directory.path}/${name}`,
        pathFromHome: body.directory.pathFromHome ? `${body.directory.pathFromHome}/${name}` : null,
      };
      log(Boolean(opts.json), `[operation] pushing ${name} → ${remote.path}`);
      uploadArchive(root, opts.mode, localPath, remote);
      const id = name.replace(/\.tar$/, '');
      if (opts.json) printJson({ command: 'database-backup-push', id, remotePath: remote.path });
      else
        console.log(
          `[operation] ${remote.path}\n[operation] restore it with: npm run operation -- database-restore ${id} --${opts.mode}`,
        );
    }),
  );

addConfirmOption(addCommonOptions(program.command('database-backup-prune')))
  .option('--keep <count>', `archives to keep (default ${DEFAULT_KEEP})`)
  .description("Delete the target's oldest archives, keeping the newest --keep.")
  .action((opts: CommonModeOpts & { confirm?: boolean; keep?: string }) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'database-backup-prune');
      const keep = parseKeep(opts.keep);
      const { status, ok, body } = await callOps(opts.mode, {
        method: 'POST',
        path: '/operation/database-backup/prune',
        body: { keep },
      });
      if (opts.json) printJson({ command: 'database-backup-prune', status, ok, body });
      else if (ok)
        console.log(
          body.pruned.length
            ? `[operation] pruned: ${body.pruned.join(', ')}`
            : '[operation] nothing to prune',
        );
      else console.log(`[operation] ${status}`, body);
      if (!ok) process.exitCode = 1;
    }),
  );

addCommonOptions(program.command('generate-key'))
  .addArgument(new Argument('<kind>', 'ops | jwt | db').choices(['ops', 'jwt', 'db']))
  .option('--replace', 'upsert the generated secret(s) into .env/<mode>/.private.env')
  .description('Generate a local secret (local-only; does not contact the target).')
  .action((kind: KeyKind, opts: CommonModeOpts & { replace?: boolean }) =>
    runAction(() => {
      runGenerateKey({
        command: 'generate-key',
        kind,
        json: Boolean(opts.json),
        mode: opts.mode,
        replace: Boolean(opts.replace),
      });
    }),
  );

addCommonOptions(program.command('email-folder'))
  .addArgument(new Argument('<enabled>', 'true | false').choices(['true', 'false']))
  .description(
    'Set the real ROUTE_EMAIL_FOLDER env var on preprod and restart the app (preprod only; dev/prod 404).',
  )
  .action((enabled: 'true' | 'false', opts: CommonModeOpts) =>
    runAction(async () => {
      const { status, ok, body } = await callOps(opts.mode, {
        method: 'PUT',
        path: '/operation/email-folder',
        body: { enabled: enabled === 'true' },
      });
      if (opts.json) printJson({ command: 'email-folder', status, ok, body });
      else if (ok)
        console.log(
          `[operation] email-folder enabled=${body.data.enabled} (was ${body.data.previousEnabled}) — app restarted`,
        );
      else console.log(`[operation] ${status}`, body);
      if (!ok) process.exitCode = 1;
    }),
  );

program.parse();
