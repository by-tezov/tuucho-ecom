/**
 * Resolves public/private/role overlay paths for one config tree (kernel or a
 * plugin). Each tree's common `config.json` may declare an `environments`
 * map with relative file paths; when absent, name-style and folder-style
 * discovery still work.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export type JsonObject = Record<string, unknown>;

export type EnvLayerPaths = {
  public?: string;
  private?: string;
  role?: string;
};

/**
 * Example sibling of a config file path: insert `.example` before `.json`.
 * `dev/config.private.json` → `dev/config.private.example.json`
 * `config.private.preprod.json` → `config.private.preprod.example.json`
 * Same rule for public files if an example is ever needed.
 */
export function exampleSibling(filePath: string): string {
  if (filePath.endsWith('.example.json')) return filePath;
  if (filePath.endsWith('.json')) return `${filePath.slice(0, -'.json'.length)}.example.json`;
  return `${filePath}.example.json`;
}

export type EnvironmentsMap = Record<string, EnvLayerPaths>;

export type ResolvedConfigPaths = {
  treeRoot: string;
  commonPublic: string;
  commonPrivate: string;
  commonPrivateExample: string;
  commonRole: string;
  envPublic: string;
  envPrivate: string;
  envPrivateExample: string;
  envRole: string;
  /** True when common `config.json` declared an `environments` map. */
  declared: boolean;
  warnings: string[];
};

const ENV_NAME = /^[a-z][a-z0-9-]*$/;
const RESERVED_DIR = new Set(['plugins', 'private', 'role', 'kernel']);

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isEnvName(value: string): boolean {
  return ENV_NAME.test(value);
}

/** Safe relative path under `treeRoot`. Rejects absolute paths and `..`. */
export function resolveTreeRelative(treeRoot: string, relativePath: string, label: string): string {
  const raw = relativePath.trim().replaceAll('\\', '/');
  if (!raw) throw new Error(`${label} path is empty.`);
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw new Error(`${label} path must be relative (got "${relativePath}").`);
  }
  if (raw.split('/').includes('..')) {
    throw new Error(`${label} path must not contain ".." (got "${relativePath}").`);
  }
  const resolved = resolve(treeRoot, raw);
  const root = resolve(treeRoot);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`${label} path must stay within the config tree (got "${relativePath}").`);
  }
  return resolved;
}

export function readEnvironmentsMap(common: JsonObject): EnvironmentsMap | null {
  const raw = common.environments;
  if (raw === undefined) return null;
  if (!isObject(raw)) throw new Error('environments must be an object keyed by env name.');
  const out: EnvironmentsMap = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!isEnvName(name) || RESERVED_DIR.has(name)) {
      throw new Error(`environments key "${name}" is not a valid env name.`);
    }
    if (!isObject(entry)) throw new Error(`environments.${name} must be an object.`);
    if ('privateExample' in entry) {
      throw new Error(
        `environments.${name}.privateExample must not be set; the example path is derived from private (insert .example before .json).`,
      );
    }
    const layer: EnvLayerPaths = {};
    for (const key of ['public', 'private', 'role'] as const) {
      const value = entry[key];
      if (value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`environments.${name}.${key} must be a non-empty string.`);
      }
      layer[key] = value.trim().replaceAll('\\', '/');
    }
    out[name] = layer;
  }
  return out;
}

function readJsonIfPresent(path: string): JsonObject | null {
  if (!existsSync(path)) return null;
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isObject(parsed)) throw new Error(`${path} must be a JSON object.`);
  return parsed;
}

/** Kernel tree root: prefer `tuucho-config/kernel/`, else legacy flat root. */
export function resolveKernelTreeRoot(shopConfigRoot: string): string {
  const nested = join(shopConfigRoot, 'kernel');
  if (existsSync(join(nested, 'config.json'))) return nested;
  if (existsSync(join(shopConfigRoot, 'config.json'))) return shopConfigRoot;
  // Prefer nested even when empty so new shops write under kernel/.
  if (existsSync(nested) && statSync(nested).isDirectory()) return nested;
  return shopConfigRoot;
}

function firstExisting(...candidates: string[]): string | undefined {
  return candidates.find((path) => existsSync(path));
}

function discoverEnvPublic(treeRoot: string, env: string, shopConfigRoot?: string): string {
  const folder = join(treeRoot, env, 'config.json');
  const named = join(treeRoot, `config.${env}.json`);
  const hit = firstExisting(folder, named);
  if (hit) return hit;
  if (shopConfigRoot && resolve(treeRoot) !== resolve(shopConfigRoot)) {
    const legacyFolder = join(shopConfigRoot, env, 'config.json');
    const legacyNamed = join(shopConfigRoot, `config.${env}.json`);
    const legacy = firstExisting(legacyFolder, legacyNamed);
    if (legacy) return legacy;
  }
  // Canonical write target when creating: folder style under the tree.
  return folder;
}

/** Prefer a private path that already exists, else one whose `.example` sibling exists. */
function discoverEnvPrivate(treeRoot: string, env: string, shopConfigRoot?: string): string {
  const candidates = [
    join(treeRoot, env, 'config.private.json'),
    join(treeRoot, `config.private.${env}.json`),
  ];
  if (shopConfigRoot && resolve(treeRoot) !== resolve(shopConfigRoot)) {
    candidates.push(
      join(shopConfigRoot, env, 'config.private.json'),
      join(shopConfigRoot, `config.private.${env}.json`),
    );
  }
  const existing = firstExisting(...candidates);
  if (existing) return existing;
  for (const candidate of candidates) {
    if (existsSync(exampleSibling(candidate))) return candidate;
  }
  return candidates[0]!;
}

function discoverEnvRole(treeRoot: string, env: string, shopConfigRoot?: string): string {
  const folder = join(treeRoot, env, 'config.role.json');
  const named = join(treeRoot, `config.role.${env}.json`);
  const hit = firstExisting(folder, named);
  if (hit) return hit;
  if (shopConfigRoot && resolve(treeRoot) !== resolve(shopConfigRoot)) {
    const legacy = firstExisting(
      join(shopConfigRoot, env, 'config.role.json'),
      join(shopConfigRoot, `config.role.${env}.json`),
    );
    if (legacy) return legacy;
  }
  return folder;
}

function discoverCommonRole(treeRoot: string, shopConfigRoot?: string): string {
  const nested = join(treeRoot, 'config.role.json');
  if (existsSync(nested)) return nested;
  if (shopConfigRoot && resolve(treeRoot) !== resolve(shopConfigRoot)) {
    const legacy = join(shopConfigRoot, 'config.role.json');
    if (existsSync(legacy)) return legacy;
  }
  return nested;
}

export type ResolveConfigPathsOptions = {
  /** Shop `tuucho-config/` root; enables legacy flat fallback for kernel trees. */
  shopConfigRoot?: string;
  /** When true, resolve `role` paths (kernel only). */
  includeRole?: boolean;
  /**
   * When false, skip the “add an environments block” discovery warning.
   * Plugins commonly omit the map; kernel boot/doctor keep the reminder.
   */
  warnIfUndeclared?: boolean;
};

/** Resolve all layer paths for `env` under `treeRoot`. */
export function resolveConfigPaths(
  treeRoot: string,
  env: string,
  options: ResolveConfigPathsOptions = {},
): ResolvedConfigPaths {
  const warnings: string[] = [];
  const shopConfigRoot = options.shopConfigRoot;
  const includeRole = options.includeRole === true;
  const warnIfUndeclared = options.warnIfUndeclared !== false;
  const commonPublic = join(treeRoot, 'config.json');
  const commonPrivate = join(treeRoot, 'config.private.json');
  const commonPrivateExample = exampleSibling(commonPrivate);
  const commonRole = includeRole
    ? discoverCommonRole(treeRoot, shopConfigRoot)
    : join(treeRoot, 'config.role.json');

  let map: EnvironmentsMap | null = null;
  if (existsSync(commonPublic)) {
    try {
      const common = readJsonIfPresent(commonPublic);
      if (common) map = readEnvironmentsMap(common);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  }

  const declared = map !== null;
  const layer = map?.[env];

  let envPublic: string;
  let envPrivate: string;
  let envRole: string;

  if (declared && layer) {
    envPublic = layer.public
      ? resolveTreeRelative(treeRoot, layer.public, `environments.${env}.public`)
      : discoverEnvPublic(treeRoot, env, shopConfigRoot);
    envPrivate = layer.private
      ? resolveTreeRelative(treeRoot, layer.private, `environments.${env}.private`)
      : discoverEnvPrivate(treeRoot, env, shopConfigRoot);
    envRole =
      includeRole && layer.role
        ? resolveTreeRelative(treeRoot, layer.role, `environments.${env}.role`)
        : includeRole
          ? discoverEnvRole(treeRoot, env, shopConfigRoot)
          : join(treeRoot, env, 'config.role.json');
  } else {
    envPublic = discoverEnvPublic(treeRoot, env, shopConfigRoot);
    envPrivate = discoverEnvPrivate(treeRoot, env, shopConfigRoot);
    envRole = includeRole
      ? discoverEnvRole(treeRoot, env, shopConfigRoot)
      : join(treeRoot, env, 'config.role.json');
    if (!declared) {
      if (warnIfUndeclared) {
        warnings.push(
          `No environments map in ${commonPublic}; using folder/name discovery. Add an environments block to pin paths.`,
        );
      }
    } else if (!layer) {
      warnings.push(`environments map has no entry for "${env}"; using folder/name discovery for that env.`);
    }
  }

  // Example files are never declared: always the `.example` sibling of private.
  const envPrivateExample = exampleSibling(envPrivate);

  // When both folder and name exist under discovery, prefer the path we already
  // chose (folder first). Warn if the alternate also exists.
  if (!declared || !layer?.public) {
    const folder = join(treeRoot, env, 'config.json');
    const named = join(treeRoot, `config.${env}.json`);
    if (existsSync(folder) && existsSync(named) && resolve(envPublic) === resolve(folder)) {
      warnings.push(`Both ${folder} and ${named} exist; using folder style.`);
    }
  }

  return {
    treeRoot,
    commonPublic,
    commonPrivate,
    commonPrivateExample,
    commonRole,
    envPublic,
    envPrivate,
    envPrivateExample,
    envRole,
    declared,
    warnings,
  };
}

/** Environment names for a tree: map keys, else discovered folders/names. */
export function listTreeEnvironments(treeRoot: string, shopConfigRoot?: string): string[] {
  const names = new Set<string>();
  const commonPath = join(treeRoot, 'config.json');
  if (existsSync(commonPath)) {
    try {
      const common = readJsonIfPresent(commonPath);
      const map = common ? readEnvironmentsMap(common) : null;
      if (map) {
        for (const name of Object.keys(map)) names.add(name);
        return [...names].sort();
      }
    } catch {
      // Fall through to discovery.
    }
  }

  const scanRoots = [treeRoot];
  if (shopConfigRoot && resolve(treeRoot) !== resolve(shopConfigRoot)) scanRoots.push(shopConfigRoot);

  for (const root of scanRoots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!isEnvName(entry.name) || RESERVED_DIR.has(entry.name)) continue;
        if (existsSync(join(root, entry.name, 'config.json'))) names.add(entry.name);
        continue;
      }
      const match = /^config\.([a-z][a-z0-9-]*)\.json$/.exec(entry.name);
      const env = match?.[1];
      if (env && isEnvName(env) && !RESERVED_DIR.has(env) && env !== 'private' && env !== 'role') {
        names.add(env);
      }
    }
  }
  return [...names].sort();
}

/** Kernel convenience: tree root + paths for APP_TARGET. */
export function resolveKernelConfigPaths(shopConfigRoot: string, env: string): ResolvedConfigPaths {
  const treeRoot = resolveKernelTreeRoot(shopConfigRoot);
  return resolveConfigPaths(treeRoot, env, { shopConfigRoot, includeRole: true });
}

/** Default folder-style layer paths for a new env (relative to the tree root). */
export function defaultFolderEnvLayer(env: string): EnvLayerPaths {
  return {
    public: `${env}/config.json`,
    private: `${env}/config.private.json`,
    role: `${env}/config.role.json`,
  };
}

/**
 * Ensure `environments.<env>` exists in common `config.json` under `treeRoot`.
 * Creates the map when absent. Does not overwrite an existing entry for `env`.
 * Returns the absolute common path and whether the file was changed.
 */
export function ensureEnvironmentEntry(
  treeRoot: string,
  env: string,
  layer: EnvLayerPaths = defaultFolderEnvLayer(env),
  options: { includeRole?: boolean } = {},
): { commonPath: string; changed: boolean } {
  if (!isEnvName(env) || RESERVED_DIR.has(env)) {
    throw new Error(`invalid env name "${env}"`);
  }
  const commonPath = join(treeRoot, 'config.json');
  const existing = readJsonIfPresent(commonPath) ?? {};
  let map = readEnvironmentsMap(existing);
  if (!map) map = {};
  if (map[env]) return { commonPath, changed: false };
  const entry: EnvLayerPaths = {
    public: layer.public ?? `${env}/config.json`,
    private: layer.private ?? `${env}/config.private.json`,
  };
  if (options.includeRole !== false && layer.role) entry.role = layer.role;
  map[env] = entry;
  const next: JsonObject = { ...existing, environments: map };
  // Keep environments near the top for operators.
  const ordered: JsonObject = { environments: map };
  for (const [key, value] of Object.entries(next)) {
    if (key === 'environments') continue;
    ordered[key] = value;
  }
  mkdirSync(treeRoot, { recursive: true });
  writeFileSync(commonPath, `${JSON.stringify(ordered, null, 2)}\n`);
  return { commonPath, changed: true };
}
