/** Per-method checkout country allowlists from env (OPS API, no manager files).
 *
 *   npm run payment-method-countries -- check [--json] --dev|--preprod|--prod
 *   npm run payment-method-countries -- seed [--json] --dev|--preprod|--prod
 *
 * Reads `PAYMENT_METHOD_COUNTRIES_*` from the layered seed env. Seed writes
 * explicit lists so tests and dev defaults do not depend on migration fallbacks.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';
import { loadApiBaseUrl, loadOpsToken, loadSeedEnv, type Mode } from './envFile.js';
import type { PublicPaymentMethodCountries } from '../src/modules/payments/application/paymentMethodCountries.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type Args = {
  command: 'check' | 'seed';
  mode: Mode;
  json: boolean;
};

const program = new Program();
program
  .name('payment-method-countries')
  .description('Apply PAYMENT_METHOD_COUNTRIES_* defaults to the target DB.');
const fail: (message: string) => never = makeFail(program, 'payment-method-countries');

const FIELD_ENV: Array<{ field: keyof PublicPaymentMethodCountries; envKey: string }> = [
  { field: 'card', envKey: 'PAYMENT_METHOD_COUNTRIES_CARD' },
  { field: 'paypal', envKey: 'PAYMENT_METHOD_COUNTRIES_PAYPAL' },
  { field: 'bancontact', envKey: 'PAYMENT_METHOD_COUNTRIES_BANCONTACT' },
  { field: 'googlePay', envKey: 'PAYMENT_METHOD_COUNTRIES_GOOGLE_PAY' },
  { field: 'applePay', envKey: 'PAYMENT_METHOD_COUNTRIES_APPLE_PAY' },
];

export function parseCountryAllowlist(raw: string | undefined, envKey: string): string[] {
  const text = raw?.trim();
  if (!text) fail(`${envKey} is missing or empty in .env/.seed.env`);
  if (text.toUpperCase() === 'ALL') return ['ALL'];
  const codes = text.split(',').map((entry) => {
    const code = entry.trim().toUpperCase();
    if (code === 'ALL') return 'ALL';
    if (!/^[A-Z]{2}$/.test(code)) fail(`${envKey}: invalid country token ${JSON.stringify(entry)}`);
    return code;
  });
  if (codes.some((code) => code === 'ALL')) return ['ALL'];
  return codes;
}

function loadSeedDefaults(mode: Mode): PublicPaymentMethodCountries {
  const env = loadSeedEnv(root, mode);
  const out = {} as PublicPaymentMethodCountries;
  for (const { field, envKey } of FIELD_ENV) {
    out[field] = parseCountryAllowlist(env[envKey], envKey);
  }
  return out;
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: 'GET' | 'PATCH',
  body?: Partial<PublicPaymentMethodCountries>,
): Promise<{ paymentMethodCountries: PublicPaymentMethodCountries }> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const response = await fetch(`${apiBaseUrl}/operation/payment-method-countries`, {
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
      `/operation/payment-method-countries -> ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
    );
  }
  if (!response.ok) {
    const error = (parsed as { error?: unknown } | null)?.error ?? response.statusText;
    throw new Error(`/operation/payment-method-countries -> ${response.status}: ${String(error)}`);
  }
  return parsed as { paymentMethodCountries: PublicPaymentMethodCountries };
}

function printSnapshot(json: boolean, label: string, countries: PublicPaymentMethodCountries): void {
  log(json, `[payment-method-countries] ${label}`);
  logTable(json, [
    { method: 'card', countries: countries.card.join(',') || '(empty)' },
    { method: 'paypal', countries: countries.paypal.join(',') || '(empty)' },
    { method: 'bancontact', countries: countries.bancontact.join(',') || '(empty)' },
    { method: 'google-pay', countries: countries.googlePay.join(',') || '(empty)' },
    { method: 'apple-pay', countries: countries.applePay.join(',') || '(empty)' },
  ]);
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[payment-method-countries] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);

  if (args.command === 'check') {
    const { paymentMethodCountries } = await apiFetch(apiBaseUrl, opsToken, 'GET');
    printSnapshot(args.json, 'check', paymentMethodCountries);
    if (args.json) printJson({ success: true, paymentMethodCountries });
    return;
  }

  const patch = loadSeedDefaults(args.mode);
  const { paymentMethodCountries } = await apiFetch(apiBaseUrl, opsToken, 'PATCH', patch);
  printSnapshot(args.json, 'seeded defaults', paymentMethodCountries);
  if (args.json) printJson({ success: true, paymentMethodCountries });
}

async function runAction(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`[payment-method-countries] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
  confirm?: boolean;
}

addCommonOptions(program.command('check'))
  .description('Read per-method payment country allowlists from the target DB.')
  .action((opts: CommonModeOpts) =>
    runAction(() => runMain({ command: 'check', mode: opts.mode, json: Boolean(opts.json) })),
  );

addConfirmOption(addCommonOptions(program.command('seed')))
  .description('Apply PAYMENT_METHOD_COUNTRIES_* defaults from .env/.seed.env.')
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
    return arg.endsWith('paymentMethodCountries.ts');
  }
});
if (invokedAsCli) {
  void program.parseAsync(process.argv);
}
