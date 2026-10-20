/** Gift-offer programme numbers (read-only).
 *
 *   npm run gift -- check [--json] --dev|--preprod|--prod
 *
 * New offers are always accepted. TTLs and ceilings live in
 * tuucho-commerce-gift plugin settings and are returned by the running process.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, makeFail } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type GiftSnapshot = {
  maxBudgetCeiling: number;
  maxAccessoryBudgetCeiling: number;
};

type Args = {
  mode: Mode;
  json: boolean;
};

const program = new Program();
program.name('gift').description('Read gift programme numbers from the running API.');
const fail: (message: string) => never = makeFail(program, 'gift');

async function apiFetch(apiBaseUrl: string, opsToken: string): Promise<{ settings: GiftSnapshot }> {
  const response = await fetch(`${apiBaseUrl}/operation/gift`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`/operation/gift -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/gift -> ${response.status}: ${String(error)}`);
  }
  return parsed as { settings: GiftSnapshot };
}

function printSnapshot(json: boolean, settings: GiftSnapshot): void {
  log(json, '[gift] check');
  logTable(json, [
    { key: 'maxBudgetCeiling', value: settings.maxBudgetCeiling },
    { key: 'maxAccessoryBudgetCeiling', value: settings.maxAccessoryBudgetCeiling },
  ]);
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[gift] command=check mode=${args.mode} api=${apiBaseUrl}`);
  const { settings } = await apiFetch(apiBaseUrl, opsToken);
  printSnapshot(args.json, settings);
  if (args.json) printJson({ success: true, settings });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[gift] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read gift programme numbers from the running API.')
  .action((opts: CommonModeOpts) => runAction(() => runMain({ mode: opts.mode, json: Boolean(opts.json) })));

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`[gift] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
