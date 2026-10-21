import type { SpyResolveState } from '@tuucho/plugin-sdk';
import { listSpyChannels, uniqueSpyEmails } from '@kernel/back/modules/messaging/application/spyChannels';
import { staffEmailIfUnlocked, staffEmailsMatchingRoles } from '@kernel/back/modules/identity/application/staffMailTargets';
import { isChannelEnabled, listRecipients, seedEnvRecipientsIfEmpty } from './spyStore.js';

export async function resolveChannelRecipients(channelId: string): Promise<string[]> {
  if (!(await isChannelEnabled(channelId))) return [];
  const filters = await listRecipients(channelId);
  if (filters.length === 0) return [];
  const collected: string[] = [];
  const roles = filters.filter((row) => row.filter === 'role').map((row) => row.value);
  if (roles.length) collected.push(...(await staffEmailsMatchingRoles(roles)));
  for (const row of filters.filter((entry) => entry.filter === 'email')) {
    const email = await staffEmailIfUnlocked(row.value);
    if (email) collected.push(email);
  }
  return uniqueSpyEmails(collected);
}

export async function fillSpyResolve(state: SpyResolveState): Promise<SpyResolveState> {
  if (!state.channelId) return state;
  const channels = await listSpyChannels();
  await seedEnvRecipientsIfEmpty(channels.map((channel) => channel.id));
  const to = await resolveChannelRecipients(state.channelId);
  return { ...state, to };
}
