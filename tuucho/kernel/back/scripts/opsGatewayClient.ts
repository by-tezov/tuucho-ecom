/** Client for the standalone PHP operations gateway (scripts/ops-gateway.php).
 *
 * The gateway is what makes an FTP *deploy* possible: FTP can only store
 * files, so everything else a deploy needs — creating the release symlinks,
 * running cloudlinux-selector, running npm install — goes through this one
 * HTTPS endpoint instead. Ops CLIs `--ftp` use the same gateway to reach
 * loopback `/operation/*`; they never publish or remove it. It runs under
 * PHP/Apache on its own subdomain rather than inside the Node application,
 * because a deploy stops that application and a gateway living inside it
 * could not then restart it. The public API does not serve this surface.
 *
 * This module holds only what scripts/deploy.ts still imports: how to load a
 * target, whether a gateway body is worth retrying, and starting/stopping the
 * loopback operations server. Publishing the gateway itself, uploading over
 * FTP and running commands through it live in deploy.ts, which is the only
 * caller. Every function here throws on failure; callers decide how to report
 * that. */
import { execFileSync } from 'node:child_process';
import { loadPublicEnv } from './envFile.js';

export interface GatewayTarget {
  mode: 'preprod' | 'prod';
  /** Base URL of the PHP gateway, e.g. https://ops-preprod.shop.example */
  gatewayUrl: string;
  /** Document root under the account's public_html that serves that URL. */
  directory: string;
  ftpHost: string;
  ftpPort: string;
  ftpUser: string;
  ftpPassword: string;
  opsToken: string;
}

const CONNECT_TIMEOUT_SECONDS = 10;
/** LiteSpeed 503 HTML after a Passenger restart is a successful curl with a
 * non-JSON body. Retry those the same way as a dropped TCP connection. */
export const GATEWAY_EXEC_ATTEMPTS = 8;

/** LiteSpeed capacity pages are HTML 503s. curl without --fail still exits 0,
 * so the JSON parse is what has to treat them as retryable. */
export function isRetryableGatewayBody(body: string): boolean {
  const trimmed = body.trimStart();
  if (trimmed === '') return true;
  if (trimmed.startsWith('<')) return true;
  return /503 Service Unavailable/i.test(trimmed);
}

export function loadGatewayTarget(root: string, mode: 'preprod' | 'prod'): GatewayTarget {
  const gatewayUrl = (process.env.PAM_OPS_GATEWAY_URL ?? loadPublicEnv(root, mode).OPS_GATEWAY_URL)?.replace(
    /\/+$/,
    '',
  );
  const json = loadPublicEnv(root, mode);
  const ftpHost = json.FTP_HOST;
  const ftpPort = json.FTP_PORT ?? '21';
  const ftpUser = json.FTP_USER;
  const ftpPassword = json.FTP_PASSWORD;
  const opsToken = json.OPS_TOKEN;

  if (!gatewayUrl)
    throw new Error(`ops.gatewayUrl not found for ${mode} — set it in kernel/back/config/${mode}/config.json`);
  if (!ftpHost || !ftpUser || !ftpPassword)
    throw new Error('FTP transport requires ftp.host, ftp.user and ftp.password in kernel private JSON');
  if (!/^\d{1,5}$/.test(ftpPort) || Number(ftpPort) > 65535)
    throw new Error(`FTP_PORT must be a port number, got ${ftpPort}`);
  if (ftpPort === '22') throw new Error('FTP_PORT=22 is SFTP/SSH, not FTP; this host serves FTP on port 21');
  if (!opsToken) throw new Error(`OPS_TOKEN not found for ${mode} — the gateway authenticates with it`);

  return {
    mode,
    gatewayUrl,
    directory: mode === 'preprod' ? 'ops-preprod' : 'ops',
    ftpHost,
    ftpPort,
    ftpUser,
    ftpPassword,
    opsToken,
  };
}

function sleepSync(ms: number): void {
  execFileSync('sleep', [String(ms / 1000)]);
}

/** Starts (or reuses) the loopback operations server the gateway proxies
 * to. Deploy calls this after a back FTP upload so migrate does not have to
 * spawn Node inside the same PHP request that then runs the migration. */
export function startRemoteOpsServer(target: GatewayTarget): void {
  const endpoint = `${target.gatewayUrl}/control/ops-start`;
  let lastError = 'ops-start failed';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const body = execFileSync(
        'curl',
        [
          '--silent',
          '--show-error',
          '--connect-timeout',
          String(CONNECT_TIMEOUT_SECONDS),
          '--max-time',
          '180',
          '-X',
          'POST',
          '-H',
          `Authorization: Bearer ${target.opsToken}`,
          endpoint,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const parsed = JSON.parse(body) as { success?: boolean; error?: { message?: string } };
      if (parsed.success) return;
      lastError = parsed.error?.message ?? `HTTP body from ${endpoint} was not success`;
    } catch (error) {
      const failure = error as { stderr?: string; stdout?: string; message?: string };
      lastError = String(failure.stderr || failure.stdout || failure.message || 'ops-start failed').trim();
    }
    if (attempt < 3) sleepSync(2000);
  }
  throw new Error(`loopback opsServer did not become ready at ${endpoint}: ${lastError}`);
}

/** Shuts down the loopback operations server the gateway started, mirroring
 * how the SSH transport closes its tunnel when the CLI exits. Best effort:
 * leaving it running costs memory, not correctness. */
export function stopRemoteOpsServer(target: GatewayTarget): void {
  try {
    execFileSync(
      'curl',
      [
        '--silent',
        '--show-error',
        '--fail',
        '--connect-timeout',
        String(CONNECT_TIMEOUT_SECONDS),
        '--max-time',
        '30',
        '-X',
        'POST',
        '-H',
        `Authorization: Bearer ${target.opsToken}`,
        `${target.gatewayUrl}/control/ops-stop`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    // Nothing actionable — the next run reuses or replaces it anyway.
  }
}
