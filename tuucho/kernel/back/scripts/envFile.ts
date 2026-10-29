import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configPaths, flattenConfigToEnv, inspectConfig, isEnvName, resolveAppTarget } from '../src/config/loadJsonConfig.js';
import { PRIVATE_ENV_MAP } from '../src/config/configEnvMap.js';

export type Mode = string;

/** Seed fixture reader (`tuucho/sample/seed-defaults.env`). Not leftover process env. */

function hasKernelOrFlatConfig(dir: string): boolean {
  return existsSync(join(dir, 'config.json')) || existsSync(join(dir, 'kernel', 'config.json'));
}

function resolveConfigRoot(root: string): string {
  if (hasKernelOrFlatConfig(root)) return root;
  if (hasKernelOrFlatConfig(join(root, 'tuucho-config'))) return join(root, 'tuucho-config');
  const nested = join(root, '../../..', 'tuucho-config');
  if (hasKernelOrFlatConfig(nested)) return nested;
  return root;
}

function loadFlat(root: string, mode: string): Record<string, string> {
  const status = inspectConfig(resolveConfigRoot(root), mode);
  if (!status.ok || !status.merged) {
    throw new Error(status.errors.join('\n'));
  }
  return flattenConfigToEnv(status.merged);
}

export function loadPublicEnv(root: string, mode: string): Record<string, string> {
  return loadFlat(root, mode);
}

export function loadSeedEnv(_root: string, _mode: string): Record<string, string> {
  const fixture = join(_root, '..', '..', 'sample', 'seed-defaults.env');
  if (!existsSync(fixture)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(fixture, 'utf-8').split('\n')) {
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

export function loadApiBaseUrl(root: string, mode: string): string | undefined {
  return process.env.PAM_OPS_API_BASE_URL ?? loadPublicEnv(root, mode).URL_API_BASE;
}

export function loadOpsToken(root: string, mode: string): string | undefined {
  const fromTunnel = process.env.PAM_OPS_TOKEN?.trim();
  if (fromTunnel) return fromTunnel;
  return loadPublicEnv(root, mode).OPS_TOKEN;
}

function setPath(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (!next || typeof next !== 'object' || Array.isArray(next)) current[key] = {};
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/** Merge leftover kernel private keys into `config.private.<mode>.json`.
 * Plugin secrets (Stripe, Mondial) are rejected. */
export function upsertPrivateEnv(
  root: string,
  mode: Mode,
  updates: Record<string, string>,
): { path: string; replaced: string[] } {
  resolveAppTarget(mode);
  const filePath = configPaths(resolveConfigRoot(root), mode).envPrivate;
  const existing = existsSync(filePath)
    ? (JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>)
    : {};
  const envToPath = Object.fromEntries(Object.entries(PRIVATE_ENV_MAP).map(([path, key]) => [key, path]));
  const replaced: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const path = envToPath[key];
    if (!path) continue;
    setPath(existing, path, value);
    replaced.push(key);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(existing, null, 2)}\n`);
  return { path: filePath, replaced };
}

function piiEncryptionKey(root: string, mode: string): string | undefined {
  const status = inspectConfig(resolveConfigRoot(root), mode);
  if (!status.ok || !status.merged) return undefined;
  const pii = status.merged.pii;
  if (!pii || typeof pii !== 'object' || Array.isArray(pii)) return undefined;
  const key = (pii as { encryptionKey?: unknown }).encryptionKey;
  return typeof key === 'string' && key.trim() ? key : undefined;
}

export async function loadStripeSecretKey(root: string, mode: string): Promise<string | undefined> {
  const databaseUrl = loadPublicEnv(root, mode).DATABASE_URL;
  if (!databaseUrl) return undefined;
  const { default: pg } = await import('pg');
  const { unsealPluginSecrets } = await import('../src/modules/plugins/application/pluginSecretsCrypto.js');
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    const result = await pool.query<{ secrets: unknown }>(`select secrets from plugins where id = $1`, [
      'tuucho-payment-stripe',
    ]);
    const secret = unsealPluginSecrets(result.rows[0]?.secrets, piiEncryptionKey(root, mode)).secretKey?.trim();
    return secret || undefined;
  } finally {
    await pool.end();
  }
}

export function isValidMode(value: string | undefined): value is Mode {
  return typeof value === 'string' && isEnvName(value);
}
