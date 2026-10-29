/** Shop-wide third-party sign-in OPS CLI (no OAuth credentials mutated).
 *
 *   npm run sign-in-method -- check [--json] --dev|--preprod|--prod
 *   npm run sign-in-method -- seed [--json] --dev|--preprod|--prod
 *   npm run sign-in-method -- enable|disable <google|facebook|apple|all>
 *     [--json] --dev|--preprod|--prod
 *
 * `seed` applies the SIGN_IN_*_ENABLED and SIGN_IN_*_VERBOSE_ENABLED defaults
 * from `tuucho/sample/seed-defaults.env`.
 * Email + password / OTP are never gated by these flags. `enable`/`disable`
 * only flip provider availability, not the verbose create/link flow.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, loadSeedEnv, type Mode } from './envFile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const METHOD_NAMES = ['google', 'facebook', 'apple'] as const;
type MethodName = (typeof METHOD_NAMES)[number];
type MethodOrAll = MethodName | 'all';

type SignInMethodsSnapshot = {
  google: boolean;
  facebook: boolean;
  apple: boolean;
  googleVerbose: boolean;
  facebookVerbose: boolean;
  appleVerbose: boolean;
};

type CommandName = 'check' | 'seed' | 'enable' | 'disable';

type Args = {
  command: CommandName;
  mode: Mode;
  method?: MethodOrAll;
  json: boolean;
};

const program = new Program();
program
  .name('sign-in-method')
  .description('Shop-wide third-party sign-in OPS CLI (DB preferences; no OAuth secrets).');
const fail: (message: string) => never = makeFail(program, 'sign-in-method');

function envBoolean(env: Record<string, string>, key: string): boolean {
  const raw = env[key]?.trim();
  if (raw !== 'true' && raw !== 'false') {
    fail(`${key} must be true or false in tuucho/sample/seed-defaults.env, got ${JSON.stringify(raw ?? '')}`);
  }
  return raw === 'true';
}

function loadSeedDefaults(mode: Mode): SignInMethodsSnapshot {
  const env = loadSeedEnv(root, mode);
  return {
    google: envBoolean(env, 'SIGN_IN_GOOGLE_ENABLED'),
    facebook: envBoolean(env, 'SIGN_IN_FACEBOOK_ENABLED'),
    apple: envBoolean(env, 'SIGN_IN_APPLE_ENABLED'),
    googleVerbose: envBoolean(env, 'SIGN_IN_GOOGLE_VERBOSE_ENABLED'),
    facebookVerbose: envBoolean(env, 'SIGN_IN_FACEBOOK_VERBOSE_ENABLED'),
    appleVerbose: envBoolean(env, 'SIGN_IN_APPLE_VERBOSE_ENABLED'),
  };
}

function methodPatch(method: MethodOrAll, enabled: boolean): Partial<SignInMethodsSnapshot> {
  if (method === 'all') {
    return { google: enabled, facebook: enabled, apple: enabled };
  }
  if (method === 'google') return { google: enabled };
  if (method === 'facebook') return { facebook: enabled };
  return { apple: enabled };
}

function parseMethod(raw: string): MethodOrAll {
  if (raw === 'all' || (METHOD_NAMES as readonly string[]).includes(raw)) return raw as MethodOrAll;
  fail(`invalid sign-in method ${JSON.stringify(raw)} — use ${[...METHOD_NAMES, 'all'].join(', ')}`);
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: 'GET' | 'PATCH',
  body?: Partial<SignInMethodsSnapshot>,
): Promise<{ signInMethods: SignInMethodsSnapshot }> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const init: RequestInit = {
    method,
    headers: {
      ...opsRequestHeaders(opsToken),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${apiBaseUrl}/operation/sign-in-methods`, {
    ...init,
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `/operation/sign-in-methods -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/sign-in-methods -> ${response.status}: ${String(error)}`);
  }
  return parsed as { signInMethods: SignInMethodsSnapshot };
}

function printSnapshot(json: boolean, label: string, signInMethods: SignInMethodsSnapshot): void {
  log(json, `[sign-in-method] ${label}`);
  logTable(json, [
    { method: 'google', enabled: signInMethods.google, verbose: signInMethods.googleVerbose },
    { method: 'facebook', enabled: signInMethods.facebook, verbose: signInMethods.facebookVerbose },
    { method: 'apple', enabled: signInMethods.apple, verbose: signInMethods.appleVerbose },
  ]);
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[sign-in-method] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);

  if (args.command === 'check') {
    const { signInMethods } = await apiFetch(apiBaseUrl, opsToken, 'GET');
    printSnapshot(args.json, 'check', signInMethods);
    if (args.json) printJson({ success: true, signInMethods });
    return;
  }

  const patch =
    args.command === 'seed'
      ? loadSeedDefaults(args.mode)
      : methodPatch(args.method!, args.command === 'enable');
  const { signInMethods } = await apiFetch(apiBaseUrl, opsToken, 'PATCH', patch);
  printSnapshot(
    args.json,
    args.command === 'seed' ? 'seeded defaults' : `${args.command}d ${args.method}`,
    signInMethods,
  );
  if (args.json) printJson({ success: true, signInMethods });
  const { postOperatorActivity } = await import('./postOperatorActivity.js');
  if (args.command === 'seed') {
    await postOperatorActivity(root, args.mode, {
      category: 'settings',
      action: 'sign_in_method.seed',
      summary: 'Seed methodes de connexion',
      detail: signInMethods,
    });
  } else {
    await postOperatorActivity(root, args.mode, {
      category: 'settings',
      action: args.command === 'enable' ? 'sign_in_method.enable' : 'sign_in_method.disable',
      summary: `${args.command === 'enable' ? 'Activation' : 'Desactivation'} connexion: ${args.method}`,
      targetType: 'sign_in_method',
      targetId: args.method!,
      detail: { patch, signInMethods },
    });
  }
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[sign-in-method] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read the shop-wide third-party sign-in flags from the target DB.')
  .action((opts: CommonModeOpts) =>
    runAction(() => runMain({ command: 'check', mode: opts.mode, json: Boolean(opts.json) })),
  );

addConfirmOption(addCommonOptions(program.command('seed')))
  .description('Apply SIGN_IN_*_ENABLED and SIGN_IN_*_VERBOSE_ENABLED defaults from tuucho/sample/seed-defaults.env.')
  .action((opts: CommonModeOpts) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      return runMain({ command: 'seed', mode: opts.mode, json: Boolean(opts.json) });
    }),
  );

function addToggle(name: 'enable' | 'disable'): void {
  addConfirmOption(addCommonOptions(program.command(name)))
    .description(
      `${name === 'enable' ? 'Enable' : 'Disable'} one shop sign-in method, or every method with all.`,
    )
    .argument('<method>', 'google, facebook, apple, or all', parseMethod)
    .action((method: MethodOrAll, opts: CommonModeOpts) =>
      runAction(() => {
        requireConfirmForProdWrite(opts.mode, opts.confirm, fail, name);
        return runMain({ command: name, mode: opts.mode, method, json: Boolean(opts.json) });
      }),
    );
}

addToggle('enable');
addToggle('disable');

void program.parseAsync(process.argv);
