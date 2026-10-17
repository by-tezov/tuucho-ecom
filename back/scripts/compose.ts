/** Compose-a-set status (read-only).
 *
 *   npm run compose -- check [--json] --dev|--preprod|--prod
 *
 * `enabled` follows the Boutique preference `composition_page_enabled` (default true).
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, makeFail } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, type Mode } from './envFile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type Args = {
  mode: Mode;
  json: boolean;
};

const program = new Program();
program.name('compose').description('Read compose-a-set status from the running API.');
const fail: (message: string) => never = makeFail(program, 'compose');

async function apiFetch(apiBaseUrl: string, opsToken: string): Promise<{ compose: { enabled: boolean } }> {
  const response = await fetch(`${apiBaseUrl}/operation/compose`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${opsToken}` },
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`/operation/compose -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/compose -> ${response.status}: ${String(error)}`);
  }
  return parsed as { compose: { enabled: boolean } };
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[compose] command=check mode=${args.mode} api=${apiBaseUrl}`);
  const { compose } = await apiFetch(apiBaseUrl, opsToken);
  log(args.json, '[compose] check');
  logTable(args.json, [{ key: 'enabled', value: compose.enabled }]);
  if (args.json) printJson({ success: true, compose });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[compose] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read compose-a-set status from the running API. Follows the composition page preference.')
  .action((opts: CommonModeOpts) => runAction(() => runMain({ mode: opts.mode, json: Boolean(opts.json) })));

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`[compose] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
