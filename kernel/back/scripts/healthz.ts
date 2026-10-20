/** Quick reachability check for any target's /healthz — no auth needed
 * (see server.ts), just a fast way to check "is the Node app actually up"
 * without remembering/typing the URL for each target by hand.
 *
 * Usage:
 *   npm run healthz -- [--json] --dev|--preprod|--prod
 *
 * --json: prints one JSON object to stdout instead of the human-readable
 * line — safe to pipe into `jq`, a file, or another script.
 */
import { Command } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, makeFail, resolveModeFromOpts } from './cliCommon.js';
import { loadApiBaseUrl } from './envFile.js';
import type { Mode } from './envFile.js';
import { printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const program = new Command();
addCommonOptions(program).name('healthz').description("Quick reachability check for a target's /healthz.");
const fail: (message: string) => never = makeFail(program, 'healthz');

async function main(): Promise<void> {
  program.parse();
  const opts = program.opts();
  let mode: Mode;
  try {
    mode = resolveModeFromOpts(opts);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  const json = Boolean(opts.json);
  const apiBaseUrl = loadApiBaseUrl(root, mode);
  if (!apiBaseUrl) fail(`URL_API_BASE not found in kernel JSON for ${mode} (http.apiBaseUrl).`);

  const startedAt = Date.now();
  try {
    const res = await fetch(`${apiBaseUrl}/healthz`);
    const elapsedMs = Date.now() - startedAt;
    const body: unknown = await res.json().catch(() => undefined);
    if (json) {
      printJson({ mode, ok: res.ok, status: res.status, elapsedMs, body });
    } else {
      console.log(`[healthz] mode=${mode} api=${apiBaseUrl} -> ${res.status} (${elapsedMs}ms)`, body ?? '');
    }
    if (!res.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) {
      printJson({ mode, ok: false, status: null, elapsedMs: Date.now() - startedAt, error: message });
    } else {
      console.error(`[healthz] mode=${mode} api=${apiBaseUrl} -> unreachable:`, message);
    }
    process.exitCode = 1;
  }
}

main();
