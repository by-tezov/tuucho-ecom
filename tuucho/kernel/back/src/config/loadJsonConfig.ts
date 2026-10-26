import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRIVATE_ENV_MAP, PUBLIC_ENV_MAP, REQUIRED_PRIVATE_PATHS } from './configEnvMap.js';

export type AppTarget = string;
export type JsonObject = Record<string, unknown>;

export type ConfigBootStatus =
  | {
      ok: true;
      target: AppTarget;
      privateSource: 'private' | 'example';
      warnings: string[];
      errors: string[];
    }
  | {
      ok: false;
      target: string;
      privateSource: 'none' | 'private' | 'example';
      warnings: string[];
      errors: string[];
    };

const ENV_NAME = /^[a-z][a-z0-9-]*$/;

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function deepMerge(base: JsonObject, overlay: JsonObject): JsonObject {
  const out: JsonObject = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] = isObject(current) && isObject(value) ? deepMerge(current, value) : value;
  }
  return out;
}

function readJsonFile(path: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(parsed)) throw new Error(`${path} must be a JSON object.`);
  return parsed;
}

function getPath(obj: JsonObject, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function flattenMapped(obj: JsonObject, map: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [path, envKey] of Object.entries(map)) {
    const value = getPath(obj, path);
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      env[envKey] = value.map((entry) => String(entry)).join(',');
      continue;
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
      env[envKey] = String(value);
    }
  }
  return env;
}

export function flattenConfigToEnv(merged: JsonObject): Record<string, string> {
  return { ...flattenMapped(merged, PUBLIC_ENV_MAP), ...flattenMapped(merged, PRIVATE_ENV_MAP) };
}

function missingRequiredPrivateKeys(privateObj: JsonObject): string[] {
  const missing: string[] = [];
  for (const path of REQUIRED_PRIVATE_PATHS) {
    const value = getPath(privateObj, path);
    if (typeof value !== 'string' || value.trim() === '') missing.push(path);
  }
  return missing;
}

export function isEnvName(value: string): boolean {
  return ENV_NAME.test(value);
}

export function resolveAppTarget(raw: string | undefined): AppTarget {
  const value = (raw ?? 'dev').trim() || 'dev';
  if (!isEnvName(value)) {
    throw new Error(
      `APP_TARGET must match [a-z][a-z0-9-]* (got ${raw === undefined ? 'unset' : `"${raw}"`}).`,
    );
  }
  return value;
}

/** `root` is the `tuucho-config/` directory (not kernel/back). */
export function configDir(root: string): string {
  return root;
}

const ENV_PUBLIC_FILE = /^config\.([a-z][a-z0-9-]*)\.json$/;

export function listEnvironments(root: string): string[] {
  const dir = configDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => ENV_PUBLIC_FILE.exec(name)?.[1])
    .filter((name): name is string => Boolean(name && name !== 'role' && isEnvName(name)))
    .sort();
}

export function configPaths(root: string, target: AppTarget) {
  const common = configDir(root);
  return {
    commonPublic: join(common, 'config.json'),
    envPublic: join(common, `config.${target}.json`),
    commonPrivate: join(common, 'config.private.json'),
    commonPrivateExample: join(common, 'config.private.example.json'),
    envPrivate: join(common, `config.private.${target}.json`),
    envPrivateExample: join(common, `config.private.${target}.example.json`),
  };
}

function loadPrivateLayer(
  file: string,
  example: string,
  warnings: string[],
): { source: 'none' | 'private' | 'example'; obj: JsonObject } {
  if (existsSync(file)) {
    return { source: 'private', obj: readJsonFile(file) };
  }
  if (existsSync(example)) {
    const obj = readJsonFile(example);
    if (Object.keys(obj).length === 0) return { source: 'none', obj: {} };
    warnings.push(`${file} is missing; loading ${example} (placeholders in use).`);
    return { source: 'example', obj };
  }
  return { source: 'none', obj: {} };
}

export function inspectConfig(root: string, targetRaw?: string): ConfigBootStatus & { merged?: JsonObject } {
  let target: AppTarget;
  try {
    target = resolveAppTarget(targetRaw ?? process.env.APP_TARGET);
  } catch (error) {
    return {
      ok: false,
      target: targetRaw ?? process.env.APP_TARGET ?? '',
      privateSource: 'none',
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
  const paths = configPaths(root, target);
  const errors: string[] = [];
  const warnings: string[] = [];
  const known = listEnvironments(root);
  if (!existsSync(paths.envPublic)) {
    errors.push(`missing ${paths.envPublic}${known.length > 0 ? ` (known: ${known.join(', ')})` : ''}.`);
    return { ok: false, target, privateSource: 'none', warnings, errors };
  }
  if (!existsSync(paths.commonPublic)) {
    errors.push(`missing ${paths.commonPublic} (broken tree).`);
  }

  const commonPrivate = loadPrivateLayer(paths.commonPrivate, paths.commonPrivateExample, warnings);
  const envPrivate = loadPrivateLayer(paths.envPrivate, paths.envPrivateExample, warnings);
  const mergedPrivate = deepMerge(commonPrivate.obj, envPrivate.obj);
  const missing = missingRequiredPrivateKeys(mergedPrivate);
  const usingPrivate = commonPrivate.source === 'private' || envPrivate.source === 'private';
  const noPrivateLayer = commonPrivate.source === 'none' && envPrivate.source === 'none';
  if (missing.length > 0 && (usingPrivate || noPrivateLayer)) {
    errors.push(`private JSON is missing required keys: ${missing.join(', ')}.`);
  }

  if (errors.length > 0) {
    return { ok: false, target, privateSource: envPrivate.source, warnings, errors };
  }
  const merged = deepMerge(
    deepMerge(deepMerge(readJsonFile(paths.commonPublic), readJsonFile(paths.envPublic)), commonPrivate.obj),
    envPrivate.obj,
  );
  return {
    ok: true,
    target,
    privateSource:
      envPrivate.source === 'private' || commonPrivate.source === 'private' ? 'private' : 'example',
    warnings,
    errors,
    merged,
  };
}

export function envSummary(root: string): string[] {
  const dir = configDir(root);
  const names = listEnvironments(root);
  if (!existsSync(dir)) return ['(no tuucho-config/ folder)'];
  if (names.length === 0) return ['(no config.<env>.json files under tuucho-config/)'];
  return names.map((name) => {
    const paths = configPaths(root, name);
    const privateOk = existsSync(paths.envPrivate);
    const exampleOk = existsSync(paths.envPrivateExample);
    return `${name}: public overlay present; private file ${privateOk ? 'present' : 'missing'}; example ${
      exampleOk ? 'present' : 'MISSING'
    }${!privateOk && exampleOk ? ' (would load example)' : ''}.`;
  });
}

export function formatConfigReport(status: ConfigBootStatus, summary?: string[]): string {
  const lines: string[] = [`APP_TARGET=${status.target || '(invalid)'}`];
  for (const warning of status.warnings) lines.push(`warning: ${warning}`);
  for (const error of status.errors) lines.push(`error: ${error}`);
  if (status.ok && status.warnings.length === 0) {
    lines.push(`private source: ${status.privateSource}.`);
  }
  if (summary) {
    lines.push('environments:');
    for (const line of summary) lines.push(`  ${line}`);
  }
  return lines.join('\n');
}

/** Disposable-server overlays. Applied after tuucho-config flatten. Never maps onto the Vite shop port. */
export const TUUCHO_TEST_ENV_OVERLAYS: Record<string, string> = {
  TUUCHO_TEST_API_BASE: 'URL_API_BASE',
  TUUCHO_TEST_SITE_URL: 'URL_FRONTEND_BASE',
  TUUCHO_TEST_FRONTEND_BASE: 'URL_FRONTEND_BASE',
  TUUCHO_TEST_PUBLIC_MEDIA: 'URL_PUBLIC_MEDIA',
};

/** Scalar test-harness overlays for the front served from this env. Each
 * target is filled only when unset, so an explicit VITE_* value always wins.
 * TUUCHO_TEST_LOADING_MIN spreads over the three loading floors. */
export const TUUCHO_TEST_VALUE_OVERLAYS: Record<string, string[]> = {
  TUUCHO_TEST_LOADING_MIN: ['VITE_LOADING_MIN', 'VITE_LOADING_MIN_SHORT', 'VITE_LOADING_MIN_LONG'],
  TUUCHO_TEST_BOOT_SPLASH_SPEED: ['VITE_BOOT_SPLASH_SPEED'],
};

export function applyTestEnvOverlays(env: NodeJS.ProcessEnv = process.env): void {
  for (const [overlay, target] of Object.entries(TUUCHO_TEST_ENV_OVERLAYS)) {
    const value = env[overlay];
    if (typeof value === 'string' && value.trim()) env[target] = value.trim().replace(/\/$/, '');
  }
  for (const [overlay, targets] of Object.entries(TUUCHO_TEST_VALUE_OVERLAYS)) {
    const value = env[overlay];
    if (typeof value !== 'string' || !value.trim()) continue;
    for (const target of targets) {
      if (env[target] === undefined) env[target] = value.trim();
    }
  }
}

export function applyJsonConfig(root: string, log: (message: string) => void = console.warn): AppTarget {
  const status = inspectConfig(root);
  if (!status.ok || !status.merged) {
    throw new Error(formatConfigReport(status, envSummary(root)));
  }
  for (const warning of status.warnings) log(`[config] warning: ${warning}`);
  const fileEnv = flattenConfigToEnv(status.merged);
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  applyTestEnvOverlays();
  if (process.env.PORT && process.env.APP_PORT === undefined) process.env.APP_PORT = process.env.PORT;
  return status.target;
}
