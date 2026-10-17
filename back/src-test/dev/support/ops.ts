import { spawn } from 'node:child_process';
import { loadOpsToken } from '../../../scripts/envFile.js';
import { loadTestEnv, type TestMode } from './env.js';

export interface OpsJson {
  [key: string]: unknown;
}

function runNpm(
  args: string[],
  opts: { cwd?: string; mode: TestMode } = { mode: 'dev' },
): Promise<{ stdout: string; stderr: string; code: number }> {
  const env = loadTestEnv(opts.mode);
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', ...args], {
      cwd: opts.cwd ?? env.root,
      // Functional tests run against a disposable server on a random port.
      // The CLI normally reads localhost from .env, so forward the active
      // test API explicitly rather than changing any persistent env file.
      env: { ...process.env, PAM_TEST_API_BASE_URL: env.apiBaseUrl },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

interface ChatSessionSummary {
  publicId: string;
  visitorEmail: string;
}

/**
 * Find the exact chat opened by a functional-test customer through the same
 * operator CLI used in day-to-day support.  The CLI needs the test server URL
 * because functional tests run it on a disposable port.
 */
export async function findOpenChatSessionFor(email: string): Promise<string> {
  const opsBase = process.env.PAM_OPS_API_BASE_URL;
  if (opsBase) {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const { status, json } = await opsRequest('GET', '/operation/chat/sessions?status=open');
      if (status !== 200) {
        throw new Error(`[chat] list sessions failed: HTTP ${status} ${JSON.stringify(json)}`);
      }
      const sessions = ((json.data as { sessions?: ChatSessionSummary[] } | undefined)?.sessions ?? []);
      const session = sessions.find((item) => item.visitorEmail === email);
      if (session) return session.publicId;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(`[chat] no open session found for ${email}`);
  }
  const result = await runBackJson('chat', ['sessions', '--status', 'open']);
  const sessions = ((result.data as { sessions?: ChatSessionSummary[] } | undefined)?.sessions ?? []);
  const session = sessions.find((item) => item.visitorEmail === email);
  if (!session) throw new Error(`[chat] no open session found for ${email}`);
  return session.publicId;
}

/** Reply and close using the real interactive `npm run chat` flow. */
export async function replyToChatViaCli(sessionId: string, message: string): Promise<void> {
  const env = loadTestEnv();
  // The CLI is interactive and its prompt is not flushed consistently when
  // Patchright runs headless. Use the same loopback operations endpoints for
  // the functional assertion: this still exercises the exact owner reply and
  // close actions, while avoiding a terminal-rendering race.
  const opsBase = process.env.PAM_OPS_API_BASE_URL;
  if (opsBase) {
    const reply = await opsRequest('POST', `/operation/chat/sessions/${sessionId}/messages`, {
      body: message,
    });
    if (reply.status !== 201) throw new Error(`[chat] owner reply failed with HTTP ${reply.status}`);
    const close = await opsRequest('POST', `/operation/chat/sessions/${sessionId}/close`);
    if (close.status !== 200) throw new Error(`[chat] owner close failed with HTTP ${close.status}`);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', 'chat', '--', sessionId, `--${env.mode}`], {
      cwd: env.root,
      env: { ...process.env, PAM_TEST_API_BASE_URL: env.apiBaseUrl },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let sent = false;
    const sendReply = () => {
      if (sent) return;
      sent = true;
      child.stdin.write(`${message}\n`);
      setTimeout(() => child.stdin.write('/quit\n'), 750);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`[chat] CLI did not reach its reply prompt for ${sessionId}:\n${stderr}\n${stdout}`));
    }, 60_000);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.includes('> ') || stdout.includes('Statut :')) sendReply();
    });
    // readline can emit its prompt before npm/tsx flushes it to the pipe.
    // Input is safely buffered by readline, so do not make the test depend
    // on terminal prompt rendering.
    setTimeout(sendReply, 5_000);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && sent && /Session fermée\./.test(stdout)) resolve();
      else reject(new Error(`[chat] CLI failed (${code ?? 'unknown'}):\n${stderr}\n${stdout}`));
    });
  });
}

/** Run a back CLI that supports `--json` and parse a JSON object from stdout. */
export async function runBackJson(
  script: string,
  scriptArgs: string[],
  mode: TestMode = loadTestEnv().mode,
): Promise<OpsJson> {
  // Remote targets must state a transport; honour the one scripts/test.ts
  // chose so a `--ssh` run does not silently fall back to the PHP gateway.
  const selected = process.env.PAM_TEST_TRANSPORT;
  const transport =
    selected === 'ssh'
      ? (['--ssh'] as const)
      : mode === 'preprod' || selected === 'ftp'
        ? (['--ftp'] as const)
        : [];
  const { stdout, stderr, code } = await runNpm(
    [script, '--', ...scriptArgs, '--json', `--${mode}`, ...transport],
    { mode },
  );
  if (code !== 0) {
    throw new Error(`[ops] npm run ${script} failed (${code}):\n${stderr}\n${stdout}`);
  }
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(stdout.slice(start, end + 1)) as OpsJson;
    } catch {
      /* fall through */
    }
  }
  throw new Error(`[ops] no JSON in stdout for ${script}:\n${stdout}`);
}

export async function setOrderStatus(
  orderNumber: string,
  status: string,
  extra: string[] = [],
): Promise<OpsJson> {
  return runBackJson('order', ['set-status', orderNumber, status, ...extra]);
}

/** Advance confirmed → … → sent. Uses real Mondial sticker on to_send;
 * pass skipLabel=true when sandbox credentials are missing. */
export async function advanceOrderToSent(
  orderNumber: string,
  opts: { skipLabel?: boolean } = {},
): Promise<void> {
  await setOrderStatus(orderNumber, 'in_preparation');
  await setOrderStatus(
    orderNumber,
    'to_send',
    opts.skipLabel ? ['--skip-shipment-label'] : [],
  );
  await setOrderStatus(orderNumber, 'sent');
}

export async function listOrders(status?: string): Promise<OpsJson> {
  const args = ['list'];
  if (status) args.push('--status', status);
  return runBackJson('order', args);
}

export type VoucherOffer =
  | { kind: 'percent'; percent: number }
  | { kind: 'amount'; amount: number }
  | { kind: 'free-shipping' }
  | { kind: 'free-item'; maxItemPrice: number }
  | { kind: 'free-item-nth'; requiredItemQuantity: number };

/** Create a one-off voucher via CLI (source JSON + remote row).
 * `users` is the account-id allow-list (`--users`). Omit it for a public voucher. */
export async function initVoucher(
  name: string,
  offer: VoucherOffer,
  opts: {
    quantity?: number;
    end?: string;
    maxPerUser?: number;
    minBuy?: number;
    users?: readonly string[];
  } = {},
): Promise<OpsJson> {
  const quantity = String(opts.quantity ?? 50);
  const end = opts.end ?? '30d';
  const args = ['init', '--name', name, '--quantity', quantity, '--end', end];
  if (opts.maxPerUser !== undefined) args.push('--max-per-user', String(opts.maxPerUser));
  if (opts.minBuy !== undefined) args.push('--min-buy', String(opts.minBuy));
  if (opts.users?.length) args.push('--users', ...opts.users);
  if (offer.kind === 'percent') args.push('--percent', String(offer.percent));
  else if (offer.kind === 'amount') args.push('--amount', String(offer.amount));
  else if (offer.kind === 'free-shipping') args.push('--free-shipping');
  else if (offer.kind === 'free-item') args.push('--free-item', String(offer.maxItemPrice));
  else args.push('--free-item-nth', String(offer.requiredItemQuantity));
  return runBackJson('voucher', args);
}

/** Loopback ops server (`PAM_OPS_API_BASE_URL`, started by scripts/test.ts).
 * Operational routes are never mounted on the public API, so the few API
 * contracts that need an operator action (role assignment, order status
 * advance, owner chat reply) reach the same endpoints the CLIs use. The
 * loopback server still requires `Authorization: Bearer <OPS_TOKEN>`. */
export function opsBaseUrl(mode: TestMode = loadTestEnv().mode): string {
  const env = loadTestEnv(mode);
  const base = process.env.PAM_OPS_API_BASE_URL ?? env.apiBaseUrl;
  return base.replace(/\/$/, '');
}

export async function opsRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  mode: TestMode = loadTestEnv().mode,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const env = loadTestEnv(mode);
  const token = process.env.OPS_TOKEN || process.env.PAM_OPS_TOKEN || loadOpsToken(env.root, mode);
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const preprod = mode === 'preprod' || process.env.PAM_TEST_MODE === 'preprod';
  const response = await fetch(`${opsBaseUrl(mode)}${path}`, {
    method,
    headers,
    ...(payload === undefined ? {} : { body: payload }),
    ...(preprod ? { signal: AbortSignal.timeout(20_000) } : {}),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

/** Grant the `super-admin` role used by `/admin/*` (requireAdmin reads
 * the live user row, so an already-issued access token picks this up). */
export async function promoteToAdmin(email: string): Promise<void> {
  await promoteToRole(email, 'super-admin');
}

/** Assign exactly one staff role (or clear with `user`). Replaces the whole
 * role set: multi-role assignment stays on `PUT /admin/users/:id/roles`. */
export async function promoteToRole(email: string, role: string): Promise<void> {
  const { status, json } = await opsRequest(
    'PUT',
    `/operation/accounts/${encodeURIComponent(email)}/role`,
    { role },
  );
  if (status !== 200 || json.success !== true) {
    throw new Error(`[ops] could not set role ${role} on ${email}: ${status} ${JSON.stringify(json)}`);
  }
}

/** Reverse of an operator lock (`POST /auth/lock-account` or ops lock), so a
 * test that deliberately locks an account can leave it usable. */
export async function unlockAccountViaOps(email: string): Promise<void> {
  await opsRequest('POST', `/operation/accounts/${encodeURIComponent(email)}/unlock`);
}
