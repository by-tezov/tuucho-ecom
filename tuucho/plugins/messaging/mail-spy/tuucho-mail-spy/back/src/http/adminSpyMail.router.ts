import { Router } from 'express';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';
import { listSpyChannels } from '@kernel/back/modules/messaging/application/spyChannels';
import { listStaffRoles } from '@kernel/back/modules/identity/application/staffRoles';
import { CUSTOMER_ROLE, staffEmailIfUnlocked } from '@kernel/back/modules/identity/application/staffMailTargets';
import { pool } from '@kernel/back/db/pool';
import {
  addRecipient,
  isChannelEnabled,
  listRecipients,
  normalizeEmailFilter,
  normalizeRoleFilter,
  removeRecipient,
  seedEnvRecipientsIfEmpty,
  setChannelEnabled,
} from '../application/spyStore.js';

const PLUGIN_ID = 'tuucho-mail-spy';

export const adminSpyMailRouter = Router();

adminSpyMailRouter.use('/spy-mail', requirePluginEnabled(PLUGIN_ID), requireAuth, requirePermission('spy_mail'));

adminSpyMailRouter.get('/spy-mail', async (_req, res) => {
  const channels = await listSpyChannels();
  let recipients: Awaited<ReturnType<typeof listRecipients>> = [];
  try {
    await seedEnvRecipientsIfEmpty(channels.map((channel) => channel.id));
    recipients = await listRecipients();
  } catch (error) {
    console.error('[spy-mail] recipient store unavailable', error);
  }
  const byChannel = new Map<string, typeof recipients>();
  for (const row of recipients) {
    const list = byChannel.get(row.channelId) ?? [];
    list.push(row);
    byChannel.set(row.channelId, list);
  }
  const roles = (await listStaffRoles(pool)).filter((role) => role.code !== CUSTOMER_ROLE);
  const body = [];
  for (const channel of channels) {
    let enabled = true;
    try {
      enabled = await isChannelEnabled(channel.id);
    } catch (error) {
      console.error('[spy-mail] channel enable lookup failed', channel.id, error);
    }
    body.push({
      id: channel.id,
      pluginId: channel.pluginId,
      title: channel.title,
      description: channel.description,
      filters: channel.filters,
      enabled,
      recipients: byChannel.get(channel.id) ?? [],
    });
  }
  res.json({
    success: true,
    channels: body,
    staffRoles: roles.map((role) => ({ code: role.code, label: role.label })),
  });
});

adminSpyMailRouter.patch('/spy-mail/channels/:channelId', async (req, res) => {
  const channelId = String(req.params.channelId ?? '');
  const channels = await listSpyChannels();
  if (!channels.some((channel) => channel.id === channelId)) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  await setChannelEnabled(channelId, enabled);
  res.json({ success: true, channelId, enabled });
});

adminSpyMailRouter.post('/spy-mail/channels/:channelId/recipients', async (req, res) => {
  const channelId = String(req.params.channelId ?? '');
  const channels = await listSpyChannels();
  const channel = channels.find((entry) => entry.id === channelId);
  if (!channel) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const filter = req.body?.filter === 'role' || req.body?.filter === 'email' ? req.body.filter : null;
  if (!filter || !channel.filters.includes(filter)) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  if (filter === 'role') {
    const role = normalizeRoleFilter(String(req.body?.value ?? ''));
    if (!role) {
      res.status(400).json({ success: false, error: { code: 'invalid_role' } });
      return;
    }
    const known = (await listStaffRoles(pool)).some((entry) => entry.code === role);
    if (!known) {
      res.status(400).json({ success: false, error: { code: 'invalid_role' } });
      return;
    }
    const recipient = await addRecipient(channelId, 'role', role);
    res.status(201).json({ success: true, recipient });
    return;
  }
  const email = normalizeEmailFilter(String(req.body?.value ?? ''));
  if (!email) {
    res.status(400).json({ success: false, error: { code: 'invalid_email' } });
    return;
  }
  const staff = await staffEmailIfUnlocked(email);
  if (!staff) {
    res.status(400).json({ success: false, error: { code: 'not_staff_account' } });
    return;
  }
  const recipient = await addRecipient(channelId, 'email', staff);
  res.status(201).json({ success: true, recipient });
});

adminSpyMailRouter.delete('/spy-mail/recipients/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!(await removeRecipient(id))) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true });
});
