/** Snapshot the whole local Pam workspace, plus a fresh production
 * database backup, into one zip.
 *
 * Usage:
 *   npm run backup-local -- --ssh|--ftp [--out <dir>]
 *
 * Writes `tuucho-<version>.zip` (version from repo-root package.json).
 * catalog source must match that version.
 * companion shop is included and is not version-locked.
 * Archive root is the `Pam/` folder (repos + `resources` and any other siblings).
 * Written to `Pam/backup/` by default; that folder is never zipped itself.
 * Excludes `node_modules`, `output`, `dist`, and IDE `.idea` trees.
 *
 * Before zipping, runs `operation -- database-backup --prod` (rotation keeps
 * its default) and `database-backup-fetch` of that archive into
 * `catalog source/backup/`. Only that fresh `.tar` from the backup folder
 * goes into the zip; older fetched archives stay on disk but are left out.
 * Does not print env file contents.
 */
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeFail } from './cliCommon.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Absolute path to the Pam workspace folder (parent of kernel/back). */
const pamRoot = resolve(root, '..');
const pamFolderName = basename(pamRoot);
const pamParent = dirname(pamRoot);

const PROJECTS = [
  'kernel/back',
  'kernel/front',
  'catalog source',
  'companion shop',
] as const;

/** Product version is repo-root package.json. catalog source must match.
 * companion shop is snapshotted and is not locked. */
const VERSION_LOCKED = new Set<string>(['catalog source']);

/** Directory basenames skipped anywhere under Pam. */
const EXCLUDE_DIRS = ['node_modules', 'output', 'dist', '.idea'] as const;

const program = new Command();
program
  .name('backup-local')
  .description('Zip the Pam workspace (repos + resources) into tuucho-<version>.zip.')
  .option('--out <dir>', 'directory for the zip (default: Pam/backup)')
  .option('--ssh', 'reach production over the SSH tunnel')
  .option('--ftp', 'reach production through the FTP ops gateway');
const fail: (message: string) => never = makeFail(program, 'backup-local');

/** Same folder `operation -- database-backup-fetch` writes to by default. */
const LOCAL_BACKUP_DIR = join('catalog source', 'backup');
/** Default zip folder, inside Pam; never zipped into the next archive. */
const ZIP_DIR = 'backup';

function readVersion(packageJsonPath: string): string {
  const data = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown };
  if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version)) {
    throw new Error(`${packageJsonPath} must contain a semantic version X.Y.Z`);
  }
  return data.version;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Runs one `npm run operation` subcommand with `--json` and returns its
 * parsed stdout. Progress lines go to stderr, so they stay visible. */
function runOperationJson(args: string[]): { ok?: boolean; body?: unknown; localPath?: string } {
  const stdout = execFileSync(
    join(root, 'node_modules', '.bin', 'tsx'),
    ['scripts/withOpsTunnel.ts', 'operation', ...args, '--json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as { ok?: boolean; body?: unknown; localPath?: string };
}

/** Creates a production backup and downloads it; returns the local .tar path. */
function fetchProdDatabaseBackup(transportFlag: string): string {
  console.log(`[backup-local] creating production database backup (${transportFlag})`);
  const created = runOperationJson(['database-backup', '--prod', '--confirm', transportFlag]);
  const id = (created.body as { backup?: { id?: unknown } } | undefined)?.backup?.id;
  if (!created.ok || typeof id !== 'string') fail('production database-backup failed');

  console.log(`[backup-local] fetching ${id}`);
  const fetched = runOperationJson(['database-backup-fetch', id, '--prod', transportFlag]);
  if (typeof fetched.localPath !== 'string' || !existsSync(fetched.localPath)) {
    fail(`database-backup-fetch did not produce ${id}.tar`);
  }
  return fetched.localPath;
}

function main(): void {
  program.parse();
  const opts = program.opts<{ out?: string; ssh?: boolean; ftp?: boolean }>();
  if (opts.ssh === opts.ftp) fail('exactly one of --ssh or --ftp is required to reach production');
  const transportFlag = opts.ssh ? '--ssh' : '--ftp';

  if (pamFolderName !== 'Pam') {
    fail(`expected workspace folder named Pam, got ${pamRoot}`);
  }

  const version = readVersion(join(resolve(root, '../..'), 'package.json'));
  const versions = new Map<string, string>();
  for (const name of PROJECTS) {
    const projectRoot = join(pamRoot, name);
    if (!existsSync(projectRoot)) fail(`missing sibling project ${name} at ${projectRoot}`);
    const packageJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) fail(`missing ${packageJsonPath}`);
    if (VERSION_LOCKED.has(name)) versions.set(name, readVersion(packageJsonPath));
  }

  const mismatched = [...versions.entries()].filter(([, v]) => v !== version);
  if (mismatched.length > 0) {
    const detail = mismatched.map(([name, v]) => `${name}=${v}`).join(', ');
    fail(`package versions must match root@${version}; got ${detail}`);
  }

  const outDir = resolve(opts.out ? opts.out : join(pamRoot, ZIP_DIR));
  mkdirSync(outDir, { recursive: true });
  const archiveName = `tuucho-${version}.zip`;
  const archivePath = join(outDir, archiveName);
  const stagingPath = join(outDir, `.${archiveName}.partial`);

  if (existsSync(stagingPath)) rmSync(stagingPath);

  const databaseTar = fetchProdDatabaseBackup(transportFlag);
  const databaseEntry = relative(pamParent, databaseTar);
  if (databaseEntry !== join(pamFolderName, LOCAL_BACKUP_DIR, basename(databaseTar))) {
    fail(`unexpected backup location ${databaseTar}`);
  }

  const excludeArgs = EXCLUDE_DIRS.flatMap((dir) => [`-x`, `*/${dir}/*`, `-x`, `*/${dir}`]);
  excludeArgs.push('-x', `*/${archiveName}`, '-x', archiveName);
  excludeArgs.push('-x', `*/.${archiveName}.partial`, '-x', `.${archiveName}.partial`);
  // Older fetched archives are hundreds of MB each; only the fresh one is added below.
  excludeArgs.push('-x', `${join(pamFolderName, LOCAL_BACKUP_DIR)}/*`);
  excludeArgs.push('-x', `${join(pamFolderName, ZIP_DIR)}/*`);

  console.log(`[backup-local] version=${version}`);
  console.log(`[backup-local] root=${pamFolderName}/ (includes ${PROJECTS.join(', ')}, resources, ...)`);
  console.log(`[backup-local] exclude=${EXCLUDE_DIRS.join(', ')}`);
  console.log(`[backup-local] writing ${archivePath}`);

  try {
    // Zip from the parent so the archive root is `Pam/...`.
    // Info-ZIP exit 18 = could not open some input file (e.g. a raced
    // temp under a project). The archive is still usable; only fail hard
    // when nothing was written.
    try {
      execFileSync('zip', ['-r', '-q', stagingPath, pamFolderName, ...excludeArgs], {
        cwd: pamParent,
        stdio: ['ignore', 'inherit', 'inherit'],
      });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : null;
      if (status !== 18 || !existsSync(stagingPath) || statSync(stagingPath).size === 0) {
        throw error;
      }
      console.warn('[backup-local] zip reported unreadable files (exit 18); archive kept');
    }
    execFileSync('zip', ['-q', stagingPath, databaseEntry], {
      cwd: pamParent,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    renameSync(stagingPath, archivePath);
  } catch (error) {
    if (existsSync(stagingPath)) rmSync(stagingPath);
    throw error;
  }

  const bytes = statSync(archivePath).size;
  console.log(`[backup-local] database ${databaseEntry}`);
  console.log(`[backup-local] done ${formatBytes(bytes)} -> ${archivePath}`);
}

main();
