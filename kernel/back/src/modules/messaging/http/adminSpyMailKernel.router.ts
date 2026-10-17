import { Router } from 'express';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { listStaffRoles } from '../../identity/application/staffRoles.js';
import { CUSTOMER_ROLE } from '../../identity/application/staffMailTargets.js';
import { pool } from '../../../db/pool.js';
import { listSpyChannels } from '../application/spyChannels.js';

/** Last-resort GET when tuucho-mail-spy HTTP did not mount. Plugin handlers
 * above this router own recipients and save. */
export const adminSpyMailKernelRouter = Router();

adminSpyMailKernelRouter.get('/spy-mail', requireAuth, requirePermission('spy_mail'), async (_req, res) => {
  const channels = await listSpyChannels();
  const roles = (await listStaffRoles(pool)).filter((role) => role.code !== CUSTOMER_ROLE);
  res.json({
    success: true,
    channels: channels.map((channel) => ({
      id: channel.id,
      pluginId: channel.pluginId,
      title: channel.title,
      description: channel.description,
      filters: channel.filters,
      enabled: true,
      recipients: [],
    })),
    staffRoles: roles.map((role) => ({ code: role.code, label: role.label })),
  });
});
