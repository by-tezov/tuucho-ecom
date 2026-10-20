import { randomUUID } from 'node:crypto';
import { pool } from '@kernel/back/db/pool';
import { pluginSettingOptionalString } from '@kernel/back/modules/plugins/application/pluginSettingValues';
import { CUSTOMER_ROLE, staffEmailIfUnlocked } from '@kernel/back/modules/identity/application/staffMailTargets';

export type SpyFilterType = 'role' | 'email';

export type SpyRecipientRow = {
  id: string;
  channelId: string;
  filter: SpyFilterType;
  value: string;
};

async function ensureChannelRow(channelId: string, enabled = true): Promise<void> {
  await pool.query(
    `insert into plugin_tuucho_mail_spy_channels (channel_id, enabled)
     values ($1, $2)
     on conflict (channel_id) do nothing`,
    [channelId, enabled],
  );
}

export async function isChannelEnabled(channelId: string): Promise<boolean> {
  const { rows } = await pool.query<{ enabled: boolean }>(
    `select enabled from plugin_tuucho_mail_spy_channels where channel_id = $1`,
    [channelId],
  );
  if (!rows[0]) return true;
  return rows[0].enabled;
}

export async function setChannelEnabled(channelId: string, enabled: boolean): Promise<void> {
  await pool.query(
    `insert into plugin_tuucho_mail_spy_channels (channel_id, enabled, updated_at)
     values ($1, $2, now())
     on conflict (channel_id) do update set enabled = excluded.enabled, updated_at = now()`,
    [channelId, enabled],
  );
}

export async function listRecipients(channelId?: string): Promise<SpyRecipientRow[]> {
  const { rows } = channelId
    ? await pool.query<{ id: string; channel_id: string; filter_type: SpyFilterType; filter_value: string }>(
        `select id, channel_id, filter_type, filter_value
           from plugin_tuucho_mail_spy_recipients
          where channel_id = $1
          order by created_at, filter_type, filter_value`,
        [channelId],
      )
    : await pool.query<{ id: string; channel_id: string; filter_type: SpyFilterType; filter_value: string }>(
        `select id, channel_id, filter_type, filter_value
           from plugin_tuucho_mail_spy_recipients
          order by channel_id, created_at, filter_type, filter_value`,
      );
  return rows.map((row) => ({
    id: row.id,
    channelId: row.channel_id,
    filter: row.filter_type,
    value: row.filter_value,
  }));
}

export async function addRecipient(
  channelId: string,
  filter: SpyFilterType,
  value: string,
): Promise<SpyRecipientRow> {
  await ensureChannelRow(channelId);
  const { rows } = await pool.query<{
    id: string;
    channel_id: string;
    filter_type: SpyFilterType;
    filter_value: string;
  }>(
    `insert into plugin_tuucho_mail_spy_recipients (id, channel_id, filter_type, filter_value)
     values ($1, $2, $3, $4)
     on conflict (channel_id, filter_type, filter_value) do update set filter_value = excluded.filter_value
     returning id, channel_id, filter_type, filter_value`,
    [randomUUID(), channelId, filter, value],
  );
  const row = rows[0]!;
  return { id: row.id, channelId: row.channel_id, filter: row.filter_type, value: row.filter_value };
}

export async function removeRecipient(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`delete from plugin_tuucho_mail_spy_recipients where id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function recipientCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from plugin_tuucho_mail_spy_recipients`);
  return Number(rows[0]?.n ?? 0);
}

export function envSeedMailboxForChannel(channelId: string): string | undefined {
  if (channelId === 'contact.inbound') {
    return (
      pluginSettingOptionalString('tuucho-mail-spy', 'seedContactRecipient') ??
      pluginSettingOptionalString('tuucho-contact', 'seedRecipient')
    );
  }
  if (channelId === 'contact.chat') {
    return (
      pluginSettingOptionalString('tuucho-mail-spy', 'seedChatRecipient') ??
      pluginSettingOptionalString('tuucho-contact', 'seedRecipient')
    );
  }
  return pluginSettingOptionalString('tuucho-mail-spy', 'seedOrderRecipient');
}

/** One-shot: if nobody configured recipients yet, copy a matching staff env mailbox. */
export async function seedEnvRecipientsIfEmpty(channelIds: readonly string[]): Promise<void> {
  if (channelIds.length === 0) return;
  if ((await recipientCount()) > 0) return;
  const envByChannel = new Map<string, string | undefined>();
  for (const id of channelIds) {
    envByChannel.set(id, envSeedMailboxForChannel(id));
  }
  for (const channelId of channelIds) {
    const env = envByChannel.get(channelId)?.trim();
    if (!env) continue;
    const staff = await staffEmailIfUnlocked(env);
    if (!staff) continue;
    await addRecipient(channelId, 'email', staff);
  }
}

export function normalizeRoleFilter(value: string): string | null {
  const role = value.trim();
  if (!role || role === CUSTOMER_ROLE) return null;
  return role;
}

export function normalizeEmailFilter(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email || !email.includes('@')) return null;
  return email;
}
