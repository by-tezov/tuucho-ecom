/** Run an operational CLI against the loopback-only ops server.
 * Remote targets require an explicit --ssh or --ftp. SSH opens a short-lived
 * port forward to `opsServer` on 127.0.0.1. FTP talks to the PHP gateway at
 * OPS_GATEWAY_URL, which authenticates with OPS_TOKEN and proxies
 * `/operation/*` to that same loopback server. Ops CLIs never install or
 * remove that gateway — only `npm run deploy -- --ftp-ops` / `--ftp-ops-remove`
 * may do that. `--dev` starts `opsServer` locally and needs no transport. */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadOpsToken, loadPublicEnv } from './envFile.js';
import {
  closeOpsSshTunnel,
  freeLocalPort,
  OPS_READY_TIMEOUT_DEV_MS,
  OPS_READY_TIMEOUT_REMOTE_MS,
  spawnOpsSshTunnel,
  waitForOpsReady,
} from './opsTunnel.js';
import { parseTransportFlags, requireTransport, type Transport } from './transport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsx = join(root, 'node_modules', '.bin', 'tsx');
const target = process.argv[2];
const rawArgs = process.argv.slice(3);
if (!target || !/^[a-zA-Z][a-zA-Z0-9-]*$/.test(target))
  throw new Error('usage: withOpsTunnel <script> [...args]');

// Secret generation only rewrites the operator's local private env file; it
// does not contact an environment and therefore does not need a transport.
if (target === 'operation' && rawArgs[0] === 'generate-key') {
  const cli = spawn(tsx, [`scripts/${target}.ts`, ...rawArgs], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  await new Promise<void>((resolve) =>
    cli.once('close', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    }),
  );
  process.exit();
}

let transport: Transport | undefined;
let args: string[];
try {
  ({ transport, rest: args } = parseTransportFlags(rawArgs));
} catch (error) {
  throw new Error(error instanceof Error ? error.message : String(error));
}

function modeFromArgs(values: string[]): 'dev' | 'preprod' | 'prod' {
  const modes = values
    .filter(
      (value): value is 'dev' | 'preprod' | 'prod' =>
        value === '--dev' || value === '--preprod' || value === '--prod',
    )
    .map((value) => value.slice(2) as 'dev' | 'preprod' | 'prod');
  if (modes.length !== 1) throw new Error('exactly one of --dev, --preprod, or --prod is required');
  return modes[0]!;
}

async function assertPhpOpsGateway(
  opsBaseUrl: string,
  opsToken: string,
  mode: 'preprod' | 'prod',
): Promise<void> {
  const endpoint = `${opsBaseUrl}/healthz`;
  const deadline = Date.now() + 60_000;
  while (Date.now() <= deadline) {
    try {
      const response = await fetch(endpoint, { headers: { authorization: `Bearer ${opsToken}` } });
      if (response.ok) return;
      if (response.status === 401 || response.status === 403) {
        throw new Error(`PHP ops gateway rejected OPS_TOKEN at ${endpoint} (${response.status})`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('PHP ops gateway rejected OPS_TOKEN'))
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `PHP ops gateway did not answer at ${endpoint}. --ftp operations require that gateway; the public API does not serve /operation/*. ` +
      `Install it with \`npm run deploy -- --ftp --${mode} --ftp-ops --confirm\` (confirm only on --prod), ` +
      `or use --ssh. Remove it with \`npm run deploy -- --ftp --${mode} --ftp-ops-remove --confirm\`.`,
  );
}

function runCli(env: NodeJS.ProcessEnv): Promise<number> {
  // seed and product are aggregates: after this wrapper establishes the
  // transport, they launch each child through its own withOpsTunnel
  // invocation. Preserve the explicitly selected transport so they can
  // forward it. Other CLIs receive the stripped args because Commander does
  // not expose --ssh/--ftp as a business-command option.
  const cliArgs =
    (target === 'seed' || target === 'product') && transport ? [`--${transport}`, ...args] : args;
  const attributionEnv = {
    PAM_OPS_MODE: modeFromArgs(args),
    PAM_SOURCE_COMMAND: ['npm', 'run', target, ...cliArgs].join(' ').slice(0, 500),
  };
  const cli = spawn(tsx, [`scripts/${target}.ts`, ...cliArgs], {
    cwd: root,
    env: { ...env, ...attributionEnv },
    stdio: 'inherit',
  });
  return new Promise<number>((resolve) => cli.once('exit', (code) => resolve(code ?? 1)));
}

async function main(): Promise<void> {
  const mode = modeFromArgs(args);
  // --dev never leaves this machine, so it needs no transport; every remote
  // target must state one so a blocked SSH cannot be silently retried.
  if (mode !== 'dev') requireTransport(transport, mode);

  // Composite commands can reuse the tunnel/gateway their parent operation
  // already opened. The marker is set only by that parent; the endpoint and
  // credentials remain in this inherited process environment.
  if (process.env.PAM_OPS_REUSE === '1') {
    if (!process.env.PAM_OPS_API_BASE_URL && !process.env.PAM_OPS_TUNNEL_URL) {
      throw new Error('PAM_OPS_REUSE requires an active operations endpoint');
    }
    process.exitCode = await runCli(process.env);
    return;
  }

  // The FTP transport has no SSH forward. Ops CLIs talk to the PHP gateway
  // at OPS_GATEWAY_URL, which proxies `/operation/*` to loopback opsServer.
  // They never publish or remove that gateway; `--ftp-ops-remove` must make
  // these commands fail.
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) throw new Error(`OPS_TOKEN not found for ${mode}`);

  if (mode !== 'dev' && transport === 'ftp') {
    const gatewayUrl = (
      process.env.PAM_OPS_GATEWAY_URL ?? loadPublicEnv(root, mode).OPS_GATEWAY_URL
    )?.replace(/\/+$/, '');
    if (!gatewayUrl) throw new Error(`OPS_GATEWAY_URL not found for ${mode}`);
    await assertPhpOpsGateway(gatewayUrl, opsToken, mode);
    const transportEnv =
      target === 'faker'
        ? {
            ...process.env,
            PAM_OPS_TUNNEL_URL: gatewayUrl,
            PAM_OPS_TRANSPORT: 'ftp',
            PAM_OPS_TOKEN: opsToken,
          }
        : {
            ...process.env,
            PAM_OPS_API_BASE_URL: gatewayUrl,
            PAM_OPS_TRANSPORT: 'ftp',
            PAM_OPS_TOKEN: opsToken,
          };
    process.exitCode = await runCli(transportEnv);
    return;
  }

  const port = await freeLocalPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child =
    mode === 'dev'
      ? spawn(tsx, ['src/opsServer.ts'], {
          cwd: root,
          env: { ...process.env, APP_TARGET: mode, PAM_OPS_PORT: String(port) },
          stdio: ['ignore', 'pipe', 'inherit'],
        })
      : spawnOpsSshTunnel(mode, port);
  try {
    await waitForOpsReady(
      baseUrl,
      child,
      mode === 'dev' ? OPS_READY_TIMEOUT_DEV_MS : OPS_READY_TIMEOUT_REMOTE_MS,
    );
    const selectedTransport = transport ? { PAM_OPS_TRANSPORT: transport } : {};
    // Loopback opsServer requires Bearer OPS_TOKEN on /operation/*; pass the
    // same token the FTP path already used so CLIs do not send a stub.
    const transportEnv =
      target === 'faker'
        ? { ...process.env, ...selectedTransport, PAM_OPS_TUNNEL_URL: baseUrl, PAM_OPS_TOKEN: opsToken }
        : { ...process.env, ...selectedTransport, PAM_OPS_API_BASE_URL: baseUrl, PAM_OPS_TOKEN: opsToken };
    process.exitCode = await runCli(transportEnv);
  } finally {
    if (mode === 'dev') child.kill('SIGTERM');
    else closeOpsSshTunnel(child);
  }
}

void main().catch((error) => {
  console.error(`[ops] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
