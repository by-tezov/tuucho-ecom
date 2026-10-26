import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../../../db/pool.js';
import { configRoot } from '../../../config/shopPaths.js';
import { isEnvName, resolveAppTarget } from '../../../config/loadJsonConfig.js';
import { isSystemRole, type PermissionGrant } from '../domain/staffPermissions.js';
import { insertRole } from '../infrastructure/rolesStore.js';
import { grantablePermissionCodes, listStaffRoles, updateStaffRole, type StaffRole } from './staffRoles.js';

/** A staff role in `config.role.json`. Built-in `user` and `super-admin` are
 * never listed. Names are language-file copy, not config. */
export type RoleConfigEntry = {
  code: string;
  grants: PermissionGrant[];
  parents: string[];
  assignable: string[];
  assignableDominant: boolean;
  targetable: string[];
  targetableDominant: boolean;
};

const ROLE_FILE = /^config\.role(?:\.([a-z][a-z0-9-]*))?\.json$/;

export function roleConfigPaths(target = resolveAppTarget(process.env.APP_TARGET)) {
  return {
    common: join(configRoot, 'config.role.json'),
    env: join(configRoot, `config.role.${target}.json`),
  };
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) return null;
  return value;
}

export function parseRoleConfig(raw: unknown): RoleConfigEntry[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const roles = (raw as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) return null;
  const parsed: RoleConfigEntry[] = [];
  for (const entry of roles) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.code !== 'string') return null;
    if (isSystemRole(row.code)) continue;
    const grantsRaw = row.grants;
    if (!Array.isArray(grantsRaw)) return null;
    const grants: PermissionGrant[] = [];
    for (const grant of grantsRaw) {
      if (!grant || typeof grant !== 'object' || Array.isArray(grant)) return null;
      const item = grant as Record<string, unknown>;
      if (
        typeof item.permission !== 'string' ||
        typeof item.granted !== 'boolean' ||
        typeof item.dominant !== 'boolean'
      ) {
        return null;
      }
      grants.push({ permission: item.permission, granted: item.granted, dominant: item.dominant });
    }
    const parents = asStringList(row.parents);
    const assignable = asStringList(row.assignable);
    const targetable = asStringList(row.targetable);
    if (!parents || !assignable || !targetable) return null;
    if (typeof row.assignableDominant !== 'boolean' || typeof row.targetableDominant !== 'boolean')
      return null;
    parsed.push({
      code: row.code,
      grants,
      parents,
      assignable,
      assignableDominant: row.assignableDominant,
      targetable,
      targetableDominant: row.targetableDominant,
    });
  }
  return parsed;
}

/** Env entries replace the common role with the same code. New codes are appended. */
export function mergeRoleConfig(
  common: readonly RoleConfigEntry[],
  env: readonly RoleConfigEntry[],
): RoleConfigEntry[] {
  const byCode = new Map(common.map((role) => [role.code, role]));
  const order = common.map((role) => role.code);
  for (const role of env) {
    if (!byCode.has(role.code)) order.push(role.code);
    byCode.set(role.code, role);
  }
  return order.flatMap((code) => {
    const role = byCode.get(code);
    return role ? [role] : [];
  });
}

function readRoleFile(path: string): RoleConfigEntry[] {
  if (!existsSync(path)) return [];
  const parsed = parseRoleConfig(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (!parsed) throw new Error(`${path} must be { "roles": [ ... ] }.`);
  return parsed;
}

export function loadMergedRoleConfig(): { present: boolean; roles: RoleConfigEntry[]; paths: string[] } {
  const paths = roleConfigPaths();
  const listed = [paths.common, paths.env].filter((path) => existsSync(path));
  if (listed.length === 0) return { present: false, roles: [], paths: [] };
  return {
    present: true,
    roles: mergeRoleConfig(readRoleFile(paths.common), readRoleFile(paths.env)),
    paths: listed,
  };
}

export function roleEntryFromStaff(role: StaffRole): RoleConfigEntry {
  return {
    code: role.code,
    grants: role.grants.map((grant) => ({
      permission: grant.permission,
      granted: grant.granted,
      dominant: grant.dominant,
    })),
    parents: [...role.parents],
    assignable: [...role.assignable],
    assignableDominant: role.assignableDominant,
    targetable: [...role.targetable],
    targetableDominant: role.targetableDominant,
  };
}

function canon(roles: readonly RoleConfigEntry[]): string {
  const rows = roles
    .map((role) => ({
      code: role.code,
      grants: [...role.grants].sort((a, b) => a.permission.localeCompare(b.permission)),
      parents: [...role.parents].sort(),
      assignable: [...role.assignable].sort(),
      assignableDominant: role.assignableDominant,
      targetable: [...role.targetable].sort(),
      targetableDominant: role.targetableDominant,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return JSON.stringify(rows);
}

export async function roleConfigStatus(): Promise<{ present: boolean; differ: boolean }> {
  const loaded = loadMergedRoleConfig();
  const current = (await listStaffRoles(pool)).filter((role) => !role.system).map(roleEntryFromStaff);
  return {
    present: loaded.present,
    differ: loaded.present && canon(loaded.roles) !== canon(current),
  };
}

export function writeRoleConfigFile(name: string, roles: readonly RoleConfigEntry[]): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const env = ROLE_FILE.exec(base)?.[1];
  if (env !== undefined && !isEnvName(env)) throw new Error('invalid_name');
  const path = env ? join(configRoot, `config.role.${env}.json`) : join(configRoot, 'config.role.json');
  writeFileSync(path, `${JSON.stringify({ roles }, null, 2)}\n`);
  return path;
}

export async function exportRoleConfigFile(): Promise<{ filename: string; body: string }> {
  const roles = (await listStaffRoles(pool)).filter((role) => !role.system).map(roleEntryFromStaff);
  const body = `${JSON.stringify({ roles }, null, 2)}\n`;
  writeFileSync(roleConfigPaths().common, body);
  return { filename: 'config.role.json', body };
}

export async function applyRoleConfig(): Promise<{ applied: string[]; skipped: string[] }> {
  const loaded = loadMergedRoleConfig();
  if (!loaded.present) throw new Error('no_files');
  const allowed = new Set<string>(await grantablePermissionCodes(pool));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const role of loaded.roles) {
    if (isSystemRole(role.code)) {
      skipped.push(role.code);
      continue;
    }
    for (const grant of role.grants) {
      if (!allowed.has(grant.permission)) throw new Error(`unknown_permission:${grant.permission}`);
    }
    const write = {
      grants: role.grants,
      parents: role.parents,
      assignable: { roles: role.assignable, dominant: role.assignableDominant },
      targetable: { roles: role.targetable, dominant: role.targetableDominant },
    };
    const existing = (await listStaffRoles(pool)).some((entry) => entry.code === role.code);
    if (!existing) {
      // The column is required. The name the admin shows comes from the language files.
      const inserted = await insertRole(pool, role.code, role.code);
      if (!inserted) throw new Error(`role_exists:${role.code}`);
    }
    const result = await updateStaffRole(pool, role.code, write);
    if (!result.ok) throw new Error(`${result.error}:${role.code}`);
    applied.push(role.code);
  }
  return { applied, skipped };
}
