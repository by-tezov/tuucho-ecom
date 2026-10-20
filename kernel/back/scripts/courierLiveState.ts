/** Apply shop-wide courier toggles and per-country open/closed rows from env.
 *
 *   npm run courier-live-state -- check [--json] --dev|--preprod|--prod
 *   npm run courier-live-state -- seed [--json] --dev|--preprod|--prod
 *
 * Reads `COURIER_LIVE_DEFAULTS` from the layered seed env. Run after
 * `npm run courier -- seed` so manager JSON owns structure and this command
 * applies predictable runtime availability (tests, dev defaults).
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, loadSeedEnv, type Mode } from './envFile.js';
import type { CourierLiveStateEntry } from '../src/modules/operations/application/courierLiveState.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type CourierLiveRow = {
  code: string;
  enabled: boolean;
  countries: Array<{ code: string; enabled: boolean }>;
};

type Args = {
  command: 'check' | 'seed';
  mode: Mode;
  json: boolean;
};

const program = new Program();
program
  .name('courier-live-state')
  .description('Apply COURIER_LIVE_DEFAULTS to shop-wide courier and per-country toggles.');
const fail: (message: string) => never = makeFail(program, 'courier-live-state');

/** `code=1:FR,BE|code=0:` — shop enabled flag then enabled country list. */
export function parseCourierLiveDefaults(raw: string | undefined): CourierLiveStateEntry[] {
  const text = raw?.trim();
  if (!text) {
    fail('COURIER_LIVE_DEFAULTS is missing or empty in sample/seed-defaults.env');
  }
  const entries: CourierLiveStateEntry[] = [];
  for (const segment of text!.split('|')) {
    const piece = segment.trim();
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq <= 0) fail(`invalid COURIER_LIVE_DEFAULTS segment ${JSON.stringify(piece)}`);
    const code = piece.slice(0, eq).trim();
    const rest = piece.slice(eq + 1);
    const colon = rest.indexOf(':');
    if (colon < 0)
      fail(
        `invalid COURIER_LIVE_DEFAULTS segment ${JSON.stringify(piece)} — expected code=enabled:countries`,
      );
    const enabledToken = rest.slice(0, colon).trim();
    if (enabledToken !== '0' && enabledToken !== '1' && enabledToken !== 'true' && enabledToken !== 'false') {
      fail(`invalid enabled flag in COURIER_LIVE_DEFAULTS segment ${JSON.stringify(piece)}`);
    }
    const enabled = enabledToken === '1' || enabledToken === 'true';
    const countriesRaw = rest.slice(colon + 1).trim();
    const enabledCountries =
      countriesRaw.length === 0
        ? []
        : countriesRaw.split(',').map((code) => {
            const upper = code.trim().toUpperCase();
            if (!/^[A-Z]{2}$/.test(upper)) {
              fail(`invalid country code ${JSON.stringify(code)} in COURIER_LIVE_DEFAULTS`);
            }
            return upper;
          });
    entries.push({ code, enabled, enabledCountries });
  }
  if (entries.length === 0) fail('COURIER_LIVE_DEFAULTS produced no courier entries');
  return entries;
}

function loadSeedDefaults(mode: Mode): CourierLiveStateEntry[] {
  const env = loadSeedEnv(root, mode);
  return parseCourierLiveDefaults(env.COURIER_LIVE_DEFAULTS);
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: 'GET' | 'PATCH',
  body?: { couriers: CourierLiveStateEntry[] },
): Promise<{ couriers: CourierLiveRow[] }> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const response = await fetch(`${apiBaseUrl}/operation/courier-live-state`, {
    method,
    headers: {
      ...opsRequestHeaders(opsToken),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `/operation/courier-live-state -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/courier-live-state -> ${response.status}: ${String(error)}`);
  }
  return parsed as { couriers: CourierLiveRow[] };
}

function printSnapshot(json: boolean, label: string, couriers: CourierLiveRow[]): void {
  log(json, `[courier-live-state] ${label}`);
  for (const courier of couriers) {
    const open = courier.countries.filter((entry) => entry.enabled).map((entry) => entry.code);
    logTable(json, [
      {
        code: courier.code,
        enabled: courier.enabled,
        openCountries: open.length > 0 ? open.join(',') : '(none)',
      },
    ]);
  }
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[courier-live-state] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);

  if (args.command === 'check') {
    const { couriers } = await apiFetch(apiBaseUrl, opsToken, 'GET');
    printSnapshot(args.json, 'check', couriers);
    if (args.json) printJson({ success: true, couriers });
    return;
  }

  const couriers = loadSeedDefaults(args.mode);
  const { couriers: applied } = await apiFetch(apiBaseUrl, opsToken, 'PATCH', { couriers });
  printSnapshot(args.json, 'seeded defaults', applied);
  if (args.json) printJson({ success: true, couriers: applied });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[courier-live-state] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read shop-wide courier and per-country toggles from the target DB.')
  .action((opts: CommonModeOpts) =>
    runAction(() => runMain({ command: 'check', mode: opts.mode, json: Boolean(opts.json) })),
  );

addConfirmOption(addCommonOptions(program.command('seed')))
  .description('Apply COURIER_LIVE_DEFAULTS from sample/seed-defaults.env after courier import.')
  .action((opts: CommonModeOpts) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      return runMain({ command: 'seed', mode: opts.mode, json: Boolean(opts.json) });
    }),
  );

const scriptPath = fileURLToPath(import.meta.url);
const invokedAsCli = process.argv.some((arg) => {
  if (arg === scriptPath) return true;
  try {
    return fileURLToPath(pathToFileURL(arg)) === scriptPath;
  } catch {
    return arg.endsWith('courierLiveState.ts');
  }
});
if (invokedAsCli) {
  void program.parseAsync(process.argv);
}
