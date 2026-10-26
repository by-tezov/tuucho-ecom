import { Router } from 'express';
import { requireAuth } from '@kernel/back/middleware/requireAuth';
import { requirePermission } from '@kernel/back/middleware/requirePermission';
import { requirePluginEnabled } from '@kernel/back/middleware/requirePluginEnabled';
import { addSpyRecipient, removeSpyRecipient, setSpyChannelEnabled, spyMailAdminView } from '../application/spyRulesAdmin.js';

const PLUGIN_ID = 'tuucho-mail-spy';

export const spyRulesRouter = Router();

spyRulesRouter.use('/spy-mail', requirePluginEnabled(PLUGIN_ID), requireAuth, requirePermission('preferences'));

spyRulesRouter.get('/spy-mail', async (_req, res) => {
  res.json({ success: true, ...(await spyMailAdminView()) });
});

spyRulesRouter.patch('/spy-mail/channels/:channelId', async (req, res) => {
  const channelId = String(req.params.channelId ?? '');
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const found = await setSpyChannelEnabled(channelId, enabled);
  if (!found) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, channelId, enabled });
});

spyRulesRouter.post('/spy-mail/channels/:channelId/recipients', async (req, res) => {
  const channelId = String(req.params.channelId ?? '');
  const filter = req.body?.filter === 'role' || req.body?.filter === 'email' ? req.body.filter : null;
  if (!filter) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const result = await addSpyRecipient(channelId, filter, String(req.body?.value ?? ''));
  if (!result.ok) {
    const status = result.error === 'not_found' ? 404 : 400;
    res.status(status).json({ success: false, error: { code: result.error } });
    return;
  }
  res.status(201).json({ success: true, recipient: result.recipient });
});

spyRulesRouter.delete('/spy-mail/recipients/:id', async (req, res) => {
  const removed = await removeSpyRecipient(String(req.params.id ?? ''));
  if (!removed) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true });
});
