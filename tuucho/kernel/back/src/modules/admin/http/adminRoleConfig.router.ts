import { Router } from 'express';
import { requireAdmin } from '../../../middleware/requireAdmin.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import {
  applyRoleConfig,
  exportRoleConfigFile,
  parseRoleConfig,
  roleConfigStatus,
  writeRoleConfigFile,
} from '../../identity/application/roleConfigFiles.js';

export const adminRoleConfigRouter = Router();

adminRoleConfigRouter.use('/roles/config-files', requireAuth, requireAdmin);

function fail(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown) {
  const message = error instanceof Error ? error.message : 'invalid_request';
  const status = message === 'no_files' ? 404 : 400;
  res.status(status).json({ success: false, error: { code: message.split(':')[0] || 'invalid_request' } });
}

adminRoleConfigRouter.get('/roles/config-files', async (_req, res) => {
  res.json({ success: true, ...(await roleConfigStatus()) });
});

adminRoleConfigRouter.post('/roles/config-files/apply', async (_req, res) => {
  try {
    const result = await applyRoleConfig();
    res.json({ success: true, ...result, ...(await roleConfigStatus()) });
  } catch (error) {
    fail(res, error);
  }
});

adminRoleConfigRouter.post('/roles/config-files/import', async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name : 'config.role.json';
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    res.status(400).json({ success: false, error: { code: 'invalid_json' } });
    return;
  }
  const roles = parseRoleConfig(parsed);
  if (!roles) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    writeRoleConfigFile(name, roles);
    const result = await applyRoleConfig();
    res.json({ success: true, ...result, ...(await roleConfigStatus()) });
  } catch (error) {
    fail(res, error);
  }
});

adminRoleConfigRouter.get('/roles/config-files/export', async (_req, res) => {
  const file = await exportRoleConfigFile();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.send(file.body);
});
