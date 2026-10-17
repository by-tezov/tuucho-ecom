import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Same parsing as src/config/env.ts's loadEnvFile — shared by this repo's
 * standalone CLI scripts (library.ts, operation.ts, healthz.ts), which read
 * URL_API_BASE/OPS_TOKEN directly out of the .env files instead of pulling
 * in the rest of the app's config module (none of them have DB/media config
 * of their own to load). `root` is each script's own repo root (`join(
 * dirname(fileURLToPath(import.meta.url)), '..')`), since this file has no
 * fixed location relative to it. */
export function loadEnvFile(root: string, fileName: string): Record<string, string> {
  const filePath = join(root, '.env', fileName);
  if (!existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/** Common `.public.env` then that target's own overlay, target winning on
 * overlap (same order as every other layered env load in this repo). */
export function loadPublicEnv(root: string, mode: string): Record<string, string> {
  return { ...loadEnvFile(root, '.public.env'), ...loadEnvFile(root, `${mode}/.public.env`) };
}

/** Seed-only defaults (cart rules, payment methods, courier live state,
 * sign-in methods). Common `.seed.env` then `.env/<mode>/.seed.env`.
 * Not loaded by the running API. Only seed CLIs read it. */
export function loadSeedEnv(root: string, mode: string): Record<string, string> {
  return { ...loadEnvFile(root, '.seed.env'), ...loadEnvFile(root, `${mode}/.seed.env`) };
}

/** Loads URL_API_BASE for a target. */
export function loadApiBaseUrl(root: string, mode: string): string | undefined {
  return (
    process.env.PAM_OPS_API_BASE_URL ??
    process.env.PAM_TEST_API_BASE_URL ??
    loadPublicEnv(root, mode).URL_API_BASE
  );
}

/** Loads OPS_TOKEN for a target — same layering as loadApiBaseUrl, over the
 * private env files instead. `withOpsTunnel` sets `PAM_OPS_TOKEN` for every
 * transport (dev / ssh / ftp) so loopback and gateway paths share one header. */
export function loadOpsToken(root: string, mode: string): string | undefined {
  const fromTunnel = process.env.PAM_OPS_TOKEN?.trim();
  if (fromTunnel) return fromTunnel;
  return { ...loadEnvFile(root, '.private.env'), ...loadEnvFile(root, `${mode}/.private.env`) }.OPS_TOKEN;
}

export type Mode = 'dev' | 'preprod' | 'prod';

/** Upsert key=value lines into `.env/<mode>/.private.env`. Creates the file
 * (and parent dir) when missing. Replaces an existing key's line in place;
 * appends new keys at the end. Preserves unrelated lines and comments.
 * Returns the set of keys that already existed and were overwritten. */
export function upsertPrivateEnv(
  root: string,
  mode: Mode,
  updates: Record<string, string>,
): { path: string; replaced: string[] } {
  const dir = join(root, '.env', mode);
  const filePath = join(dir, '.private.env');
  mkdirSync(dir, { recursive: true });

  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  const lines = existing.length > 0 ? existing.split('\n') : [];
  // Drop trailing empty line from split so we don't accumulate blanks; we
  // re-add a final newline on write.
  if (lines.length === 1 && lines[0] === '') lines.pop();
  else if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const replaced: string[] = [];
  const remaining = { ...updates };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key in remaining) {
      lines[i] = `${key}=${remaining[key]}`;
      replaced.push(key);
      delete remaining[key];
    }
  }

  for (const [key, value] of Object.entries(remaining)) {
    lines.push(`${key}=${value}`);
  }

  writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf-8');
  return { path: filePath, replaced };
}

/** Loads STRIPE_SECRET_KEY for a target — used by `faker seed` to turn Stripe
 * test tokens into PaymentMethods (never logged). */
export function loadStripeSecretKey(root: string, mode: string): string | undefined {
  return {
    ...loadEnvFile(root, '.private.env'),
    ...loadEnvFile(root, `${mode}/.private.env`),
  }.STRIPE_SECRET_KEY;
}

export function isValidMode(value: string | undefined): value is Mode {
  return value === 'dev' || value === 'preprod' || value === 'prod';
}
