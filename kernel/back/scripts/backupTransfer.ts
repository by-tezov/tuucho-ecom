/** Moves a backup archive between the operator's machine and a target host.
 *
 * The archives are gigabyte-scale (they carry the whole media tree), so they
 * never travel through the ops HTTP surface: the PHP gateway buffers a whole
 * response in memory. `--dev` is a plain local copy; a remote target uses scp
 * over the same SSH alias as the ops tunnel, or curl over FTP when that is the
 * transport in use — FTP's login root is the account home, which is exactly
 * what the API reports as `pathFromHome`.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadEnvFile } from './envFile.js';
import type { Mode } from './envFile.js';

const SSH_HOST = 'lws_shop_example';
const TRANSFER_TIMEOUT_SECONDS = 3600;

export type Remote = { path: string; pathFromHome: string | null };

function ftpConnection(
  root: string,
  mode: Mode,
): { host: string; port: string; user: string; password: string } {
  const privateEnv = { ...loadEnvFile(root, '.private.env'), ...loadEnvFile(root, `${mode}/.private.env`) };
  const host = process.env.FTP_HOST ?? privateEnv.FTP_HOST;
  const port = process.env.FTP_PORT ?? privateEnv.FTP_PORT ?? '21';
  const user = process.env.FTP_USER ?? privateEnv.FTP_USER;
  const password = process.env.FTP_PASSWORD ?? privateEnv.FTP_PASSWORD;
  if (!host || !user || !password) {
    throw new Error('FTP transfer requires FTP_HOST, FTP_USER and FTP_PASSWORD in .env/.private.env');
  }
  return { host, port, user, password };
}

function ftpUrl(host: string, port: string, remotePath: string): string {
  const cleanHost = host.replace(/^ftps?:\/\//, '').replace(/\/$/, '');
  const path = remotePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `ftp://${cleanHost}:${port}/${path}`;
}

function requireFromHome(remote: Remote): string {
  if (!remote.pathFromHome) {
    throw new Error(
      `the target reports ${remote.path}, which is outside the account home — no transfer path from here`,
    );
  }
  return remote.pathFromHome;
}

/** True when this invocation reached the target over the FTP gateway rather
 * than an SSH forward — see withOpsTunnel.ts, which sets it. */
function usingFtp(): boolean {
  return process.env.PAM_OPS_TRANSPORT === 'ftp';
}

export function downloadArchive(root: string, mode: Mode, remote: Remote, localPath: string): void {
  mkdirSync(dirname(localPath), { recursive: true });
  if (mode === 'dev') {
    copyFileSync(remote.path, localPath);
    return;
  }
  if (usingFtp()) {
    const { host, port, user, password } = ftpConnection(root, mode);
    execFileSync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--connect-timeout',
        '10',
        '--max-time',
        String(TRANSFER_TIMEOUT_SECONDS),
        '--ipv4',
        '--user',
        `${user}:${password}`,
        '--output',
        localPath,
        ftpUrl(host, port, requireFromHome(remote)),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return;
  }
  execFileSync('scp', ['-q', `${SSH_HOST}:${requireFromHome(remote)}`, localPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function uploadArchive(root: string, mode: Mode, localPath: string, remote: Remote): void {
  if (mode === 'dev') {
    mkdirSync(dirname(remote.path), { recursive: true });
    copyFileSync(localPath, remote.path);
    return;
  }
  if (usingFtp()) {
    const { host, port, user, password } = ftpConnection(root, mode);
    execFileSync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--connect-timeout',
        '10',
        '--max-time',
        String(TRANSFER_TIMEOUT_SECONDS),
        '--ipv4',
        '--ftp-create-dirs',
        '--user',
        `${user}:${password}`,
        '--upload-file',
        localPath,
        ftpUrl(host, port, requireFromHome(remote)),
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return;
  }
  execFileSync('scp', ['-q', localPath, `${SSH_HOST}:${requireFromHome(remote)}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
