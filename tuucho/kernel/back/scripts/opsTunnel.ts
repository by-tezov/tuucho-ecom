/** SSH transport for the loopback-only operations server.
 *
 * `--ssh` reaches preprod/prod ops by forwarding a local port to the very
 * same `opsServer.js` the `--ftp` PHP gateway spawns — the difference is only
 * who starts it: an SSH session here, a web request there. `withOpsTunnel`
 * (ops CLIs) uses this module so SSH and FTP transports cannot drift on how
 * that server is started, waited for, or stopped.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';

const OPS_SSH_HOST = 'lws_shop_example';

/** A cold CloudLinux FS can take a long time to import every ops router, so
 * a remote wait is generous; `--dev` starts from a warm local tree. */
export const OPS_READY_TIMEOUT_REMOTE_MS = 120_000;
export const OPS_READY_TIMEOUT_DEV_MS = 15_000;

export async function freeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('could not allocate a local port'));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

/** The remote side of the tunnel.
 *
 * `opsServer.js` runs in the background and the shell then blocks on the SSH
 * channel's stdin. When the local `ssh` process goes away that stdin reaches
 * EOF (and the shell gets SIGHUP), which is what stops the server: without
 * it, every tunnel would leak a long-lived Node process on the host that the
 * PHP gateway's own cleanup cannot match, because its argv carries no
 * absolute path. Callers must therefore keep the child's stdin piped, never
 * `ignore`. */
function remoteOpsCommand(mode: 'preprod' | 'prod', port: number): string {
  return [
    `cd private_html/${mode}/current || exit 1`,
    `for n in "$HOME"/nodevenv/private_html/${mode}/current/*/bin/node; do`,
    '  [ -x "$n" ] || continue',
    `  APP_TARGET=${mode} PAM_OPS_PORT=${port} "$n" opsServer.js &`,
    '  pid=$!',
    "  trap 'kill $pid 2>/dev/null' EXIT HUP INT TERM",
    '  cat > /dev/null',
    '  kill $pid 2>/dev/null',
    '  wait $pid 2>/dev/null',
    '  exit 0',
    'done',
    'exit 1',
  ].join('\n');
}

export function spawnOpsSshTunnel(mode: 'preprod' | 'prod', port: number): ChildProcess {
  return spawn(
    'ssh',
    [
      '-o',
      'ConnectTimeout=10',
      '-o',
      'LogLevel=ERROR',
      '-L',
      `${port}:127.0.0.1:${port}`,
      OPS_SSH_HOST,
      remoteOpsCommand(mode, port),
    ],
    // stdin must stay open: closing it is the remote server's stop signal.
    { stdio: ['pipe', 'pipe', 'inherit'] },
  );
}

/** Resolves once `/healthz` answers 200, which `opsServer` only does after
 * every ops router is mounted. */
export function waitForOpsReady(
  baseUrl: string,
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let started = false;
    let timer: NodeJS.Timeout | undefined;
    let markerTimer: NodeJS.Timeout | undefined;
    const stop = (): void => {
      if (timer) clearInterval(timer);
      if (markerTimer) clearInterval(markerTimer);
      child.stdout?.off('data', onOutput);
    };
    const probe = (): void => {
      void fetch(`${baseUrl}/healthz`)
        .then((response) => {
          if (!response.ok) return;
          stop();
          resolve();
        })
        .catch(() => undefined);
      if (Date.now() > deadline) {
        stop();
        reject(new Error(`operations server did not become ready (ssh exited=${child.exitCode ?? 'no'})`));
      }
    };
    const onOutput = (chunk: Buffer | string): void => {
      if (started || !String(chunk).includes('[ops-server] listening=')) return;
      started = true;
      if (markerTimer) clearInterval(markerTimer);
      probe();
      // The SSH forward itself can lag the server's stdout by a moment.
      timer = setInterval(probe, 500);
    };
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', onOutput);
    // A startup error normally exits the child; this only covers a server
    // that somehow never emits its ready marker.
    markerTimer = setInterval(() => {
      if (Date.now() <= deadline) return;
      stop();
      reject(
        new Error(
          `operations server did not emit its readiness marker (ssh exited=${child.exitCode ?? 'no'})`,
        ),
      );
    }, 500);
    child.once('exit', (code) => {
      stop();
      reject(new Error(`operations server exited before becoming ready (${code ?? 'signal'})`));
    });
  });
}

/** Ends the SSH session, which is what stops the remote server. Closing
 * stdin first lets the remote shell shut the server down cleanly instead of
 * relying on SIGHUP alone. */
export function closeOpsSshTunnel(child: ChildProcess): void {
  try {
    child.stdin?.end();
  } catch {
    // Already gone; the kill below is enough.
  }
  child.kill('SIGTERM');
}
