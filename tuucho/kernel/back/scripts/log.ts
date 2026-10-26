/**
 * Read protected server logs for any target.
 *
 *   npm run log -- read --api --dev
 *   npm run log -- read --email --dev
 *   npm run log -- read --cron-shipment --prod
 *   npm run log -- download --preprod --follow
 *   npm run log -- clear --api|--email|--cron-shipment [--confirm] --dev|--preprod|--prod
 *
 * --confirm is required on clear only when targeting --prod — never for
 * --dev/--preprod. read/download only read the target (download just
 * mirrors what it read into local files) and never need it.
 */
import { Command as Program } from 'commander';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { inspect } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addConfirmOption, addTargetOptions, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';
import { outputRoot } from '../src/config/shopPaths.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type LogKind =
  | 'api'
  | 'email'
  | 'cron-shipment'
  | 'cron-account-deletion'
  | 'cron-guest-saved-cleanup'
  | 'cron-loyalty'
  | 'cron-gift'
  | 'cron-gift-purge'
  | 'cron-payment-auth-expiry'
  | 'cron-warm';

interface Args {
  mode: Mode;
  lines: number;
  follow: boolean;
  action: 'read' | 'download' | 'clear' | 'errors';
  kind: LogKind;
  /** `errors` only: ignore records older than this ISO instant. */
  since?: string;
  json?: boolean;
}

interface ApiLogRecord {
  at: string;
  target: string;
  request: { method: string; path: string; query: unknown; headers: unknown; body: unknown };
  response: { status: number; headers: unknown; body: unknown };
  durationMs: number;
}

const program = new Program();
program.name('log').description('Read protected server logs for any target.');
const fail: (message: string) => never = makeFail(program, 'log');

function addModeOption(command: Program): Program {
  return addTargetOptions(command);
}

function parseLines(raw: string): number {
  const lines = Number(raw);
  if (!Number.isSafeInteger(lines) || lines < 1 || lines > 500)
    fail('--lines must be an integer from 1 to 500.');
  return lines;
}

function logEndpoint(kind: LogKind): string {
  return kind;
}

function logUnavailableMessage(kind: LogKind, status: number): string {
  if (status === 404) {
    if (kind === 'api') return 'API logging is disabled for this mode.';
    if (kind === 'email') return 'E-mail logging is disabled for this mode.';
    return 'Cron logging is unavailable for this mode.';
  }
  if (status === 403) {
    if (kind === 'api') return 'API log access is disabled (admin preference).';
    if (kind === 'email') return 'E-mail log access is disabled (admin preference).';
    if (kind === 'cron-shipment') return 'Shipment cron log is disabled (admin preference).';
    if (kind === 'cron-account-deletion') return 'Account-deletion cron log is disabled (admin preference).';
    if (kind === 'cron-guest-saved-cleanup') {
      return 'Guest-saved-cleanup cron log is disabled (admin preference).';
    }
    if (kind === 'cron-loyalty') return 'Loyalty cron log is disabled (admin preference).';
    if (kind === 'cron-gift') return 'Gift cron log is disabled (admin preference).';
    if (kind === 'cron-gift-purge') return 'Gift-purge cron log is disabled (admin preference).';
    if (kind === 'cron-payment-auth-expiry') {
      return 'Payment-auth-expiry-spy cron log is disabled (admin preference).';
    }
    if (kind === 'cron-warm') return 'Keep-warm cron log is disabled (admin preference).';
    return 'Cron log is disabled (admin preference).';
  }
  return `log endpoint returned HTTP ${status}`;
}

async function getLines(
  apiBaseUrl: string,
  opsToken: string,
  lines: number,
  kind: Args['kind'],
): Promise<string[]> {
  const endpoint = logEndpoint(kind);
  const response = await fetch(`${apiBaseUrl}/operation/log/${endpoint}?lines=${lines}`, {
    headers: { authorization: `Bearer ${opsToken}`, accept: 'application/json' },
  });
  const body = (await response.json().catch(() => undefined)) as
    { success?: boolean; data?: { lines?: string[] } } | undefined;
  if (!response.ok || body?.success !== true || !body.data?.lines) {
    throw new Error(logUnavailableMessage(kind, response.status));
  }
  return body.data.lines;
}

async function clearLogs(apiBaseUrl: string, opsToken: string, kind: Args['kind']): Promise<number> {
  const endpoint = logEndpoint(kind);
  const response = await fetch(`${apiBaseUrl}/operation/log/${endpoint}/clear`, {
    method: 'POST',
    headers: { authorization: `Bearer ${opsToken}`, accept: 'application/json' },
  });
  const body = (await response.json().catch(() => undefined)) as
    | {
        success?: boolean;
        data?: { clearedFiles?: number };
      }
    | undefined;
  if (!response.ok || body?.success !== true || body.data?.clearedFiles === undefined) {
    throw new Error(logUnavailableMessage(kind, response.status).replace('log endpoint', 'clear endpoint'));
  }
  return body.data.clearedFiles;
}

function prettyValue(value: unknown): string[] {
  return inspect(value, {
    colors: Boolean(process.stdout.isTTY),
    compact: 3,
    depth: null,
    maxArrayLength: null,
    maxStringLength: null,
    breakLength: 108,
  }).split('\n');
}

function printField(label: string, value: unknown): void {
  const [first = '', ...rest] = prettyValue(value);
  const prefix = `│   ${label}: `;
  console.log(`${prefix}${first}`);
  const continuation = `│   ${' '.repeat(label.length + 2)}`;
  for (const line of rest) console.log(`${continuation}${line}`);
}

function printRecord(raw: string): void {
  let record: ApiLogRecord;
  try {
    record = JSON.parse(raw) as ApiLogRecord;
  } catch {
    console.log('\n┌─ API log record (invalid NDJSON)');
    console.log(`│ ${raw}`);
    console.log('└────────────────────────────────────────────────────────────────────────────');
    return;
  }
  const elapsed = Number.isFinite(record.durationMs) ? `${record.durationMs.toFixed(1)} ms` : '—';
  console.log(`\n┌─ ${record.at}  ·  ${record.target}  ·  ${record.response.status}  ·  ${elapsed}`);
  console.log(`│ ${record.request.method} ${record.request.path}`);
  console.log('│');
  console.log('│ Request');
  printField('query', record.request.query);
  printField('headers', record.request.headers);
  printField('body', record.request.body);
  console.log('│');
  console.log('│ Response');
  printField('headers', record.response.headers);
  printField('body', record.response.body);
  console.log('└────────────────────────────────────────────────────────────────────────────');
}

function printEmailRecord(raw: string): void {
  let record: {
    at?: string;
    target?: string;
    outcome?: string;
    channel?: string;
    kind?: string;
    to?: string;
    from?: string | null;
    subject?: string;
    text?: string;
    error?: string | null;
  };
  try {
    record = JSON.parse(raw) as typeof record;
  } catch {
    console.log(raw);
    return;
  }
  console.log(
    `\n┌─ ${record.at ?? ''}  ·  ${record.target ?? ''}  ·  ${record.outcome ?? ''}  ·  ${record.kind ?? ''}  ·  ${record.channel ?? ''}`,
  );
  console.log(`│ to: ${record.to ?? ''}`);
  if (record.from) console.log(`│ from: ${record.from}`);
  console.log(`│ ${record.subject ?? ''}`);
  if (record.error) console.log(`│ error: ${record.error}`);
  if (record.text) console.log(`│ ${record.text}`);
  console.log('└────────────────────────────────────────────────────────────────────────────');
}

function printRecords(lines: string[], kind: Args['kind']): void {
  if (lines.length === 0) {
    if (kind === 'api') console.log('[log] No API records yet.');
    else if (kind === 'email') console.log('[log] No e-mail records yet.');
    else console.log(`[log] No ${kind} records yet.`);
    return;
  }
  if (kind === 'email') {
    for (const line of lines) printEmailRecord(line);
    return;
  }
  if (kind !== 'api') {
    for (const line of lines) console.log(line);
    return;
  }
  for (const line of lines) printRecord(line);
}

/** The API log grouped by what went wrong, newest example each.
 *
 * Reading the raw tail costs a page of NDJSON to answer "did my change break
 * anything", which is the question asked most often and the one the dev loop
 * gives no other way to answer: `tsx watch` reloads silently and the error
 * lands in a terminal the agent does not own. */
function printErrorSummary(lines: string[], since: string | undefined, asJson: boolean): void {
  type Group = { status: number; code: string; route: string; count: number; last: string; example: string };
  const groups = new Map<string, Group>();
  let considered = 0;

  for (const line of lines) {
    let record: ApiLogRecord;
    try {
      record = JSON.parse(line) as ApiLogRecord;
    } catch {
      continue;
    }
    if (since && record.at < since) continue;
    considered += 1;
    if (record.response.status < 400) continue;
    const body = record.response.body as { error?: { code?: string } } | undefined;
    const code = body?.error?.code ?? '(no code)';
    // The path with its identifiers removed, so one broken route groups as one
    // problem rather than as one line per order id.
    const route = `${record.request.method} ${record.request.path
      .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, '/:id')
      .replace(/\/[0-9a-f]{32,}/gi, '/:token')
      .replace(/\/\d+/g, '/:n')}`;
    const key = `${record.response.status} ${code} ${route}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (record.at > existing.last) {
        existing.last = record.at;
        existing.example = line;
      }
    } else {
      groups.set(key, {
        status: record.response.status,
        code,
        route,
        count: 1,
        last: record.at,
        example: line,
      });
    }
  }

  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          considered,
          since: since ?? null,
          groups: ranked.map(({ example, ...rest }) => ({ ...rest, example: JSON.parse(example) })),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (ranked.length === 0) {
    console.log(
      `[log] No failures in the last ${considered} record${considered === 1 ? '' : 's'}${since ? ` since ${since}` : ''}.`,
    );
    return;
  }

  console.log(
    `[log] ${ranked.length} distinct failure${ranked.length === 1 ? '' : 's'} in ${considered} record${considered === 1 ? '' : 's'}${since ? ` since ${since}` : ''}:\n`,
  );
  for (const group of ranked) {
    console.log(
      `  ${String(group.count).padStart(4)}x  ${group.status}  ${group.code.padEnd(28)}  ${group.route}`,
    );
    console.log(`        last ${group.last}`);
  }
  console.log('\n  `npm run log -- read --api --dev` for the full records.');
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function createDownload(mode: Mode, kind: Args['kind'], lines: string[]): Promise<string> {
  const directory = join(outputRoot(), 'log', mode);
  const path = join(directory, `${kind}-${timestampForFile()}.jsonl`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path, lines.length > 0 ? `${lines.join('\n')}\n` : '', { encoding: 'utf8', mode: 0o600 });
  console.log(`[log] Downloaded ${lines.length} record${lines.length === 1 ? '' : 's'} to ${path}`);
  return path;
}

async function appendDownload(path: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  await appendFile(path, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for ${args.mode}.`);
  if (!opsToken) fail(`OPS_TOKEN missing for ${args.mode}.`);
  if (args.action === 'clear') {
    const clearedFiles = await clearLogs(apiBaseUrl, opsToken, args.kind);
    console.log(
      `[log] Cleared ${clearedFiles} ${args.kind} server log file${clearedFiles === 1 ? '' : 's'} for ${args.mode}.`,
    );
    return;
  }
  let previousTail: string[] = [];
  const updatesFrom = (lines: string[]): string[] => {
    // The endpoint returns a moving tail, so find the largest overlap between
    // the previous tail and the next one. This preserves legitimately
    // identical records instead of globally de-duplicating by their text.
    let overlap = 0;
    const maxOverlap = Math.min(previousTail.length, lines.length);
    for (let candidate = maxOverlap; candidate > 0; candidate -= 1) {
      if (previousTail.slice(-candidate).every((line, index) => line === lines[index])) {
        overlap = candidate;
        break;
      }
    }
    previousTail = lines;
    return lines.slice(overlap);
  };
  const initial = await getLines(apiBaseUrl, opsToken, args.lines, args.kind);
  previousTail = initial;
  const downloadPath =
    args.action === 'download' ? await createDownload(args.mode, args.kind, initial) : undefined;
  if (args.action === 'read') printRecords(initial, args.kind);
  if (args.action === 'errors') {
    printErrorSummary(initial, args.since, Boolean(args.json));
    if (!args.follow) return;
  }
  if (!args.follow) return;
  while (true) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    const updates = updatesFrom(await getLines(apiBaseUrl, opsToken, args.lines, args.kind));
    if (args.action === 'read') printRecords(updates, args.kind);
    if (args.action === 'errors') printErrorSummary(updates, args.since, Boolean(args.json));
    if (downloadPath) await appendDownload(downloadPath, updates);
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error('[log]', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

interface ReadOpts {
  mode: Mode;
  lines?: number;
  follow?: boolean;
  api?: boolean;
  email?: boolean;
  cronShipment?: boolean;
  cronAccountDeletion?: boolean;
  cronGuestSavedCleanup?: boolean;
  cronLoyalty?: boolean;
  cronGift?: boolean;
  cronGiftPurge?: boolean;
  cronPaymentAuthExpiry?: boolean;
  cronWarm?: boolean;
}

function selectedKinds(opts: {
  api?: boolean;
  email?: boolean;
  cronShipment?: boolean;
  cronAccountDeletion?: boolean;
  cronGuestSavedCleanup?: boolean;
  cronLoyalty?: boolean;
  cronGift?: boolean;
  cronGiftPurge?: boolean;
  cronPaymentAuthExpiry?: boolean;
  cronWarm?: boolean;
}): LogKind[] {
  const kinds: LogKind[] = [];
  if (opts.api) kinds.push('api');
  if (opts.email) kinds.push('email');
  if (opts.cronShipment) kinds.push('cron-shipment');
  if (opts.cronAccountDeletion) kinds.push('cron-account-deletion');
  if (opts.cronGuestSavedCleanup) kinds.push('cron-guest-saved-cleanup');
  if (opts.cronLoyalty) kinds.push('cron-loyalty');
  if (opts.cronGift) kinds.push('cron-gift');
  if (opts.cronGiftPurge) kinds.push('cron-gift-purge');
  if (opts.cronPaymentAuthExpiry) kinds.push('cron-payment-auth-expiry');
  if (opts.cronWarm) kinds.push('cron-warm');
  return kinds;
}

function readKind(opts: ReadOpts): LogKind {
  const kinds = selectedKinds(opts);
  if (kinds.length !== 1) {
    fail(
      'requires exactly one of --api, --email, --cron-shipment, --cron-account-deletion, --cron-guest-saved-cleanup, --cron-loyalty, --cron-gift, --cron-gift-purge, --cron-payment-auth-expiry, or --cron-warm.',
    );
  }
  return kinds[0]!;
}

function addReadLikeCommand(name: 'read' | 'download', description: string): void {
  addModeOption(program.command(name))
    .description(description)
    .option('--lines <n>', 'integer from 1 to 500 (default: 100)', parseLines)
    .option('--follow', 'keep polling and printing new records')
    .option('--api', 'select the API diagnostic log')
    .option('--email', 'select the sent e-mail journal')
    .option('--cron-shipment', 'select the shipment-tracking cron log')
    .option('--cron-account-deletion', 'select the account-deletion cron log')
    .option('--cron-guest-saved-cleanup', 'select the guest-saved-cleanup cron log')
    .option('--cron-loyalty', 'select the loyalty cron log')
    .option('--cron-gift', 'select the gift cron log')
    .option('--cron-gift-purge', 'select the gift-purge cron log')
    .option('--cron-payment-auth-expiry', 'select the payment-auth-expiry-spy cron log')
    .option('--cron-warm', 'select the keep-warm cron failure log')
    .action((opts: ReadOpts) =>
      runAction(() =>
        runMain({
          mode: opts.mode,
          lines: opts.lines ?? 100,
          follow: Boolean(opts.follow),
          action: name,
          kind: readKind(opts),
        }),
      ),
    );
}
addReadLikeCommand('read', 'Print selected server-log records to the console.');

addModeOption(program.command('errors'))
  .description('Group the API log by failure (status + error code + route) instead of printing it.')
  .option('--lines <n>', 'integer from 1 to 500 (default: 500)', parseLines)
  .option('--since <iso>', 'ignore records older than this ISO instant')
  .option('--follow', 'keep polling and summarizing new records')
  .option('--json', 'emit the grouping as JSON')
  .action((opts: { mode: Mode; lines?: number; since?: string; follow?: boolean; json?: boolean }) =>
    runAction(() => {
      if (opts.since !== undefined && Number.isNaN(Date.parse(opts.since))) {
        fail('--since must be an ISO instant, for example 2026-09-11T14:00:00Z.');
      }
      return runMain({
        mode: opts.mode,
        lines: opts.lines ?? 500,
        follow: Boolean(opts.follow),
        action: 'errors',
        kind: 'api',
        since: opts.since === undefined ? undefined : new Date(opts.since).toISOString(),
        json: Boolean(opts.json),
      });
    }),
  );
addReadLikeCommand('download', 'Save selected server-log records to <outputDir>/log/<mode>/.');

interface ClearOpts {
  mode: Mode;
  confirm?: boolean;
  api?: boolean;
  email?: boolean;
  cronShipment?: boolean;
  cronAccountDeletion?: boolean;
  cronGuestSavedCleanup?: boolean;
  cronLoyalty?: boolean;
  cronGift?: boolean;
  cronGiftPurge?: boolean;
  cronPaymentAuthExpiry?: boolean;
  cronWarm?: boolean;
}

function clearKind(opts: ClearOpts): LogKind {
  const kinds = selectedKinds(opts);
  if (kinds.length > 1) {
    fail(
      'use only one of --api, --email, --cron-shipment, --cron-account-deletion, --cron-guest-saved-cleanup, --cron-loyalty, --cron-gift, --cron-gift-purge, --cron-payment-auth-expiry, or --cron-warm.',
    );
  }
  return kinds[0] ?? 'api';
}

addConfirmOption(addModeOption(program.command('clear')))
  .description('Clear selected server-side log files (API is the default).')
  .option('--api', 'select the API diagnostic log')
  .option('--email', 'select the sent e-mail journal')
  .option('--cron-shipment', 'select the shipment-tracking cron log')
  .option('--cron-account-deletion', 'select the account-deletion cron log')
  .option('--cron-guest-saved-cleanup', 'select the guest-saved-cleanup cron log')
  .option('--cron-loyalty', 'select the loyalty cron log')
  .option('--cron-gift', 'select the gift cron log')
  .option('--cron-gift-purge', 'select the gift-purge cron log')
  .option('--cron-payment-auth-expiry', 'select the payment-auth-expiry-spy cron log')
  .option('--cron-warm', 'select the keep-warm cron failure log')
  .action((opts: ClearOpts) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'clear');
      return runMain({ mode: opts.mode, lines: 100, follow: false, action: 'clear', kind: clearKind(opts) });
    }),
  );

program.parse();
