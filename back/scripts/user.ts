/** OPS_TOKEN-gated CLI for user/account moderation — there's no admin
 * backoffice, so this is the only way to browse the user base, or to lock
 * (suspicious activity spotted directly, e.g. from a spy email) / unlock
 * (reverses either that or the customer's own "this wasn't me" self-lock,
 * see accountSecurityLock.service.ts) an account, or hard-delete one
 * immediately (skips the customer grace period).
 *
 * Usage:
 *   npm run user -- list [--from <val>] [--to <val>] [--limit <n>]
 *     [--search <exact-email>] [--ip <address>]
 *     [--created-after <val>] [--created-before <val>]
 *     [--locked] [--with-orders] [--never-ordered]
 *     [--sort last-connected|most-connected|least-connected|order-value]
 *     [--json] --dev|--preprod|--prod
 *   npm run user -- lock <id-or-email> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run user -- unlock <id-or-email> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run user -- set-role <id-or-email> <role-code> [--confirm] [--json] --dev|--preprod|--prod
 *   npm run user -- delete <id-or-email> [--delete-orders] [--confirm] [--json] --dev|--preprod|--prod
 *
 * --confirm is required on lock/unlock/set-role/delete only when targeting --prod —
 * never for --dev/--preprod. `list` is read-only and never needs it.
 *
 * `delete` hard-removes the account immediately. By default orders are
 * orphaned (same as the GDPR cron). Pass --delete-orders to wipe them from
 * the DB and remove matching local manager order/<status>/<orderNumber>.json
 * mirrors.
 *
 * --search matches an exact email only (via email_lookup HMAC), not a
 * substring — stored emails are ciphertext and cannot be ILIKE-searched.
 *
 * --json (all commands): prints one JSON object to stdout instead of the
 * human-readable table/line, and moves every other line (the banner,
 * warnings) to stderr — safe to pipe into `jq`, a file, or another script.
 *
 * --from/--to each independently accept one of three forms:
 *   - a plain index (e.g. "10") — position in the current --sort order.
 *     If both --from and --to are indexes, that's the inclusive range
 *     [from, to]; --limit cannot be combined with an index --to.
 *   - a relative day count "<N>d" (e.g. "5d") — N days ago.
 *   - an absolute date "YYYY-MM-DD".
 * The last two forms both filter on last_connected_at, NOT pagination:
 * --from is the more-recent boundary, --to is the further-back boundary
 * (so `--from 0d --to 5d` means "connected sometime in the last 5 days").
 * --from omitted defaults to "today" (no upper/recent bound); --to omitted
 * defaults to "maximum" (no lower/older bound) — in practice this just
 * means that side of the filter isn't applied at all. --from and --to must
 * be the same kind (both indexes, or both dates/day-counts) if both given.
 * --limit alone (no --from/--to) just caps the result count from offset 0;
 * omitted entirely, there is no limit — every matching row is returned.
 */
import { Command as Program, Option } from 'commander';
import { unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken } from './envFile.js';
import type { Mode } from './envFile.js';
import { log, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orderRoot = join(root, '..', 'pamsurin-manager', 'order');
const ORDER_STATUSES = [
  'confirmed',
  'in_preparation',
  'to_send',
  'sent',
  'disponible',
  'received',
  'cancelled',
] as const;

const SORTS = ['last-connected', 'most-connected', 'least-connected', 'order-value'] as const;
type Sort = (typeof SORTS)[number];

interface ListArgs {
  command: 'list';
  offset: number;
  limit: number | undefined;
  locked: boolean;
  withOrders: boolean;
  neverOrdered: boolean;
  search: string | undefined;
  ip: string | undefined;
  createdAfter: string | undefined;
  createdBefore: string | undefined;
  lastConnectedAfter: string | undefined;
  lastConnectedBefore: string | undefined;
  sort: Sort;
  json: boolean;
  mode: Mode;
}

interface WriteArgs {
  command: 'lock' | 'unlock' | 'set-role';
  idOrEmail: string;
  role?: string;
  reason?: string;
  json: boolean;
  mode: Mode;
}

interface DeleteArgs {
  command: 'delete';
  idOrEmail: string;
  deleteOrders: boolean;
  json: boolean;
  mode: Mode;
}

const program = new Program();
program.name('user').description('OPS_TOKEN-gated CLI for user/account moderation.');
const fail: (message: string) => never = makeFail(program, 'user');

type ParsedFromTo = { kind: 'index'; value: number } | { kind: 'date'; iso: string };

function parseFromTo(raw: string, flagName: string): ParsedFromTo {
  const daysMatch = /^(\d+)d$/.exec(raw);
  if (daysMatch) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - Number(daysMatch[1]));
    return { kind: 'date', iso: date.toISOString() };
  }
  if (/^\d+$/.test(raw)) return { kind: 'index', value: Number(raw) };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    fail(
      `${flagName} "${raw}" isn't a valid index, a relative day count (e.g. "5d"), or a date (YYYY-MM-DD).`,
    );
  }
  return { kind: 'date', iso: parsed.toISOString() };
}

function parseDateOnly(raw: string, flagName: string): string {
  const result = parseFromTo(raw, flagName);
  if (result.kind !== 'date')
    fail(`${flagName} must be a date (YYYY-MM-DD) or a relative day count ("5d"), not a plain index.`);
  return result.iso;
}

interface ListOpts {
  mode: Mode;
  json?: boolean;
  from?: string;
  to?: string;
  limit?: string;
  locked?: boolean;
  withOrders?: boolean;
  neverOrdered?: boolean;
  search?: string;
  ip?: string;
  createdAfter?: string;
  createdBefore?: string;
  sort: Sort;
}

function buildListArgs(opts: ListOpts): ListArgs {
  if (opts.withOrders && opts.neverOrdered) fail('--with-orders and --never-ordered are mutually exclusive.');

  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;
  let offset = 0;
  let resolvedLimit = limit;
  let lastConnectedAfter: string | undefined;
  let lastConnectedBefore: string | undefined;

  if (opts.from !== undefined || opts.to !== undefined) {
    const from = opts.from !== undefined ? parseFromTo(opts.from, '--from') : undefined;
    const to = opts.to !== undefined ? parseFromTo(opts.to, '--to') : undefined;
    if (from && to && from.kind !== to.kind) {
      fail('--from and --to must be the same kind: both indexes, or both dates/relative day counts.');
    }
    if ((from?.kind ?? to?.kind) === 'index') {
      if (limit !== undefined) fail('--limit cannot be combined with an index --from/--to range.');
      offset = from?.kind === 'index' ? from.value : 0;
      if (to?.kind === 'index') resolvedLimit = to.value - offset + 1;
      if (resolvedLimit !== undefined && (!Number.isSafeInteger(resolvedLimit) || resolvedLimit <= 0)) {
        fail('--from/--to index range must resolve to a positive count.');
      }
    } else {
      // date/day mode — --from is the more-recent boundary (upper bound on
      // last_connected_at), --to is the further-back boundary (lower bound).
      if (from?.kind === 'date') lastConnectedBefore = from.iso;
      if (to?.kind === 'date') lastConnectedAfter = to.iso;
    }
  }
  if (!Number.isSafeInteger(offset) || offset < 0)
    fail('--from must be a non-negative integer when used as an index.');
  if (resolvedLimit !== undefined && (!Number.isSafeInteger(resolvedLimit) || resolvedLimit <= 0)) {
    fail('--limit must be a positive integer.');
  }

  return {
    command: 'list',
    offset,
    limit: resolvedLimit,
    locked: Boolean(opts.locked),
    withOrders: Boolean(opts.withOrders),
    neverOrdered: Boolean(opts.neverOrdered),
    search: opts.search,
    ip: opts.ip,
    createdAfter:
      opts.createdAfter !== undefined ? parseDateOnly(opts.createdAfter, '--created-after') : undefined,
    createdBefore:
      opts.createdBefore !== undefined ? parseDateOnly(opts.createdBefore, '--created-before') : undefined,
    lastConnectedAfter,
    lastConnectedBefore,
    sort: opts.sort,
    json: Boolean(opts.json),
    mode: opts.mode,
  };
}

interface OpsUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastConnectedAt: string | null;
  connectionCount: number;
  orderCount: number;
  orderValueSum: number;
}

async function runList(apiBaseUrl: string, opsToken: string, args: ListArgs): Promise<void> {
  const params = new URLSearchParams({ offset: String(args.offset), sort: args.sort });
  if (args.limit !== undefined) params.set('limit', String(args.limit));
  if (args.locked) params.set('locked', 'true');
  if (args.withOrders) params.set('withOrders', 'true');
  if (args.neverOrdered) params.set('neverOrdered', 'true');
  if (args.search) params.set('search', args.search);
  if (args.ip) params.set('ip', args.ip);
  if (args.createdAfter) params.set('createdAfter', args.createdAfter);
  if (args.createdBefore) params.set('createdBefore', args.createdBefore);
  if (args.lastConnectedAfter) params.set('lastConnectedAfter', args.lastConnectedAfter);
  if (args.lastConnectedBefore) params.set('lastConnectedBefore', args.lastConnectedBefore);

  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}/operation/users?${params}`, {
    headers: opsRequestHeaders(opsToken),
  });
  const body = (await res.json().catch(() => undefined)) as
    { success: true; total: number; users: OpsUser[] } | { success: false; error: unknown } | undefined;
  if (!res.ok || !body?.success) {
    console.error(`[user] list failed`, res.status, body);
    process.exitCode = 1;
    return;
  }

  if (args.json) {
    printJson(body);
    return;
  }

  console.log(
    `[user] showing ${body.users.length} of ${body.total} user(s), offset=${args.offset} sort=${args.sort}`,
  );
  console.table(
    body.users.map((user) => ({
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || '—',
      status: user.status,
      role: user.role,
      verified: user.emailVerified,
      created: user.createdAt.slice(0, 10),
      lastConnected: user.lastConnectedAt?.slice(0, 16).replace('T', ' ') ?? '—',
      connections: user.connectionCount,
      orders: user.orderCount,
      orderValue: user.orderValueSum.toFixed(2),
    })),
  );
}

async function runWrite(apiBaseUrl: string, opsToken: string, args: WriteArgs): Promise<void> {
  const action = args.command === 'set-role' ? 'role' : args.command;
  const requestBody =
    args.command === 'set-role'
      ? JSON.stringify({ role: args.role })
      : args.command === 'lock' && args.reason
        ? JSON.stringify({ reason: args.reason })
        : undefined;
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(
    `${apiBaseUrl}/operation/accounts/${encodeURIComponent(args.idOrEmail)}/${action}`,
    {
      method: args.command === 'set-role' ? 'PUT' : 'POST',
      headers: {
        ...opsRequestHeaders(opsToken),
        ...(requestBody !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: requestBody,
    },
  );
  const body: unknown = await res.json().catch(() => undefined);
  if (args.json) {
    printJson({ command: args.command, status: res.status, ok: res.ok, body });
  } else {
    console.log(`[user] ${args.command} ${res.status}`, body);
  }
  if (!res.ok) process.exitCode = 1;
}

function isNotFound(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'ENOENT',
  );
}

/** Same local-mirror cleanup as `npm run order -- delete`: try every status
 * folder; ENOENT is expected for folders the order was never in. */
async function removeOrderMirrorFiles(orderNumber: string): Promise<number> {
  let deleted = 0;
  for (const status of ORDER_STATUSES) {
    try {
      await unlink(join(orderRoot, status, `${orderNumber}.json`));
      deleted++;
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  return deleted;
}

async function runDelete(apiBaseUrl: string, opsToken: string, args: DeleteArgs): Promise<void> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}/operation/accounts/${encodeURIComponent(args.idOrEmail)}`, {
    method: 'DELETE',
    headers: { ...opsRequestHeaders(opsToken), 'content-type': 'application/json' },
    body: JSON.stringify({ deleteOrders: args.deleteOrders }),
  });
  const body = (await res.json().catch(() => undefined)) as
    | {
        success: true;
        userId: string;
        email: string;
        orphanedOrders: number;
        deletedOrders: number;
        orderNumbers: string[];
      }
    | { success: false; error: unknown }
    | undefined;

  let mirrorDeletedFiles = 0;
  if (res.ok && body && 'success' in body && body.success && args.deleteOrders) {
    for (const orderNumber of body.orderNumbers) {
      mirrorDeletedFiles += await removeOrderMirrorFiles(orderNumber);
    }
  }

  if (args.json) {
    printJson({
      command: 'delete',
      status: res.status,
      ok: res.ok,
      body,
      mirror: args.deleteOrders ? { deletedFiles: mirrorDeletedFiles } : undefined,
    });
  } else {
    console.log(`[user] delete ${res.status}`, body);
    if (res.ok && args.deleteOrders) {
      console.log(`[user] mirror: removed ${mirrorDeletedFiles} local order file(s).`);
    }
  }
  if (!res.ok) process.exitCode = 1;
}

async function runMain(args: ListArgs | WriteArgs | DeleteArgs): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in .env/.public.env or .env/${args.mode}/.public.env`);
  const opsToken = loadOpsToken(root, args.mode);
  if (!opsToken) fail(`OPS_TOKEN not found in .env/.private.env or .env/${args.mode}/.private.env`);

  log(args.json, `[user] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);
  if (args.command === 'list') await runList(apiBaseUrl, opsToken, args);
  else if (args.command === 'delete') await runDelete(apiBaseUrl, opsToken, args);
  else await runWrite(apiBaseUrl, opsToken, args);
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[user] failed', error);
    process.exitCode = 1;
  }
}

addCommonOptions(program.command('list'))
  .description('List users with filters/sorting.')
  .option('--from <val>', 'index, relative day count ("5d"), or date (YYYY-MM-DD) — recent boundary')
  .option('--to <val>', 'index, relative day count ("5d"), or date (YYYY-MM-DD) — older boundary')
  .option('--limit <n>', 'cap the result count (cannot combine with an index --from/--to range)')
  .option('--search <exact-email>', 'exact email match (via email_lookup HMAC), not a substring')
  .option('--ip <address>', 'filter by IP address')
  .option('--created-after <val>', 'date (YYYY-MM-DD) or relative day count')
  .option('--created-before <val>', 'date (YYYY-MM-DD) or relative day count')
  .option('--locked', 'only locked accounts')
  .option('--with-orders', 'only accounts with at least one order')
  .option('--never-ordered', 'only accounts that never ordered')
  .addOption(
    new Option('--sort <sort>', 'sort order').choices(SORTS).default('last-connected' satisfies Sort),
  )
  .action((opts: ListOpts) => runAction(() => runMain(buildListArgs(opts))));

interface LockOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
  reason?: string;
}

function addWriteCommand(name: 'lock' | 'unlock', description: string): void {
  const command = addConfirmOption(addCommonOptions(program.command(name)))
    .description(description)
    .argument('<id-or-email>', 'account id or email');
  if (name === 'lock') {
    command.option('--reason <text>', 'lock reason stored for administrators (3–500 characters)');
  }
  command.action((idOrEmail: string, opts: LockOpts) => {
    requireConfirmForProdWrite(opts.mode, opts.confirm, fail, name);
    return runAction(() =>
      runMain({
        command: name,
        idOrEmail,
        reason: opts.reason,
        json: Boolean(opts.json),
        mode: opts.mode,
      }),
    );
  });
}

addWriteCommand('lock', 'Lock an account (e.g. suspicious activity spotted directly).');
addWriteCommand('unlock', "Unlock an account (reverses a lock or the customer's own self-lock).");

addConfirmOption(addCommonOptions(program.command('set-role')))
  .description('Assign the application role used by the signed-in admin dashboard.')
  .argument('<id-or-email>', 'account id or email')
  .argument('<role>', 'role code: user, super-admin, or a staff role such as preparator')
  .action((idOrEmail: string, role: string, opts: LockOpts) => {
    if (!/^[a-z][a-z0-9_-]{1,63}$/.test(role))
      fail('role must be a role code such as "user", "super-admin" or "preparator".');
    requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'set-role');
    return runAction(() =>
      runMain({ command: 'set-role', idOrEmail, role, json: Boolean(opts.json), mode: opts.mode }),
    );
  });

interface DeleteOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
  deleteOrders?: boolean;
}

addConfirmOption(addCommonOptions(program.command('delete')))
  .description(
    'Hard-delete an account immediately (skips grace period). Orphans orders by default; --delete-orders wipes them.',
  )
  .argument('<id-or-email>', 'account id or email')
  .option('--delete-orders', "permanently delete the account's orders instead of orphaning them")
  .action((idOrEmail: string, opts: DeleteOpts) => {
    requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
    return runAction(() =>
      runMain({
        command: 'delete',
        idOrEmail,
        deleteOrders: Boolean(opts.deleteOrders),
        json: Boolean(opts.json),
        mode: opts.mode,
      }),
    );
  });

program.parse();
