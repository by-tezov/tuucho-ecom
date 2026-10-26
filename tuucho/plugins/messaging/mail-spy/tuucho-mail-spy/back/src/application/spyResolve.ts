import type { SpyResolveState } from '@tuucho/plugin-sdk';
import { uniqueSpyEmails } from '@kernel/back/modules/messaging/application/spyChannels';
import { CUSTOMER_ROLE, staffEmailIfUnlocked, staffEmailsMatchingRoles } from '@kernel/back/modules/identity/application/staffMailTargets';
import { getCachedPluginSettings } from '@kernel/back/modules/plugins/application/pluginStore';

const PLUGIN_ID = 'tuucho-mail-spy';

export type SpyRule = {
  channel: string;
  role?: string;
  email?: string;
  enabled?: boolean;
};

/** Rules from tuucho-mail-spy settings (`rules` in config.json or Configure).
 * An empty list sends nothing. No role is added on its own. */
export function parseSpyRules(raw: unknown): SpyRule[] {
  let value = raw;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const rules: SpyRule[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as { channel?: unknown; role?: unknown; email?: unknown; enabled?: unknown };
    const channel = typeof record.channel === 'string' ? record.channel.trim() : '';
    if (!channel) continue;
    const role = typeof record.role === 'string' ? record.role.trim() : '';
    const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : '';
    if (role === CUSTOMER_ROLE) continue;
    rules.push({
      channel,
      ...(role ? { role } : {}),
      ...(email ? { email } : {}),
      ...(typeof record.enabled === 'boolean' ? { enabled: record.enabled } : {}),
    });
  }
  return rules;
}

function rulesForChannel(channelId: string, rules: readonly SpyRule[]): SpyRule[] {
  return rules.filter((rule) => rule.channel === channelId || rule.channel === '*');
}

export async function resolveChannelRecipients(channelId: string): Promise<string[]> {
  const rules = rulesForChannel(channelId, parseSpyRules(getCachedPluginSettings(PLUGIN_ID).rules));
  if (rules.some((rule) => rule.enabled === false)) return [];
  const collected: string[] = [];
  const roles = rules.map((rule) => rule.role).filter((role): role is string => Boolean(role));
  if (roles.length) collected.push(...(await staffEmailsMatchingRoles(roles)));
  for (const rule of rules) {
    if (!rule.email) continue;
    const email = await staffEmailIfUnlocked(rule.email);
    if (email) collected.push(email);
  }
  return uniqueSpyEmails(collected);
}

export async function fillSpyResolve(state: SpyResolveState): Promise<SpyResolveState> {
  if (!state.channelId) return state;
  const to = await resolveChannelRecipients(state.channelId);
  return { ...state, to };
}
