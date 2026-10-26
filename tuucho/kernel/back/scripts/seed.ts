/** Aggregate catalogue/configuration seed.
 *
 * Usage:
 *   npm run seed -- [--ssh|--ftp] [--update] [--delete] [--direction local|remote]
 *     [--confirm] [--json] --dev|--preprod|--prod
 *
 * Runs, in order: library, library-user, courier, accessory, cart-rule,
 * payment-method, payment-method-countries, sign-in-method.
 * Library, user library, and accessory read tuucho-ecom/sample. Custom-set
 * (library-nail) stays out of this command. On --dev, unowned user-library
 * products are then attached to the sole super-admin.
 * Catalogue imports receive --update/--delete/direction. In local direction,
 * cart-rule, payment-method, payment-method-countries, and sign-in-method
 * are explicitly skipped because none has a reverse source.
 * Loyalty and gift are not seeded: both are always on. Extra catalogue
 * families belong to plugins, not this seed.
 *
 * --confirm is required only when targeting --prod with --direction remote
 * (the DB-mutating direction) — never for --dev/--preprod, and never for
 * --direction local (which only reads the target DB into local files, same
 * as each child seeder's own policy). When required and given, it's
 * forwarded to every child seed call so they don't each independently fail
 * re-demanding it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeFlag } from './cliCommon.js';
import { printJson } from './cliOutput.js';
import { isValidMode, type Mode } from './envFile.js';
import { parseTransportFlags, requireTransport, transportFlags, type Transport } from './transport.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sampleRoot = join(root, '..', '..', '..', 'sample');
const userLibrarySource = join(sampleRoot, 'product', 'library-user');
const accessorySource = join(sampleRoot, 'product', 'accessory');

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
  console.error(`[seed] ${message}`);
  console.error(
    '  npm run seed -- [--ssh|--ftp] [--update] [--delete] [--direction local|remote] [--confirm] [--json] --dev|--preprod|--prod',
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  let transport: Transport | undefined;
  let transportArgs: string[];
  try {
    ({ transport, rest: transportArgs } = parseTransportFlags(argv));
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
  // --dev needs no transport; every remote target must state one so a nested
  // command cannot silently fall back to SSH.
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
  console.error(`[seed] ${command}`);
  const result = spawnSync('npm', ['run', script, '--', ...args], {
    cwd: root,
    // withOpsTunnel.ts already opened one connection for this seed process
    // itself (PAM_OPS_API_BASE_URL/PAM_OPS_TOKEN/PAM_OPS_TRANSPORT are
    // already in process.env) — PAM_OPS_REUSE tells each child's own
    // withOpsTunnel.ts wrapper to reuse it instead of opening its own SSH
    // tunnel or repeating the FTP gateway health check. Same pattern
    // operation.ts's runAggregateSeed already uses.
    env: { ...process.env, PAM_OPS_REUSE: '1' },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: json ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) fail(`${script} failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`${script} failed (exit ${result.status ?? 'signal'}).`);
  return json ? parseChildJson(script, result.stdout ?? '') : undefined;
}

function isSkipped(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'skipped' in value;
}

function runAssignSampleUserLibrary(): void {
  console.error('[seed] npx tsx scripts/assignSampleUserLibrary.ts');
  const result = spawnSync('npx', ['tsx', 'scripts/assignSampleUserLibrary.ts'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) fail(`assign sample user library failed to start: ${result.error.message}`);
  if (result.status !== 0) fail(`assign sample user library failed (exit ${result.status ?? 'signal'}).`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const common = [...transportFlags(args.transport), modeFlag(args.mode)];
  if (args.json) common.push('--json');
  if (args.confirm) common.push('--confirm');
  const synchronized = [...(args.update ? ['--update'] : []), ...(args.deleteMissing ? ['--delete'] : [])];
  const directional = [...synchronized, '--direction', args.direction, ...common];

  const library = runChild('library', ['seed', ...directional], args.json);
  const userLibrary =
    args.direction !== 'remote'
      ? { skipped: true, reason: 'local direction is not implemented for this command' }
      : existsSync(userLibrarySource)
        ? runChild('library', ['seed', '--source', userLibrarySource, ...directional], args.json)
        : { skipped: true, reason: 'sample user library is missing' };
  if (args.mode === 'dev' && args.direction === 'remote' && !isSkipped(userLibrary)) {
    runAssignSampleUserLibrary();
  }
  const accessory = existsSync(accessorySource)
    ? runChild('accessory', ['seed', '--source', accessorySource, ...directional], args.json)
    : { skipped: true, reason: 'sample accessory catalog is missing' };

  const results: Record<string, unknown> = {
    library,
    userLibrary,
    libraryNail: { skipped: true, reason: 'Custom-set / library-nail is not part of a generic first install' },
    courier: runChild('courier', ['seed', ...directional], args.json),
    ...(args.direction === 'remote'
      ? { courierLiveState: runChild('courier-live-state', ['seed', ...common], args.json) }
      : {
          courierLiveState: { skipped: true, reason: 'local direction is not implemented for this command' },
        }),
    accessory,
  };
  if (args.direction === 'remote') {
    results.cartRule = runChild('cart-rule', ['seed', ...common], args.json);
    results.paymentMethod = runChild('payment-method', ['seed', ...common], args.json);
    results.paymentMethodCountries = runChild('payment-method-countries', ['seed', ...common], args.json);
    results.signInMethod = runChild('sign-in-method', ['seed', ...common], args.json);
  } else {
    const reason = 'local direction is not implemented for this command';
    console.error(`[seed] cart-rule skipped: ${reason}.`);
    results.cartRule = { skipped: true, reason };
    console.error(`[seed] payment-method skipped: ${reason}.`);
    results.paymentMethod = { skipped: true, reason };
    console.error(`[seed] payment-method-countries skipped: ${reason}.`);
    results.paymentMethodCountries = { skipped: true, reason };
    console.error(`[seed] sign-in-method skipped: ${reason}.`);
    results.signInMethod = { skipped: true, reason };
  }

  if (args.json) {
    printJson({
      command: 'seed',
      mode: args.mode,
      direction: args.direction,
      update: args.update,
      delete: args.deleteMissing,
      results,
    });
  } else {
    console.log(
      args.direction === 'remote'
        ? '[seed] library, user library, courier, courier-live-state, accessory, cart-rule, payment-method, payment-method-countries, and sign-in-method completed. Custom-set import stays out of this command.'
        : '[seed] library, courier, and accessory completed. User library, custom sets, courier-live-state, cart-rule, payment-method, payment-method-countries, and sign-in-method were skipped.',
    );
  }
}

main();
