/** Loyalty programme numbers (read-only).
 *
 *   npm run loyalty -- check [--json] --dev|--preprod|--prod
 *
 * The programme is always on. Earn rate, lot life, and reminder spacing live
 * in `.env/.public.env` and are returned by the running process.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, makeFail } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type LoyaltySnapshot = {
  valuePer100: number;
  lotDurationMonths: number;
  burnNoticeWeeks: number;
  reminderIntervalDays: number;
};

type Args = {
  mode: Mode;
  json: boolean;
};

const program = new Program();
program.name('loyalty').description('Read loyalty programme numbers from the running API.');
const fail: (message: string) => never = makeFail(program, 'loyalty');

async function apiFetch(apiBaseUrl: string, opsToken: string): Promise<{ loyalty: LoyaltySnapshot }> {
  const response = await fetch(`${apiBaseUrl}/operation/loyalty`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`/operation/loyalty -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/loyalty -> ${response.status}: ${String(error)}`);
  }
  return parsed as { loyalty: LoyaltySnapshot };
}

function printSnapshot(json: boolean, loyalty: LoyaltySnapshot): void {
  log(json, '[loyalty] check');
  logTable(json, [
    { key: 'valuePer100', value: loyalty.valuePer100 },
    { key: 'lotDurationMonths', value: loyalty.lotDurationMonths },
    { key: 'burnNoticeWeeks', value: loyalty.burnNoticeWeeks },
    { key: 'reminderIntervalDays', value: loyalty.reminderIntervalDays },
  ]);
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[loyalty] command=check mode=${args.mode} api=${apiBaseUrl}`);
  const { loyalty } = await apiFetch(apiBaseUrl, opsToken);
  printSnapshot(args.json, loyalty);
  if (args.json) printJson({ success: true, loyalty });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[loyalty] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read loyalty programme numbers from the running API.')
  .action((opts: CommonModeOpts) => runAction(() => runMain({ mode: opts.mode, json: Boolean(opts.json) })));

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`[loyalty] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
