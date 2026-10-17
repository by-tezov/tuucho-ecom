/** OPS_TOKEN-gated CLI for sold-out size requests. `list` prints the
 * selected database's product_requests through /operation/product-requests;
 * `set-status` patches one row. There is no local archive.
 *
 * Usage:
 *   npm run product-request -- list [--status requested,accepted,refused] [--json] --dev|--preprod|--prod
 *   npm run product-request -- set-status <publicId> <status> [--reason <text>] [--confirm] [--json] --dev|--preprod|--prod
 *
 * --confirm is required on set-status only when targeting --prod — never
 * for --dev/--preprod. `list` is read-only and never needs it.
 * --status (list): comma-separated subset; omitted means every status.
 * --reason (set-status): required when status is refused; rejected otherwise.
 * --json: one JSON object on stdout; narration on stderr.
 */
import { Argument, Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATUSES = ['requested', 'accepted', 'refused'] as const;
const PUBLIC_ID_RE = /^[A-Fa-f0-9]{8}$/;

type Status = (typeof STATUSES)[number];
type Command = 'list' | 'set-status';

interface AdminProductRequest {
  id: string;
  publicId: string;
  userId: string | null;
  email: string;
  productUid: string;
  title: string;
  shapeKey: string;
  shapeLabel: string;
  lengthKey: string;
  size: string;
  quantity: number;
  comment: string | null;
  status: Status;
  refusalReason: string | null;
  statusUpdatedAt: string;
  createdAt: string;
}

interface Args {
  command: Command;
  statuses: Status[];
  publicId: string | undefined;
  nextStatus: Status | undefined;
  reason: string | undefined;
  json: boolean;
  mode: Mode;
}

const program = new Program();
program
  .name('product-request')
  .description('OPS_TOKEN-gated CLI for sold-out size requests (list / set-status).');
const fail: (message: string) => never = makeFail(program, 'product-request');

function isStatus(value: string | undefined): value is Status {
  return !!value && (STATUSES as readonly string[]).includes(value);
}

function parseStatusList(value: string | undefined): Status[] {
  if (value === undefined) return [...STATUSES];
  const values = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length === 0) fail('--status must contain at least one comma-separated status.');
  const result: Status[] = [];
  for (const entry of values) {
    if (!isStatus(entry)) fail(`unknown status "${entry}" — must be one of ${STATUSES.join(', ')}.`);
    if (!result.includes(entry)) result.push(entry);
  }
  return result;
}

function baseArgs(command: Command, mode: Mode, json: boolean): Args {
  return {
    command,
    statuses: [...STATUSES],
    publicId: undefined,
    nextStatus: undefined,
    reason: undefined,
    json,
    mode,
  };
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[product-request] failed', error);
    process.exitCode = 1;
  }
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${opsToken}` },
  });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const error =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.statusText;
    const detail =
      body &&
      typeof body === 'object' &&
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
        ? `: ${(body as { message: string }).message}`
        : '';
    throw new Error(`${path} -> ${res.status} ${error}${detail}`);
  }
  return body;
}

function tableRow(request: AdminProductRequest): Record<string, unknown> {
  return {
    id: request.publicId,
    status: request.status,
    email: request.email,
    product: request.productUid,
    variant: `${request.shapeLabel} · ${request.lengthKey} · ${request.size}`,
    qty: request.quantity,
    created: request.createdAt.slice(0, 16).replace('T', ' '),
    reason: request.refusalReason ?? '',
  };
}

async function runList(
  apiBaseUrl: string,
  opsToken: string,
  statuses: Status[],
  json: boolean,
): Promise<{ statuses: Status[]; count: number; requests: AdminProductRequest[] }> {
  const params = new URLSearchParams();
  if (statuses.length !== STATUSES.length) params.set('status', statuses.join(','));
  const query = params.toString();
  const { requests } = (await apiFetch(
    apiBaseUrl,
    opsToken,
    `/operation/product-requests${query ? `?${query}` : ''}`,
  )) as { requests: AdminProductRequest[] };
  log(json, `[product-request] list: ${requests.length} request(s).`);
  logTable(json, requests.map(tableRow));
  return { statuses, count: requests.length, requests };
}

async function runSetStatus(
  apiBaseUrl: string,
  opsToken: string,
  publicId: string,
  status: Status,
  reason: string | undefined,
  json: boolean,
): Promise<{ changed: boolean; request: AdminProductRequest }> {
  const result = (await apiFetch(apiBaseUrl, opsToken, `/operation/product-requests/${publicId}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  })) as { changed: boolean; request: AdminProductRequest };
  log(
    json,
    `[product-request] publicId=${JSON.stringify(result.request.publicId)} status=${JSON.stringify(result.request.status)}${result.changed ? '' : ' (unchanged)'}`,
  );
  return result;
}

async function runMain(args: Args): Promise<void> {
  const { command, statuses, publicId, nextStatus, reason, json, mode } = args;
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${mode}/.public.env`);
  const opsToken = loadOpsToken(root, mode);
  if (!opsToken) fail(`OPS_TOKEN not found in .env/.private.env or .env/${mode}/.private.env`);

  log(json, `[product-request] command=${command} mode=${mode} api=${apiBaseUrl}`);
  if (command === 'list') {
    const summary = await runList(apiBaseUrl, opsToken, statuses, json);
    if (json) printJson({ command, ...summary });
  } else {
    const summary = await runSetStatus(apiBaseUrl, opsToken, publicId!, nextStatus!, reason, json);
    if (json) printJson({ command, ...summary });
  }
}

interface ListOpts {
  mode: Mode;
  json?: boolean;
  status?: string;
}

addCommonOptions(program.command('list'))
  .description('List sold-out size requests from the selected database.')
  .option('--status <list>', `comma-separated: ${STATUSES.join(', ')} (default: all)`)
  .action((opts: ListOpts) =>
    runAction(async () => {
      await runMain({
        ...baseArgs('list', opts.mode, Boolean(opts.json)),
        statuses: parseStatusList(opts.status),
      });
    }),
  );

interface SetStatusOpts {
  mode: Mode;
  json?: boolean;
  reason?: string;
  confirm?: boolean;
}

addConfirmOption(addCommonOptions(program.command('set-status')))
  .description("Change a size request's status.")
  .argument('<publicId>', '8-character hex id from list / the spy email')
  .addArgument(new Argument('<status>', `one of: ${STATUSES.join(', ')}`).choices(STATUSES))
  .option('--reason <text>', 'required when status is refused')
  .action((publicId: string, status: Status, opts: SetStatusOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'set-status');
      if (!PUBLIC_ID_RE.test(publicId)) fail(`publicId "${publicId}" must be an 8-character hex id.`);
      if (status === 'refused' && !opts.reason?.trim()) {
        fail('set-status refused requires --reason.');
      }
      if (status !== 'refused' && opts.reason) {
        fail('--reason is only allowed when status is refused.');
      }
      await runMain({
        ...baseArgs('set-status', opts.mode, Boolean(opts.json)),
        publicId: publicId.toUpperCase(),
        nextStatus: status,
        reason: opts.reason?.trim(),
      });
    }),
  );

program.parse();
