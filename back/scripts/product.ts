/** Aggregate product catalogue seed.
 *
 * Usage:
 *   npm run product -- seed [--ssh|--ftp] [--update] [--delete]
 *     [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod
 *
 * Runs, in order: library, library-nail, library-user, accessory.
 * Shared vocabulary is seeded by library, so it always runs first.
 * library-nail and library-user have no local pull: in local direction they
 * are skipped and library plus accessory still run.
 *
 * --confirm is required only when targeting --prod with --direction remote.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeFlag } from './cliCommon.js';
import { printJson } from './cliOutput.js';
import { isValidMode, type Mode } from './envFile.js';
import { parseTransportFlags, requireTransport, transportFlags, type Transport } from './transport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Args {
  mode: Mode;
  update: boolean;
  deleteMissing: boolean;
  direction: 'local' | 'remote';
  confirm: boolean;
  json: boolean;
  /** undefined only for --dev, which never leaves this machine. */
  transport: Transport | undefined;
}

function fail(message: string): never {
  console.error(`[product] ${message}`);
  console.error(
    '  npm run product -- seed [--ssh|--ftp] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod',
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  if (argv[0] !== 'seed') fail('the only subcommand is seed.');
  let transport: Transport | undefined;
  let transportArgs: string[];
  try {
    ({ transport, rest: transportArgs } = parseTransportFlags(argv.slice(1)));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  let mode: Mode | undefined;
  let update = false;
  let deleteMissing = false;
  let direction = 'remote';
  let confirm = false;
  let json = false;
  let targetCount = 0;

  for (let index = 0; index < transportArgs.length; index++) {
    const token = transportArgs[index]!;
    if (token === '--update') update = true;
    else if (token === '--delete') deleteMissing = true;
    else if (token === '--confirm') confirm = true;
    else if (token === '--json') json = true;
    else if (token === '--mode') fail('`--mode` is no longer accepted; use --dev, --preprod, or --prod');
    else if (token === '--dev' || token === '--preprod' || token === '--prod') {
      targetCount += 1;
      mode = token.slice(2) as Mode;
    } else if (token === '--direction') direction = transportArgs[++index] ?? '';
    else fail(`unknown argument "${token}".`);
  }

  if (targetCount === 0) fail('exactly one of --dev, --preprod, --prod is required');
  if (targetCount > 1) fail('only one of --dev, --preprod, --prod is allowed');
  if (!mode || !isValidMode(mode)) fail('exactly one of --dev, --preprod, --prod is required');
  if (mode !== 'dev') {
    try {
      requireTransport(transport, mode);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }
  if (direction !== 'local' && direction !== 'remote') fail('--direction must be local or remote.');
  if (deleteMissing && !update) fail('--delete requires --update.');
  if (mode === 'prod' && direction === 'remote' && !confirm) {
    fail('seed requires --confirm when targeting --prod with --direction remote.');
  }
  return {
    mode,
    update,
    deleteMissing,
    direction,
    confirm,
    json,
    transport,
  };
}

function parseChildJson(script: string, stdout: string): unknown {
  const start = stdout.indexOf('{');
  if (start < 0) fail(`${script} returned no JSON result.`);
  try {
    return JSON.parse(stdout.slice(start)) as unknown;
  } catch (error) {
    fail(`${script} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

function runChild(script: string, args: string[], json: boolean): unknown {
  const command = `npm run ${script} -- ${args.join(' ')}`;
  console.error(`[product] ${command}`);
  const result = spawnSync('npm', ['run', script, '--', ...args], {
    cwd: root,
    env: { ...process.env, PAM_OPS_REUSE: '1' },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: json ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) fail(`${script} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${script} failed (exit ${result.status ?? 'signal'}).`);
  return json ? parseChildJson(script, result.stdout ?? '') : undefined;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const common = [...transportFlags(args.transport), modeFlag(args.mode)];
  if (args.json) common.push('--json');
  if (args.confirm) common.push('--confirm');
  const synchronized = [...(args.update ? ['--update'] : []), ...(args.deleteMissing ? ['--delete'] : [])];
  const directional = [...synchronized, '--direction', args.direction, ...common];
  const remoteOnly = args.direction === 'remote';
  const localSkip = {
    skipped: true,
    reason: 'local direction is not implemented for this command',
  };

  const results: Record<string, unknown> = {
    library: runChild('library', ['seed', ...directional], args.json),
  };
  if (remoteOnly) {
    results.libraryNail = runChild('library-nail', ['seed', ...directional], args.json);
    results.libraryUser = runChild('library-user', ['seed', ...directional], args.json);
  } else {
    console.error(`[product] library-nail skipped: ${localSkip.reason}.`);
    console.error(`[product] library-user skipped: ${localSkip.reason}.`);
    results.libraryNail = localSkip;
    results.libraryUser = { ...localSkip };
  }
  results.accessory = runChild('accessory', ['seed', ...directional], args.json);

  if (args.json) {
    printJson({
      command: 'product',
      subcommand: 'seed',
      mode: args.mode,
      direction: args.direction,
      update: args.update,
      delete: args.deleteMissing,
      results,
    });
  } else if (remoteOnly) {
    console.log('[product] library, library-nail, library-user, and accessory completed.');
  } else {
    console.log('[product] library and accessory completed; library-nail and library-user skipped.');
  }
}

main();
