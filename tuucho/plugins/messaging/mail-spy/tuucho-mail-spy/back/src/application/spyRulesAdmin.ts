import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listSpyChannels } from '@kernel/back/modules/messaging/application/spyChannels';
import { CUSTOMER_ROLE, staffEmailIfUnlocked } from '@kernel/back/modules/identity/application/staffMailTargets';
import { listStaffRoles } from '@kernel/back/modules/identity/application/staffRoles';
import { pool } from '@kernel/back/db/pool';
import {
  getCachedPluginSettings,
  patchPluginSettings,
  stampPluginConfigFiles,
} from '@kernel/back/modules/plugins/application/pluginStore';
import { loadPluginConfigFiles, resolvePluginConfigDir } from '@kernel/back/modules/plugins/application/pluginConfigFiles';
import { parseSpyRules, type SpyRule } from './spyResolve.js';
import { normalizeEmailFilter, normalizeRoleFilter } from './spyStore.js';

const PLUGIN_ID = 'tuucho-mail-spy';

export type SpyAdminRecipient = {
  id: string;
  channelId: string;
  filter: 'role' | 'email';
  value: string;
};

function recipientId(channelId: string, filter: 'role' | 'email', value: string): string {
  return Buffer.from(`${channelId}\n${filter}\n${value}`, 'utf8').toString('base64url');
}

export function parseSpyRecipientId(
  id: string,
): { channelId: string; filter: 'role' | 'email'; value: string } | null {
  try {
    const text = Buffer.from(id, 'base64url').toString('utf8');
    const [channelId, filter, ...rest] = text.split('\n');
    const value = rest.join('\n');
    if (!channelId || (filter !== 'role' && filter !== 'email') || !value) return null;
    return { channelId, filter, value };
  } catch {
    return null;
  }
}

function currentRules(): SpyRule[] {
  return parseSpyRules(getCachedPluginSettings(PLUGIN_ID).rules);
}

async function persistRules(rules: SpyRule[]): Promise<void> {
  const stored = rules.map((rule) => ({ ...rule, enabled: rule.enabled !== false }));
  const updated = await patchPluginSettings(PLUGIN_ID, { rules: stored });
  if ('error' in updated) throw new Error('not_found');
  const dir = resolvePluginConfigDir(updated.manifest);
  if (!dir) return;
  const file = join(dir, 'config.json');
  const current: Record<string, unknown> =
    existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>) : {};
  current.rules = stored;
  writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
  const loaded = loadPluginConfigFiles(updated.manifest);
  if (loaded.hash) await stampPluginConfigFiles(PLUGIN_ID, loaded.hash);
}

export async function spyMailAdminView(): Promise<{
  channels: Array<{
    id: string;
    pluginId: string;
    title: string;
    description: string;
    filters: Array<'role' | 'email' | 'kind'>;
    enabled: boolean;
    recipients: SpyAdminRecipient[];
  }>;
  staffRoles: Array<{ code: string; label: string }>;
}> {
  const channels = await listSpyChannels();
  const rules = currentRules();
  const roles = (await listStaffRoles(pool)).filter((role) => role.code !== CUSTOMER_ROLE);
  return {
    channels: channels.map((channel) => ({
      id: channel.id,
      pluginId: channel.pluginId,
      title: channel.title,
      description: channel.description,
      filters: channel.filters,
      enabled: !rules.some((rule) => rule.channel === channel.id && rule.enabled === false),
      recipients: rules.flatMap((rule) => {
        if (rule.channel !== channel.id) return [];
        const rows: SpyAdminRecipient[] = [];
        if (rule.role) {
          rows.push({
            id: recipientId(channel.id, 'role', rule.role),
            channelId: channel.id,
            filter: 'role',
            value: rule.role,
          });
        }
        if (rule.email) {
          rows.push({
            id: recipientId(channel.id, 'email', rule.email),
            channelId: channel.id,
            filter: 'email',
            value: rule.email,
          });
        }
        return rows;
      }),
    })),
    staffRoles: roles.map((role) => ({ code: role.code, label: role.label })),
  };
}

export async function setSpyChannelEnabled(channelId: string, enabled: boolean): Promise<boolean> {
  const channels = await listSpyChannels();
  if (!channels.some((channel) => channel.id === channelId)) return false;
  const rules = currentRules();
  const next = rules.map((rule) => (rule.channel === channelId ? { ...rule, enabled } : rule));
  if (!next.some((rule) => rule.channel === channelId)) next.push({ channel: channelId, enabled });
  await persistRules(next);
  return true;
}

export async function addSpyRecipient(
  channelId: string,
  filter: 'role' | 'email',
  raw: string,
): Promise<{ ok: true; recipient: SpyAdminRecipient } | { ok: false; error: 'not_found' | 'invalid_role' | 'not_staff_account' | 'invalid_email' }> {
  const channels = await listSpyChannels();
  const channel = channels.find((entry) => entry.id === channelId);
  if (!channel || !channel.filters.includes(filter)) return { ok: false, error: 'not_found' };
  const rules = currentRules();
  if (filter === 'role') {
    const role = normalizeRoleFilter(raw);
    if (!role) return { ok: false, error: 'invalid_role' };
    const known = (await listStaffRoles(pool)).some((entry) => entry.code === role);
    if (!known) return { ok: false, error: 'invalid_role' };
    if (!rules.some((rule) => rule.channel === channelId && rule.role === role)) {
      rules.push({ channel: channelId, role });
      await persistRules(rules);
    }
    return { ok: true, recipient: { id: recipientId(channelId, 'role', role), channelId, filter, value: role } };
  }
  const email = normalizeEmailFilter(raw);
  if (!email) return { ok: false, error: 'invalid_email' };
  const staff = await staffEmailIfUnlocked(email);
  if (!staff) return { ok: false, error: 'not_staff_account' };
  if (!rules.some((rule) => rule.channel === channelId && rule.email === staff)) {
    rules.push({ channel: channelId, email: staff });
    await persistRules(rules);
  }
  return { ok: true, recipient: { id: recipientId(channelId, 'email', staff), channelId, filter, value: staff } };
}

export async function removeSpyRecipient(id: string): Promise<boolean> {
  const parsed = parseSpyRecipientId(id);
  if (!parsed) return false;
  const rules = currentRules();
  const next = rules.filter((rule) => {
    if (rule.channel !== parsed.channelId) return true;
    if (parsed.filter === 'role') return rule.role !== parsed.value;
    return rule.email !== parsed.value;
  });
  if (next.length === rules.length) return false;
  await persistRules(next);
  return true;
}
