/** Shop-wide payment-method OPS CLI (no manager files or Stripe credentials).
 *
 *   npm run payment-method -- check [--json] --dev|--preprod|--prod
 *   npm run payment-method -- seed [--json] --dev|--preprod|--prod
 *   npm run payment-method -- enable|disable <card|paypal|bancontact|google-pay|apple-pay|all>
 *     [--json] --dev|--preprod|--prod
 *
 * `seed` applies the PAYMENT_METHOD_*_ENABLED defaults from `.env/.seed.env`
 * (with the normal target-specific public-env overlay). It intentionally
 * updates only those shop-wide database preferences; individual customer
 * wallet preferences and Stripe Dashboard eligibility stay untouched.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, loadSeedEnv, type Mode } from './envFile.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const METHOD_NAMES = ['card', 'paypal', 'bancontact', 'google-pay', 'apple-pay'] as const;
type MethodName = (typeof METHOD_NAMES)[number];
type MethodOrAll = MethodName | 'all';

type PaymentMethodsSnapshot = {
  card: boolean;
  paypal: boolean;
  bancontact: boolean;
  googlePay: boolean;
  applePay: boolean;
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
  .name('payment-method')
  .description('Shop-wide payment-method OPS CLI (DB preferences; no manager files).');
const fail: (message: string) => never = makeFail(program, 'payment-method');

function envBoolean(env: Record<string, string>, key: string): boolean {
  const raw = env[key]?.trim();
  if (raw !== 'true' && raw !== 'false') {
    fail(`${key} must be true or false in .env/.seed.env, got ${JSON.stringify(raw ?? '')}`);
  }
  return raw === 'true';
}

function loadSeedDefaults(mode: Mode): PaymentMethodsSnapshot {
  const env = loadSeedEnv(root, mode);
  return {
    card: envBoolean(env, 'PAYMENT_METHOD_CARD_ENABLED'),
    paypal: envBoolean(env, 'PAYMENT_METHOD_PAYPAL_ENABLED'),
    bancontact: envBoolean(env, 'PAYMENT_METHOD_BANCONTACT_ENABLED'),
    googlePay: envBoolean(env, 'PAYMENT_METHOD_GOOGLE_PAY_ENABLED'),
    applePay: envBoolean(env, 'PAYMENT_METHOD_APPLE_PAY_ENABLED'),
  };
}

function methodPatch(method: MethodOrAll, enabled: boolean): Partial<PaymentMethodsSnapshot> {
  if (method === 'all') {
    return {
      card: enabled,
      paypal: enabled,
      bancontact: enabled,
      googlePay: enabled,
      applePay: enabled,
    };
  }
  if (method === 'card') return { card: enabled };
  if (method === 'paypal') return { paypal: enabled };
  if (method === 'bancontact') return { bancontact: enabled };
  if (method === 'google-pay') return { googlePay: enabled };
  return { applePay: enabled };
}

function parseMethod(raw: string): MethodOrAll {
  if (raw === 'all' || (METHOD_NAMES as readonly string[]).includes(raw)) return raw as MethodOrAll;
  fail(`invalid payment method ${JSON.stringify(raw)} — use ${[...METHOD_NAMES, 'all'].join(', ')}`);
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: 'GET' | 'PATCH',
  body?: Partial<PaymentMethodsSnapshot>,
): Promise<{ paymentMethods: PaymentMethodsSnapshot }> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const init: RequestInit = {
    method,
    headers: {
      ...opsRequestHeaders(opsToken),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${apiBaseUrl}/operation/payment-methods`, {
    ...init,
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `/operation/payment-methods -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/payment-methods -> ${response.status}: ${String(error)}`);
  }
  return parsed as { paymentMethods: PaymentMethodsSnapshot };
}

function printSnapshot(json: boolean, label: string, paymentMethods: PaymentMethodsSnapshot): void {
  log(json, `[payment-method] ${label}`);
  logTable(json, [
    { method: 'card', enabled: paymentMethods.card },
    { method: 'paypal', enabled: paymentMethods.paypal },
    { method: 'bancontact', enabled: paymentMethods.bancontact },
    { method: 'google-pay', enabled: paymentMethods.googlePay },
    { method: 'apple-pay', enabled: paymentMethods.applePay },
  ]);
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[payment-method] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);

  if (args.command === 'check') {
    const { paymentMethods } = await apiFetch(apiBaseUrl, opsToken, 'GET');
    printSnapshot(args.json, 'check', paymentMethods);
    if (args.json) printJson({ success: true, paymentMethods });
    return;
  }

  const patch =
    args.command === 'seed'
      ? loadSeedDefaults(args.mode)
      : methodPatch(args.method!, args.command === 'enable');
  const { paymentMethods } = await apiFetch(apiBaseUrl, opsToken, 'PATCH', patch);
  printSnapshot(
    args.json,
    args.command === 'seed' ? 'seeded defaults' : `${args.command}d ${args.method}`,
    paymentMethods,
  );
  if (args.json) printJson({ success: true, paymentMethods });
  const { postOperatorActivity } = await import('./postOperatorActivity.js');
  if (args.command === 'seed') {
    await postOperatorActivity(root, args.mode, {
      category: 'settings',
      action: 'payment_method.seed',
      summary: 'Seed methodes de paiement',
      detail: paymentMethods,
    });
  } else {
    await postOperatorActivity(root, args.mode, {
      category: 'settings',
      action: args.command === 'enable' ? 'payment_method.enable' : 'payment_method.disable',
      summary: `${args.command === 'enable' ? 'Activation' : 'Desactivation'} paiement: ${args.method}`,
      targetType: 'payment_method',
      targetId: args.method!,
      detail: { patch, paymentMethods },
    });
  }
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[payment-method] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read the shop-wide payment-method flags from the target DB.')
  .action((opts: CommonModeOpts) =>
    runAction(() => runMain({ command: 'check', mode: opts.mode, json: Boolean(opts.json) })),
  );

addConfirmOption(addCommonOptions(program.command('seed')))
  .description('Apply PAYMENT_METHOD_*_ENABLED defaults from .env/.seed.env.')
  .action((opts: CommonModeOpts) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      return runMain({ command: 'seed', mode: opts.mode, json: Boolean(opts.json) });
    }),
  );

function addToggle(name: 'enable' | 'disable'): void {
  addConfirmOption(addCommonOptions(program.command(name)))
    .description(
      `${name === 'enable' ? 'Enable' : 'Disable'} one shop payment method, or every method with all.`,
    )
    .argument('<method>', 'card, paypal, bancontact, google-pay, apple-pay, or all', parseMethod)
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
