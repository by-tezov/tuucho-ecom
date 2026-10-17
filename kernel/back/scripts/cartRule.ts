/** Permanent cart-rule admin CLI (DB via OPS API — no manager files).
 *
 *   npm run cart-rule -- check [--json] --dev|--preprod|--prod
 *   npm run cart-rule -- seed [--json] --dev|--preprod|--prod   # upsert the three defaults
 *
 * Kind upserts (friendly flags, no JSON):
 *   npm run cart-rule -- gift [--code tip-pot] --product TK-PT-248 [--per-set 1] [--min-units 5] [--priority 10] [--forbid-voucher] [--disabled] [--json] --dev|--preprod|--prod
 *   npm run cart-rule -- nail-tiers [--code nail-qty-tier] --tier 2=5 --tier 3=10 --tier 5=15 [--min-units 5] [--priority 20] […] --dev|--preprod|--prod
 *   npm run cart-rule -- free-shipping [--code ship-franco] --threshold FR=65 --threshold BE=75 […] --dev|--preprod|--prod
 *
 *   npm run cart-rule -- enable|disable <code> [--json] --dev|--preprod|--prod
 *   npm run cart-rule -- delete <code> [--json] --dev|--preprod|--prod --confirm
 *
 * Codes are lowercase slugs (`tip-pot`). Omitted kind flags keep the
 * existing rule’s values when updating, and fall back to the CART_RULE_*
 * values in `.env/.seed.env` (see SeedDefaults) when the code is new —
 * the same values `seed` pushes.
 */
import { Command as Program } from 'commander';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApiBaseUrl, loadOpsToken, loadSeedEnv, type Mode } from './envFile.js';
import { addCommonOptions, addConfirmOption, makeFail, requireConfirmForProdWrite } from './cliCommon.js';
import { log, logTable, printJson } from './cliOutput.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type Command =
  | 'check'
  | 'seed'
  | 'gift'
  | 'nail-tiers'
  | 'free-shipping'
  | 'enable'
  | 'disable'
  | 'delete';

type Kind = 'gift_per_nail_set' | 'nail_qty_percent_tiers' | 'free_shipping_above';

/** Retired composed-set gift. `seed` deletes it; `gift` counts those sets. */
const RETIRED_COMPOSE_GIFT_CODE = 'tip-pot-compose';

interface PublicRule {
  id: string;
  code: string;
  kind: Kind;
  enabled: boolean;
  priority: number;
  forbidVoucher: boolean;
  params: Record<string, unknown>;
}

interface Args {
  command: Command;
  mode: Mode;
  code?: string;
  productUid?: string;
  perNailSet?: number;
  minNails?: number;
  tiers: Array<{ minQty: number; percent: number }>;
  thresholds: Record<string, number>;
  priority?: number;
  forbidVoucher?: boolean;
  enabled?: boolean;
  confirm: boolean;
  json: boolean;
}

const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The four permanent rules' out-of-the-box values — what `seed` pushes,
 * and what each kind command falls back to for a flag left out on a code
 * that doesn't exist yet. They live in `.env/.seed.env` (CART_RULE_*,
 * overridable per target the usual way) rather than in this file: changing
 * the franco threshold or the gift product is an operator decision, not a
 * code change. */
interface RuleDefaults {
  code: string;
  priority: number;
  forbidVoucher: boolean;
}

interface SeedDefaults {
  gift: RuleDefaults & { productUid: string; qtyPerNailSetUnit: number; minNails: number };
  nailTier: RuleDefaults & { tiers: Array<{ minQty: number; percent: number }>; minNails: number };
  freeShipping: RuleDefaults & { thresholdsByCountry: Record<string, number> };
}

const program = new Program();
program.name('cart-rule').description('Permanent cart-rule admin CLI (DB via OPS API — no manager files).');
const fail: (message: string) => never = makeFail(program, 'cart-rule');

/** `origin` on these three is what the failure message blames — the CLI flag
 * by default, or the CART_RULE_* env key when the same token comes from
 * `.seed.env` (see loadSeedDefaults). */
function normalizeCode(raw: string, origin = 'code'): string {
  const code = raw.trim().toLowerCase();
  if (!CODE_RE.test(code)) {
    fail(
      `invalid ${origin} ${JSON.stringify(raw)} — use lowercase letters, digits and hyphens (e.g. tip-pot)`,
    );
  }
  return code;
}

function parseTierToken(raw: string, origin = '--tier'): { minQty: number; percent: number } {
  const match = /^(\d+)\s*[=:]\s*(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!match) fail(`invalid ${origin} ${JSON.stringify(raw)} — expected minQty=percent (e.g. 2=5)`);
  const minQty = Number(match[1]);
  const percent = Number(match[2]);
  if (!Number.isInteger(minQty) || minQty <= 0) fail(`${origin} minQty must be a positive integer`);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    fail(`${origin} percent must be between 0 and 100`);
  }
  return { minQty, percent };
}

function parseThresholdToken(raw: string, origin = '--threshold'): { country: string; amount: number } {
  const match = /^([A-Za-z]{2})\s*[=:]\s*(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (!match) {
    fail(`invalid ${origin} ${JSON.stringify(raw)} — expected country=amount (e.g. FR=65)`);
  }
  const country = match[1]!.toUpperCase();
  const amount = Number(match[2]);
  if (!Number.isFinite(amount) || amount < 0) fail(`${origin} amount must be ≥ 0`);
  return { country, amount };
}

function envValue(env: Record<string, string>, key: string): string {
  const raw = env[key]?.trim();
  if (!raw) fail(`${key} missing from .env/.seed.env`);
  return raw;
}

function envInteger(env: Record<string, string>, key: string): number {
  const raw = envValue(env, key);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail(`${key} must be an integer, got ${JSON.stringify(raw)}`);
  return value;
}

function envBoolean(env: Record<string, string>, key: string): boolean {
  const raw = envValue(env, key);
  if (raw !== 'true' && raw !== 'false') fail(`${key} must be true or false, got ${JSON.stringify(raw)}`);
  return raw === 'true';
}

/** Comma-separated list of the same `a=b` tokens the matching CLI flag
 * takes, so `--tier 2=5 --tier 3=10` and `CART_RULE_QTY_TIER_STEPS=2=5,3=10`
 * are the same syntax written twice. */
function envTokens(env: Record<string, string>, key: string): string[] {
  const tokens = envValue(env, key)
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) fail(`${key} must list at least one entry`);
  return tokens;
}

function loadSeedDefaults(mode: Mode): SeedDefaults {
  const env = loadSeedEnv(root, mode);
  const thresholdsByCountry: Record<string, number> = {};
  for (const token of envTokens(env, 'CART_RULE_FREE_SHIPPING_THRESHOLDS')) {
    const { country, amount } = parseThresholdToken(token, 'CART_RULE_FREE_SHIPPING_THRESHOLDS');
    thresholdsByCountry[country] = amount;
  }
  const qtyPerNailSetUnit = envInteger(env, 'CART_RULE_GIFT_QTY_PER_SET');
  if (qtyPerNailSetUnit <= 0) fail('CART_RULE_GIFT_QTY_PER_SET must be a positive integer');
  const giftMinNails = envInteger(env, 'CART_RULE_GIFT_MIN_UNITS');
  if (giftMinNails <= 0 || giftMinNails > 10) fail('CART_RULE_GIFT_MIN_UNITS must be between 1 and 10');
  const tierMinNails = envInteger(env, 'CART_RULE_QTY_TIER_MIN_UNITS');
  if (tierMinNails <= 0 || tierMinNails > 10) fail('CART_RULE_QTY_TIER_MIN_UNITS must be between 1 and 10');
  return {
    gift: {
      code: normalizeCode(envValue(env, 'CART_RULE_GIFT_CODE'), 'CART_RULE_GIFT_CODE'),
      productUid: envValue(env, 'CART_RULE_GIFT_PRODUCT_UID'),
      qtyPerNailSetUnit,
      minNails: giftMinNails,
      priority: envInteger(env, 'CART_RULE_GIFT_PRIORITY'),
      forbidVoucher: envBoolean(env, 'CART_RULE_GIFT_FORBID_VOUCHER'),
    },
    nailTier: {
      code: normalizeCode(envValue(env, 'CART_RULE_QTY_TIER_CODE'), 'CART_RULE_QTY_TIER_CODE'),
      tiers: envTokens(env, 'CART_RULE_QTY_TIER_STEPS').map((token) =>
        parseTierToken(token, 'CART_RULE_QTY_TIER_STEPS'),
      ),
      minNails: tierMinNails,
      priority: envInteger(env, 'CART_RULE_QTY_TIER_PRIORITY'),
      forbidVoucher: envBoolean(env, 'CART_RULE_QTY_TIER_FORBID_VOUCHER'),
    },
    freeShipping: {
      code: normalizeCode(envValue(env, 'CART_RULE_FREE_SHIPPING_CODE'), 'CART_RULE_FREE_SHIPPING_CODE'),
      thresholdsByCountry,
      priority: envInteger(env, 'CART_RULE_FREE_SHIPPING_PRIORITY'),
      forbidVoucher: envBoolean(env, 'CART_RULE_FREE_SHIPPING_FORBID_VOUCHER'),
    },
  };
}

/** What `seed` upserts, in priority order. */
function seedRules(defaults: SeedDefaults): Array<{
  code: string;
  kind: Kind;
  priority: number;
  forbidVoucher: boolean;
  params: Record<string, unknown>;
}> {
  return [
    {
      code: defaults.gift.code,
      kind: 'gift_per_nail_set',
      priority: defaults.gift.priority,
      forbidVoucher: defaults.gift.forbidVoucher,
      params: {
        productUid: defaults.gift.productUid,
        qtyPerNailSetUnit: defaults.gift.qtyPerNailSetUnit,
        minNails: defaults.gift.minNails,
      },
    },
    {
      code: defaults.nailTier.code,
      kind: 'nail_qty_percent_tiers',
      priority: defaults.nailTier.priority,
      forbidVoucher: defaults.nailTier.forbidVoucher,
      params: { tiers: defaults.nailTier.tiers, minNails: defaults.nailTier.minNails },
    },
    {
      code: defaults.freeShipping.code,
      kind: 'free_shipping_above',
      priority: defaults.freeShipping.priority,
      forbidVoucher: defaults.freeShipping.forbidVoucher,
      params: { thresholdsByCountry: defaults.freeShipping.thresholdsByCountry },
    },
  ];
}

async function apiFetch(
  apiBaseUrl: string,
  opsToken: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      ...opsRequestHeaders(opsToken),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} -> ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err = (json as { error?: string })?.error ?? res.statusText;
    throw new Error(`${path} -> ${res.status}: ${err}`);
  }
  return json;
}

async function getRule(apiBaseUrl: string, opsToken: string, code: string): Promise<PublicRule | undefined> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}/operation/cart-rules/${encodeURIComponent(code)}`, {
    headers: opsRequestHeaders(opsToken),
  });
  if (res.status === 404) return undefined;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`GET /operation/cart-rules/${code} -> ${res.status}`);
  return (json as { rule: PublicRule }).rule;
}

async function deleteRuleIfPresent(apiBaseUrl: string, opsToken: string, code: string): Promise<boolean> {
  const { opsRequestHeaders } = await import('./opsHeaders.js');
  const res = await fetch(`${apiBaseUrl}/operation/cart-rules/${encodeURIComponent(code)}`, {
    method: 'DELETE',
    headers: opsRequestHeaders(opsToken),
  });
  if (res.status === 404) return false;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE /operation/cart-rules/${code} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return true;
}

async function upsertRule(
  apiBaseUrl: string,
  opsToken: string,
  body: {
    code: string;
    kind: Kind;
    params: unknown;
    priority: number;
    forbidVoucher: boolean;
    enabled: boolean;
  },
): Promise<PublicRule> {
  const result = (await apiFetch(apiBaseUrl, opsToken, 'POST', '/operation/cart-rules', body)) as {
    rule: PublicRule;
  };
  return result.rule;
}

function formatParams(rule: PublicRule): string {
  if (rule.kind === 'gift_per_nail_set') {
    const p = rule.params as { productUid?: string; qtyPerNailSetUnit?: number; minNails?: number };
    return `product=${p.productUid ?? '?'} perNailSet=${p.qtyPerNailSetUnit ?? '?'} minNails=${p.minNails ?? '?'}`;
  }
  if (rule.kind === 'nail_qty_percent_tiers') {
    const params = rule.params as {
      tiers?: Array<{ minQty: number; percent: number }>;
      minNails?: number;
    };
    const tiers = (params.tiers ?? []).map((t) => `${t.minQty}=${t.percent}%`).join(' ');
    return `${tiers} minNails=${params.minNails ?? '?'}`;
  }
  const map = (rule.params as { thresholdsByCountry?: Record<string, number> }).thresholdsByCountry ?? {};
  return Object.entries(map)
    .map(([code, amount]) => `${code}=${amount}`)
    .join(' ');
}

async function runMain(args: Args): Promise<void> {
  const apiBaseUrl = loadApiBaseUrl(root, args.mode);
  const opsToken = loadOpsToken(root, args.mode);
  const defaults = loadSeedDefaults(args.mode);
  if (!apiBaseUrl) fail(`URL_API_BASE missing for mode ${args.mode}`);
  if (!opsToken) fail(`OPS_TOKEN missing for mode ${args.mode}`);
  log(args.json, `[cart-rule] command=${args.command} mode=${args.mode} api=${apiBaseUrl}`);

  if (args.command === 'check') {
    const result = (await apiFetch(apiBaseUrl, opsToken, 'GET', '/operation/cart-rules')) as {
      rules: PublicRule[];
    };
    if (args.json) printJson(result);
    else {
      log(args.json, `[cart-rule] check: ${result.rules.length} rule(s) in DB.`);
      logTable(
        args.json,
        result.rules.map((r) => ({
          code: r.code,
          kind: r.kind,
          enabled: r.enabled,
          priority: r.priority,
          forbidVoucher: r.forbidVoucher,
          params: formatParams(r),
        })),
      );
    }
    return;
  }

  const { postOperatorActivity } = await import('./postOperatorActivity.js');

  if (args.command === 'seed') {
    const upserted: PublicRule[] = [];
    for (const rule of seedRules(defaults)) {
      const saved = await upsertRule(apiBaseUrl, opsToken, { ...rule, enabled: true });
      upserted.push(saved);
    }
    const removedCompose = await deleteRuleIfPresent(apiBaseUrl, opsToken, RETIRED_COMPOSE_GIFT_CODE);
    log(args.json, `[cart-rule] seeded ${upserted.length} rule(s).`);
    if (removedCompose) log(args.json, `[cart-rule] removed retired ${RETIRED_COMPOSE_GIFT_CODE}`);
    logTable(
      args.json,
      upserted.map((rule) => ({
        code: rule.code,
        kind: rule.kind,
        enabled: rule.enabled,
        priority: rule.priority,
        forbidVoucher: rule.forbidVoucher,
        params: formatParams(rule),
      })),
    );
    if (args.json) printJson({ success: true, rules: upserted });
    await postOperatorActivity(root, args.mode, {
      category: 'promotions',
      action: 'cart_rule.seed',
      summary:
        upserted.length === 0
          ? 'Seed regles panier: aucun changement'
          : `Seed regles panier: ${upserted.length} regle(s)`,
      detail: {
        codes: upserted.map((rule) => rule.code),
        removedCompose,
      },
      targets: upserted.map((rule) => rule.code),
    });
    return;
  }

  if (args.command === 'gift') {
    const code = normalizeCode(args.code ?? defaults.gift.code);
    const existing = await getRule(apiBaseUrl, opsToken, code);
    if (existing && existing.kind !== 'gift_per_nail_set') {
      fail(`code ${code} already exists as kind ${existing.kind}`);
    }
    const existingParams = (existing?.params ?? {}) as {
      productUid?: string;
      qtyPerNailSetUnit?: number;
      minNails?: number;
    };
    const productUid = (args.productUid ?? existingParams.productUid)?.trim();
    const qtyPerNailSetUnit =
      args.perNailSet ?? existingParams.qtyPerNailSetUnit ?? defaults.gift.qtyPerNailSetUnit;
    const minNails = args.minNails ?? existingParams.minNails ?? defaults.gift.minNails;
    if (!productUid) fail('gift requires --product <productUid> (e.g. TK-PT-248)');
    const rule = await upsertRule(apiBaseUrl, opsToken, {
      code,
      kind: 'gift_per_nail_set',
      params: { productUid, qtyPerNailSetUnit, minNails },
      priority: args.priority ?? existing?.priority ?? defaults.gift.priority,
      forbidVoucher: args.forbidVoucher ?? existing?.forbidVoucher ?? defaults.gift.forbidVoucher,
      enabled: args.enabled ?? existing?.enabled ?? true,
    });
    if (args.json) printJson({ success: true, rule });
    else log(args.json, `[cart-rule] gift ${rule.code}: ${formatParams(rule)}`);
    return;
  }

  if (args.command === 'nail-tiers') {
    const code = normalizeCode(args.code ?? defaults.nailTier.code);
    const existing = await getRule(apiBaseUrl, opsToken, code);
    if (existing && existing.kind !== 'nail_qty_percent_tiers') {
      fail(`code ${code} already exists as kind ${existing.kind}`);
    }
    const existingParams = (existing?.params ?? {}) as {
      tiers?: Array<{ minQty: number; percent: number }>;
      minNails?: number;
    };
    const tiers = args.tiers.length > 0 ? args.tiers : (existingParams.tiers ?? []);
    const minNails = args.minNails ?? existingParams.minNails ?? defaults.nailTier.minNails;
    if (tiers.length === 0) {
      fail('nail-tiers requires at least one --tier minQty=percent (e.g. --tier 2=5 --tier 3=10)');
    }
    const rule = await upsertRule(apiBaseUrl, opsToken, {
      code,
      kind: 'nail_qty_percent_tiers',
      params: { tiers, minNails },
      priority: args.priority ?? existing?.priority ?? defaults.nailTier.priority,
      forbidVoucher: args.forbidVoucher ?? existing?.forbidVoucher ?? defaults.nailTier.forbidVoucher,
      enabled: args.enabled ?? existing?.enabled ?? true,
    });
    if (args.json) printJson({ success: true, rule });
    else log(args.json, `[cart-rule] nail-tiers ${rule.code}: ${formatParams(rule)}`);
    return;
  }

  if (args.command === 'free-shipping') {
    const code = normalizeCode(args.code ?? defaults.freeShipping.code);
    const existing = await getRule(apiBaseUrl, opsToken, code);
    if (existing && existing.kind !== 'free_shipping_above') {
      fail(`code ${code} already exists as kind ${existing.kind}`);
    }
    const existingMap =
      (existing?.params as { thresholdsByCountry?: Record<string, number> } | undefined)
        ?.thresholdsByCountry ?? {};
    const thresholdsByCountry = Object.keys(args.thresholds).length > 0 ? args.thresholds : existingMap;
    if (Object.keys(thresholdsByCountry).length === 0) {
      fail('free-shipping requires at least one --threshold country=amount (e.g. --threshold FR=65)');
    }
    const rule = await upsertRule(apiBaseUrl, opsToken, {
      code,
      kind: 'free_shipping_above',
      params: { thresholdsByCountry },
      priority: args.priority ?? existing?.priority ?? defaults.freeShipping.priority,
      forbidVoucher: args.forbidVoucher ?? existing?.forbidVoucher ?? defaults.freeShipping.forbidVoucher,
      enabled: args.enabled ?? existing?.enabled ?? true,
    });
    if (args.json) printJson({ success: true, rule });
    else log(args.json, `[cart-rule] free-shipping ${rule.code} — ${formatParams(rule)}`);
    return;
  }

  if (args.command === 'enable' || args.command === 'disable') {
    if (!args.code) fail(`${args.command} requires <code>`);
    const code = normalizeCode(args.code);
    const result = await apiFetch(
      apiBaseUrl,
      opsToken,
      'POST',
      `/operation/cart-rules/${encodeURIComponent(code)}/${args.command}`,
    );
    if (args.json) printJson(result);
    else log(args.json, `[cart-rule] ${args.command}d ${code}`);
    await postOperatorActivity(root, args.mode, {
      category: 'promotions',
      action: args.command === 'enable' ? 'cart_rule.enable' : 'cart_rule.disable',
      summary: `${args.command === 'enable' ? 'Activation' : 'Desactivation'} regle panier: ${code}`,
      targetType: 'cart_rule',
      targetId: code,
    });
    return;
  }

  if (args.command === 'delete') {
    if (!args.code) fail('delete requires <code>');
    const code = normalizeCode(args.code);
    const result = await apiFetch(
      apiBaseUrl,
      opsToken,
      'DELETE',
      `/operation/cart-rules/${encodeURIComponent(code)}`,
    );
    if (args.json) printJson(result);
    else log(args.json, `[cart-rule] deleted ${code}`);
    await postOperatorActivity(root, args.mode, {
      category: 'promotions',
      action: 'cart_rule.delete',
      summary: `Suppression regle panier: ${code}`,
      targetType: 'cart_rule',
      targetId: code,
    });
  }
}

async function runAction(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[cart-rule] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}

function baseArgs(command: Command, mode: Mode, json: boolean): Args {
  return {
    command,
    mode,
    tiers: [],
    thresholds: {},
    confirm: false,
    json,
  };
}

function resolveCode(code: string | undefined, positional: string | undefined): string | undefined {
  return code ?? positional;
}

interface CommonModeOpts {
  mode: Mode;
  json?: boolean;
}

addCommonOptions(program.command('check'))
  .description('List every cart rule currently in the DB.')
  .action((opts: CommonModeOpts) =>
    runAction(() => runMain(baseArgs('check', opts.mode, Boolean(opts.json)))),
  );

addConfirmOption(addCommonOptions(program.command('seed')))
  .description('Upsert the four permanent default rules from CART_RULE_* in .env/.seed.env.')
  .action((opts: CommonModeOpts & { confirm?: boolean }) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'seed');
      return runMain(baseArgs('seed', opts.mode, Boolean(opts.json)));
    }),
  );

interface KindOpts extends CommonModeOpts {
  code?: string;
  priority?: number;
  forbidVoucher?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  confirm?: boolean;
}

function resolveEnabled(opts: { disabled?: boolean; enabled?: boolean }): boolean | undefined {
  if (opts.enabled) return true;
  if (opts.disabled) return false;
  return undefined;
}

function parseMinNailsOption(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > 10) fail('--min-units must be an integer from 1 to 10');
  return n;
}

function addKindCommonOptions(command: Program): Program {
  return addConfirmOption(command)
    .option('--code <code>', 'lowercase slug (e.g. tip-pot); defaults to the CART_RULE_* code when new')
    .option('--priority <n>', 'integer', (v) => {
      const n = Number(v);
      if (!Number.isInteger(n)) fail('--priority must be an integer');
      return n;
    })
    .option('--forbid-voucher', 'this rule cannot combine with a voucher')
    .option('--disabled', 'disable this rule')
    .option('--enabled', 'enable this rule');
}

addKindCommonOptions(addCommonOptions(program.command('gift')))
  .description('Upsert the gift-per-set rule. A composed set counts once it has --min-units nails.')
  .option('--product <productUid>', 'e.g. TK-PT-248')
  .option('--per-set <n>', 'positive integer', (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) fail('--per-set must be a positive integer');
    return n;
  })
  .option('--min-units <n>', 'integer from 1 to 10', parseMinNailsOption)
  .action((opts: KindOpts & { product?: string; perNailSet?: number; minNails?: number }) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'gift');
      return runMain({
        ...baseArgs('gift', opts.mode, Boolean(opts.json)),
        code: opts.code,
        productUid: opts.product,
        perNailSet: opts.perNailSet,
        minNails: opts.minNails,
        priority: opts.priority,
        forbidVoucher: opts.forbidVoucher,
        enabled: resolveEnabled(opts),
      });
    }),
  );

program
  .command('compose-gift')
  .description('Removed. tip-pot counts composed sets via gift --min-units.')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(() =>
    fail('compose-gift was removed. Use gift --min-units. seed deletes tip-pot-compose.'),
  );

addKindCommonOptions(addCommonOptions(program.command('nail-tiers')))
  .description('Upsert the nail-quantity-percent-tiers rule.')
  .option(
    '--tier <minQty=percent>',
    'repeatable, e.g. --tier 2=5 --tier 3=10',
    (v, prev: Array<{ minQty: number; percent: number }>) => [...prev, parseTierToken(v)],
    [] as Array<{ minQty: number; percent: number }>,
  )
  .option('--min-units <n>', 'integer from 1 to 10: composed sets count as one unit from this many nails', parseMinNailsOption)
  .action((opts: KindOpts & { tier: Array<{ minQty: number; percent: number }>; minNails?: number }) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'nail-tiers');
      return runMain({
        ...baseArgs('nail-tiers', opts.mode, Boolean(opts.json)),
        code: opts.code,
        tiers: opts.tier,
        minNails: opts.minNails,
        priority: opts.priority,
        forbidVoucher: opts.forbidVoucher,
        enabled: resolveEnabled(opts),
      });
    }),
  );

addKindCommonOptions(addCommonOptions(program.command('free-shipping')))
  .description('Upsert the free-shipping-above-threshold rule.')
  .option(
    '--threshold <country=amount>',
    'repeatable, e.g. --threshold FR=65',
    (v, prev: Record<string, number>) => {
      const { country, amount } = parseThresholdToken(v);
      return { ...prev, [country]: amount };
    },
    {} as Record<string, number>,
  )
  .action((opts: KindOpts & { threshold: Record<string, number> }) =>
    runAction(() => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'free-shipping');
      return runMain({
        ...baseArgs('free-shipping', opts.mode, Boolean(opts.json)),
        code: opts.code,
        thresholds: opts.threshold,
        priority: opts.priority,
        forbidVoucher: opts.forbidVoucher,
        enabled: resolveEnabled(opts),
      });
    }),
  );

interface CodeOpts extends CommonModeOpts {
  code?: string;
  confirm?: boolean;
}

function addEnableDisable(name: 'enable' | 'disable', description: string): void {
  addConfirmOption(addCommonOptions(program.command(name)))
    .description(description)
    .argument('[code]', 'cart rule code')
    .option('--code <code>', 'cart rule code (alternative to the positional form)')
    .action((positional: string | undefined, opts: CodeOpts) =>
      runAction(async () => {
        requireConfirmForProdWrite(opts.mode, opts.confirm, fail, name);
        const code = resolveCode(opts.code, positional);
        if (!code) fail(`${name} requires <code>`);
        await runMain({
          ...baseArgs(name, opts.mode, Boolean(opts.json)),
          code,
        });
      }),
    );
}
addEnableDisable('enable', 'Enable a cart rule.');
addEnableDisable('disable', 'Disable a cart rule.');

addConfirmOption(
  addCommonOptions(program.command('delete')),
  'required when targeting --prod — destroys the rule',
)
  .description('Delete a cart rule. Destructive.')
  .argument('[code]', 'cart rule code')
  .option('--code <code>', 'cart rule code (alternative to the positional form)')
  .action((positional: string | undefined, opts: CodeOpts) =>
    runAction(async () => {
      requireConfirmForProdWrite(opts.mode, opts.confirm, fail, 'delete');
      const code = resolveCode(opts.code, positional);
      if (!code) fail('delete requires <code>');
      await runMain({
        ...baseArgs('delete', opts.mode, Boolean(opts.json)),
        code,
        confirm: true,
      });
    }),
  );

program
  .command('upsert')
  .description('Removed — use gift | nail-tiers | free-shipping.')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(() =>
    fail(
      'upsert was removed — use gift | nail-tiers | free-shipping (see -- help via bare `npm run cart-rule`)',
    ),
  );

program
  .command('list')
  .description('Renamed — use check.')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(() =>
    fail(
      'list was renamed check — every seeder CLI here (library, courier, accessory, voucher) reads the target with `check`',
    ),
  );

program.parse();
