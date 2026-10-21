import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { REQUIRED_PRIVATE_PATHS } from './configEnvMap.js';
import { isEnvName, type JsonObject } from './loadJsonConfig.js';

export const FACTORY_REL = 'tuucho/factory-config';
export const STAMP_NAME = 'migrate-stamp.json';
const STEP_FILE = /^[0-9][0-9a-z_-]+\.json$/;
const REQUIRED_PRIVATE = new Set<string>(REQUIRED_PRIVATE_PATHS);

export type MigrateOptions = {
  packRoot: string;
  dryRun?: boolean;
  strict?: boolean;
};

export type MigrateResult = {
  copied: boolean;
  dryRun: boolean;
  logs: string[];
  warnings: string[];
  errors: string[];
  pending: string[];
};

type Stamp = { kernel: string[]; plugins: Record<string, string[]> };

type MigrateOp = {
  op: 'add' | 'rename' | 'remove';
  path?: string;
  from?: string;
  to?: string;
  layer?: 'public' | 'private' | 'both';
  env?: string;
  fromFactory?: boolean;
  value?: unknown;
};

type MigrateStep = { id: string; owner: string; ops: MigrateOp[] };

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}

function getPath(obj: JsonObject, path: string): unknown {
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return current;
}

function hasPath(obj: JsonObject, path: string): boolean {
  let current: unknown = obj;
  const parts = path.split('.');
  for (let i = 0; i < parts.length; i += 1) {
    if (!isObject(current) || !(parts[i]! in current)) return false;
    current = current[parts[i]!];
  }
  return true;
}

function setPath(obj: JsonObject, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = current[key];
    if (!isObject(next)) current[key] = {};
    current = current[key] as JsonObject;
  }
  current[parts[parts.length - 1]!] = value;
}

function deletePath(obj: JsonObject, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!isObject(current)) return false;
    current = current[parts[i]!];
  }
  if (!isObject(current) || !(parts[parts.length - 1]! in current)) return false;
  delete current[parts[parts.length - 1]!];
  return true;
}

function collectPaths(obj: JsonObject, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) out.push(...collectPaths(value, path));
    else out.push(path);
  }
  return out;
}

async function listStepFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const names = await readdir(dir);
  return names.filter((name) => STEP_FILE.test(name)).sort();
}

async function loadStamp(shopConfig: string): Promise<Stamp> {
  const path = join(shopConfig, STAMP_NAME);
  if (!(await pathExists(path))) return { kernel: [], plugins: {} };
  try {
    const raw = await readJson(path);
    if (!isObject(raw)) return { kernel: [], plugins: {} };
    const kernel = Array.isArray(raw.kernel) ? raw.kernel.filter((id): id is string => typeof id === 'string') : [];
    const plugins: Record<string, string[]> = {};
    if (isObject(raw.plugins)) {
      for (const [id, ids] of Object.entries(raw.plugins)) {
        if (Array.isArray(ids)) plugins[id] = ids.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return { kernel, plugins };
  } catch {
    return { kernel: [], plugins: {} };
  }
}

export async function listKernelStepIds(packRoot: string): Promise<string[]> {
  const files = await listStepFiles(join(packRoot, FACTORY_REL, 'migrations', 'kernel'));
  return files.map((name) => name.replace(/\.json$/, ''));
}

export async function migrateStampBehind(packRoot: string, shopConfig: string): Promise<string[]> {
  const stamp = await loadStamp(shopConfig);
  const kernel = await listKernelStepIds(packRoot);
  return kernel.filter((id) => !stamp.kernel.includes(id));
}

function shouldCopyFactoryFile(rel: string): boolean {
  const posix = rel.replaceAll('\\', '/');
  if (posix === 'migrations' || posix.startsWith('migrations/')) return false;
  if (posix.endsWith('/config.private.json') || posix === 'config.private.json') return false;
  if (posix === 'plugins.json') return false;
  return true;
}

async function copyFactory(factory: string, dest: string, dryRun: boolean, logs: string[]): Promise<void> {
  async function walk(fromDir: string, rel: string): Promise<void> {
    const names = await readdir(fromDir, { withFileTypes: true });
    for (const entry of names) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (!shouldCopyFactoryFile(childRel) && entry.isDirectory() && entry.name === 'migrations') continue;
      if (!shouldCopyFactoryFile(childRel) && !entry.isDirectory()) continue;
      const from = join(fromDir, entry.name);
      const to = join(dest, childRel);
      if (entry.isDirectory()) {
        if (!dryRun) await mkdir(to, { recursive: true });
        await walk(from, childRel);
        continue;
      }
      logs.push(`copy ${childRel}`);
      if (!dryRun) {
        await mkdir(dirname(to), { recursive: true });
        await cp(from, to);
      }
    }
  }
  await walk(factory, '');
}

async function materialisePrivates(dest: string, dryRun: boolean, logs: string[], warnings: string[]): Promise<void> {
  async function walk(dir: string): Promise<void> {
    const names = await readdir(dir, { withFileTypes: true });
    for (const entry of names) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name === 'config.private.example.json') {
        const privatePath = join(dir, 'config.private.json');
        if (await pathExists(privatePath)) continue;
        logs.push(`private from example ${privatePath}`);
        if (!dryRun) await cp(full, privatePath);
        warnings.push(`${privatePath} created from example (edit before production).`);
      }
      if (entry.name === 'plugins.example.json') {
        const live = join(dir, 'plugins.json');
        if (await pathExists(live)) continue;
        logs.push('plugins.json from plugins.example.json');
        if (!dryRun) await cp(full, live);
      }
    }
  }
  await walk(dest);
}

async function listShopEnvs(shopConfig: string): Promise<string[]> {
  if (!(await pathExists(shopConfig))) return [];
  const names = await readdir(shopConfig, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of names) {
    if (entry.isDirectory() && isEnvName(entry.name) && (await pathExists(join(shopConfig, entry.name, 'config.json')))) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

async function applyOpToFile(
  file: string,
  op: MigrateOp,
  factoryFile: string | null,
  dryRun: boolean,
  warnings: string[],
  logs: string[],
  allowRequiredPrivateAdd: boolean,
): Promise<void> {
  if (!(await pathExists(file))) return;
  const raw = await readJson(file);
  if (!isObject(raw)) return;
  let changed = false;
  if (op.op === 'add') {
    const path = op.path;
    if (!path) return;
    if (REQUIRED_PRIVATE.has(path) && !allowRequiredPrivateAdd) {
      warnings.push(`skip add ${path} on existing shop (required private; doctor must fail if empty).`);
      return;
    }
    if (hasPath(raw, path)) return;
    let value: unknown = op.value;
    if (op.fromFactory) {
      if (!factoryFile || !(await pathExists(factoryFile))) {
        warnings.push(`factory missing for add ${path}`);
        return;
      }
      const factoryRaw = await readJson(factoryFile);
      if (!isObject(factoryRaw) || !hasPath(factoryRaw, path)) {
        warnings.push(`factory has no ${path}`);
        return;
      }
      value = getPath(factoryRaw, path);
    }
    logs.push(`add ${path} -> ${file}`);
    setPath(raw, path, value);
    changed = true;
  } else if (op.op === 'rename') {
    if (!op.from || !op.to) return;
    if (!hasPath(raw, op.from)) {
      warnings.push(`rename skip, missing ${op.from} in ${file}`);
      return;
    }
    if (hasPath(raw, op.to)) {
      warnings.push(`rename skip clobber, ${op.to} already set in ${file}`);
      return;
    }
    logs.push(`rename ${op.from} -> ${op.to} in ${file}`);
    setPath(raw, op.to, getPath(raw, op.from));
    deletePath(raw, op.from);
    changed = true;
  } else if (op.op === 'remove') {
    if (!op.path) return;
    if (!hasPath(raw, op.path)) return;
    logs.push(`remove ${op.path} from ${file}`);
    deletePath(raw, op.path);
    changed = true;
  }
  if (changed && !dryRun) await writeJsonAtomic(file, raw);
}

async function applyStep(
  step: MigrateStep,
  packRoot: string,
  shopConfig: string,
  dryRun: boolean,
  warnings: string[],
  logs: string[],
  firstInstall: boolean,
): Promise<void> {
  const factory = join(packRoot, FACTORY_REL);
  const envs = await listShopEnvs(shopConfig);
  for (const op of step.ops) {
    if (!op.op || !['add', 'rename', 'remove'].includes(op.op)) {
      throw new Error(`unknown op in ${step.id}`);
    }
    const layer = op.layer ?? 'public';
    const envSel = op.env ?? 'common';
    const targets: { shop: string; factory: string }[] = [];
    const push = (relShop: string, relFactory: string) => {
      targets.push({ shop: join(shopConfig, relShop), factory: join(factory, relFactory) });
    };
    const envNames = envSel === 'all' ? ['', ...envs] : envSel === 'common' ? [''] : [envSel];
    for (const env of envNames) {
      const prefix = env ? `${env}/` : '';
      if (layer === 'public' || layer === 'both') push(`${prefix}config.json`, `${prefix}config.json`);
      if (layer === 'private' || layer === 'both') {
        push(`${prefix}config.private.json`, `${prefix}config.private.example.json`);
        push(`${prefix}config.private.example.json`, `${prefix}config.private.example.json`);
      }
    }
    for (const target of targets) {
      const isPrivate = target.shop.endsWith('config.private.json');
      await applyOpToFile(
        target.shop,
        op,
        target.factory,
        dryRun,
        warnings,
        logs,
        firstInstall && isPrivate,
      );
    }
  }
}

async function fillPublicFromFactory(
  factoryFile: string,
  shopFile: string,
  dryRun: boolean,
  warnings: string[],
  logs: string[],
): Promise<void> {
  if (!(await pathExists(factoryFile)) || !(await pathExists(shopFile))) return;
  const factoryRaw = await readJson(factoryFile);
  const shopRaw = await readJson(shopFile);
  if (!isObject(factoryRaw) || !isObject(shopRaw)) return;
  let changed = false;
  for (const path of collectPaths(factoryRaw)) {
    if (REQUIRED_PRIVATE.has(path)) continue;
    if (hasPath(shopRaw, path)) continue;
    warnings.push(`fill ${path} from factory into ${shopFile}`);
    logs.push(`fill ${path}`);
    setPath(shopRaw, path, getPath(factoryRaw, path));
    changed = true;
  }
  if (changed && !dryRun) await writeJsonAtomic(shopFile, shopRaw);
}

async function parseStepFile(path: string, expectedOwner: string): Promise<MigrateStep | { skip: string }> {
  const raw = await readJson(path);
  if (!isObject(raw)) return { skip: `${path} is not an object` };
  const id = typeof raw.id === 'string' ? raw.id : '';
  const owner = typeof raw.owner === 'string' ? raw.owner : '';
  if (!id || !Array.isArray(raw.ops)) throw new Error(`${path} needs id and ops`);
  if (owner !== expectedOwner) return { skip: `${path} owner ${owner} != ${expectedOwner}` };
  return { id, owner, ops: raw.ops as MigrateOp[] };
}

async function pluginIdsWithFactory(factory: string): Promise<string[]> {
  const dir = join(factory, 'plugins');
  if (!(await pathExists(dir))) return [];
  const names = await readdir(dir, { withFileTypes: true });
  return names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

export async function runConfigMigrate(options: MigrateOptions): Promise<MigrateResult> {
  const dryRun = Boolean(options.dryRun);
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const pending: string[] = [];
  const packRoot = options.packRoot;
  const factory = join(packRoot, FACTORY_REL);
  const shopConfig = join(packRoot, 'tuucho-config');
  if (!(await pathExists(factory))) {
    errors.push(`missing ${factory}`);
    return { copied: false, dryRun, logs, warnings, errors, pending };
  }
  const firstInstall = !(await pathExists(shopConfig));
  if (firstInstall) {
    logs.push('first install: copy factory → tuucho-config/');
    if (!dryRun) await mkdir(shopConfig, { recursive: true });
    await copyFactory(factory, shopConfig, dryRun, logs);
    await materialisePrivates(shopConfig, dryRun, logs, warnings);
  }

  const stamp = firstInstall ? { kernel: [] as string[], plugins: {} as Record<string, string[]> } : await loadStamp(shopConfig);
  const kernelDir = join(factory, 'migrations', 'kernel');
  const kernelFiles = await listStepFiles(kernelDir);
  for (const file of kernelFiles) {
    const id = file.replace(/\.json$/, '');
    if (!firstInstall && stamp.kernel.includes(id)) continue;
    pending.push(`kernel:${id}`);
    if (firstInstall) {
      stamp.kernel.push(id);
      continue;
    }
    try {
      const parsed = await parseStepFile(join(kernelDir, file), 'kernel');
      if ('skip' in parsed) {
        warnings.push(parsed.skip);
        continue;
      }
      await applyStep(parsed, packRoot, shopConfig, dryRun, warnings, logs, false);
      stamp.kernel.push(id);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      break;
    }
  }

  const pluginIds = await pluginIdsWithFactory(factory);
  for (const pluginId of pluginIds) {
    const shopPlugin = join(shopConfig, 'plugins', pluginId);
    const factoryPlugin = join(factory, 'plugins', pluginId);
    if (firstInstall) {
      stamp.plugins[pluginId] = stamp.plugins[pluginId] ?? [];
    }
    const stepDir = join(packRoot, 'tuucho', 'plugins');
    // Bundled plugin steps live under the plugin package config/migrations if present.
    const pluginStepFiles: string[] = [];
    async function findPluginSteps(dir: string): Promise<void> {
      if (!(await pathExists(dir))) return;
      const names = await readdir(dir, { withFileTypes: true });
      for (const entry of names) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          await findPluginSteps(full);
          continue;
        }
        if (entry.name === 'package.json') {
          try {
            const pkg = (await readJson(full)) as { tuucho?: { id?: string } };
            if (pkg?.tuucho?.id !== pluginId) continue;
            const mig = join(dirname(full), 'config', 'migrations');
            pluginStepFiles.push(...(await listStepFiles(mig)).map((name) => join(mig, name)));
          } catch {
            /* skip */
          }
        }
      }
    }
    await findPluginSteps(stepDir);
    const applied = stamp.plugins[pluginId] ?? [];
    for (const stepPath of pluginStepFiles.sort()) {
      const id = stepPath.split('/').pop()!.replace(/\.json$/, '');
      if (!firstInstall && applied.includes(id)) continue;
      pending.push(`${pluginId}:${id}`);
      if (firstInstall) {
        applied.push(id);
        continue;
      }
      try {
        const parsed = await parseStepFile(stepPath, pluginId);
        if ('skip' in parsed) {
          warnings.push(parsed.skip);
          continue;
        }
        const layerFiles = [
          { shop: join(shopPlugin, 'config.json'), factory: join(factoryPlugin, 'config.json') },
          {
            shop: join(shopPlugin, 'config.private.json'),
            factory: join(factoryPlugin, 'config.private.example.json'),
          },
        ];
        for (const op of parsed.ops) {
          if (!['add', 'rename', 'remove'].includes(op.op)) {
            warnings.push(`${pluginId} unknown op, skip file`);
            break;
          }
          const layer = op.layer ?? 'public';
          for (const target of layerFiles) {
            const isPriv = target.shop.endsWith('config.private.json');
            if (layer === 'public' && isPriv) continue;
            if (layer === 'private' && !isPriv) continue;
            await applyOpToFile(target.shop, op, target.factory, dryRun, warnings, logs, false);
          }
        }
        applied.push(id);
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }
    stamp.plugins[pluginId] = applied;
    if (!firstInstall) {
      await fillPublicFromFactory(
        join(factoryPlugin, 'config.json'),
        join(shopPlugin, 'config.json'),
        dryRun,
        warnings,
        logs,
      );
    }
  }

  if (!firstInstall) {
    await fillPublicFromFactory(join(factory, 'config.json'), join(shopConfig, 'config.json'), dryRun, warnings, logs);
    for (const env of await listShopEnvs(shopConfig)) {
      await fillPublicFromFactory(
        join(factory, env, 'config.json'),
        join(shopConfig, env, 'config.json'),
        dryRun,
        warnings,
        logs,
      );
    }
  }

  if (firstInstall && !dryRun) {
    stamp.kernel = await listKernelStepIds(packRoot);
  }
  if (!dryRun) await writeJsonAtomic(join(shopConfig, STAMP_NAME), stamp);

  if (errors.length > 0) {
    return { copied: firstInstall, dryRun, logs, warnings, errors, pending };
  }
  return { copied: firstInstall, dryRun, logs, warnings, errors, pending };
}
