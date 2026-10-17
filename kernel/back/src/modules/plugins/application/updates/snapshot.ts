import { execFile, spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { config } from '../../../../config/env.js';
import { resetPublicSchema } from '../../../../db/resetPublicSchema.js';
import { pool } from '../../../../db/pool.js';
import { withTransaction } from '../../../../platform/db/transaction.js';
import { repoRoot } from '../discoverPlugins.js';
import { copyScopedPaths, pathExists } from './copyScoped.js';

const execFileAsync = promisify(execFile);

export type UpdateSnapshot = {
  dir: string;
  filesDir: string;
  databaseDump: string;
  paths: string[];
};

export const OFFICIAL_SNAPSHOT_PATHS = [
  'kernel',
  'plugin-sdk',
  'plugins/tuucho',
  'release.json',
  'shop-release.json',
];

export function updatesVarDir(root = repoRoot()): string {
  return join(root, 'var/shop-updates');
}

export async function createUpdateSnapshot(
  paths = OFFICIAL_SNAPSHOT_PATHS,
  root = repoRoot(),
  options: { allowUserTree?: boolean } = {},
): Promise<UpdateSnapshot> {
  await mkdir(updatesVarDir(root), { recursive: true });
  const dir = await mkdtemp(join(updatesVarDir(root), 'snap-'));
  const filesDir = join(dir, 'files');
  const databaseDump = join(dir, 'database.sql');
  await mkdir(filesDir, { recursive: true });
  const filePaths = paths.filter((path) => path !== 'shop-release.json');
  if (filePaths.length > 0) await copyScopedPaths(root, filesDir, filePaths, options);
  const shopRelease = join(root, 'shop-release.json');
  if (paths.includes('shop-release.json') && (await pathExists(shopRelease))) {
    await cp(shopRelease, join(filesDir, 'shop-release.json'));
  }
  await dumpDatabase(databaseDump, root);
  return { dir, filesDir, databaseDump, paths };
}

function databaseNameFromUrl(url: string): { user: string; database: string } {
  const parsed = new URL(url);
  return { user: decodeURIComponent(parsed.username), database: parsed.pathname.replace(/^\//, '') };
}

async function dumpDatabase(target: string, root: string): Promise<void> {
  try {
    await execFileAsync('pg_dump', ['--dbname', config.databaseUrl, '--no-owner', '--no-acl', '-f', target], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return;
  } catch {
    // Local shops often only have pg_dump inside the Postgres container.
  }
  const { user, database } = databaseNameFromUrl(config.databaseUrl);
  const back = join(root, 'kernel/back');
  const { stdout } = await execFileAsync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env/.private.env',
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '--no-owner',
      '--no-acl',
      '-U',
      user,
      database,
    ],
    { cwd: back, maxBuffer: 64 * 1024 * 1024 },
  );
  await writeFile(target, stdout);
}

export async function restoreUpdateSnapshot(snapshot: UpdateSnapshot, root = repoRoot()): Promise<void> {
  const restoreFiles = snapshot.paths.filter((path) => path !== 'shop-release.json');
  const allowUserTree = restoreFiles.some((path) => path.startsWith('plugins/user/'));
  if (restoreFiles.length > 0) {
    await copyScopedPaths(snapshot.filesDir, root, restoreFiles, { allowUserTree });
  }
  const snapRelease = join(snapshot.filesDir, 'shop-release.json');
  if (await pathExists(snapRelease)) {
    await cp(snapRelease, join(root, 'shop-release.json'));
  } else if (snapshot.paths.includes('shop-release.json')) {
    await rm(join(root, 'shop-release.json'), { force: true });
  }
  await restoreDatabase(snapshot.databaseDump, root);
}

function runWithStdinFile(
  command: string,
  args: string[],
  options: { cwd?: string },
  filePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['pipe', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString('utf8') || `${command} exited ${code}`));
    });
    createReadStream(filePath).pipe(child.stdin);
  });
}

async function restoreDatabase(dumpPath: string, root: string): Promise<void> {
  if (!(await pathExists(dumpPath))) {
    throw new Error('Snapshot database dump is missing. Shop was not restored.');
  }
  await withTransaction(pool, (client) => resetPublicSchema(client));
  try {
    await execFileAsync('psql', ['--dbname', config.databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', dumpPath], {
      maxBuffer: 64 * 1024 * 1024,
    });
    return;
  } catch {
    const { user, database } = databaseNameFromUrl(config.databaseUrl);
    const back = join(root, 'kernel/back');
    await runWithStdinFile(
      'docker',
      [
        'compose',
        '--env-file',
        '.env/.private.env',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        user,
        '-d',
        database,
      ],
      { cwd: back },
      dumpPath,
    );
  }
}

export async function removeSnapshot(snapshot: UpdateSnapshot): Promise<void> {
  await rm(snapshot.dir, { recursive: true, force: true });
}
