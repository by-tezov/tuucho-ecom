import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Router } from 'express';
import { configPaths, resolveAppTarget } from '../../../config/loadJsonConfig.js';
import { configRoot } from '../../../config/shopPaths.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';

const MAX_CHARS = 1_000_000;

export const adminCoreConfigRouter = Router();

adminCoreConfigRouter.use('/core-config', requireAuth, requirePermission('preferences'));

function publicConfigPath(): string {
  return configPaths(configRoot, resolveAppTarget(process.env.APP_TARGET)).commonPublic;
}

function readPublicConfig(): { present: boolean; text: string } {
  const path = publicConfigPath();
  if (!existsSync(path)) return { present: false, text: '{\n}\n' };
  return { present: true, text: readFileSync(path, 'utf8') };
}

function writePublicConfig(text: string): { ok: true } | { ok: false; code: string } {
  if (text.length > MAX_CHARS) return { ok: false, code: 'too_large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, code: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { ok: false, code: 'invalid_json' };
  writeFileSync(publicConfigPath(), `${JSON.stringify(parsed, null, 2)}\n`);
  return { ok: true };
}

adminCoreConfigRouter.get('/core-config', (_req, res) => {
  res.json({ success: true, ...readPublicConfig() });
});

adminCoreConfigRouter.put('/core-config', requirePermission('plugin_config_import'), (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const written = writePublicConfig(text);
  if (!written.ok) {
    res.status(400).json({ success: false, error: { code: written.code } });
    return;
  }
  res.json({ success: true, ...readPublicConfig() });
});

adminCoreConfigRouter.post('/core-config/apply', requirePermission('plugin_config_import'), (_req, res) => {
  res.json({ success: true, ...readPublicConfig() });
});

adminCoreConfigRouter.post('/core-config/import', requirePermission('plugin_config_import'), (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : '';
  const written = writePublicConfig(text);
  if (!written.ok) {
    res.status(400).json({ success: false, error: { code: written.code } });
    return;
  }
  res.json({ success: true, ...readPublicConfig() });
});

adminCoreConfigRouter.get('/core-config/export', requirePermission('plugin_config_export'), (_req, res) => {
  const file = readPublicConfig();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="config.json"');
  res.send(file.text);
});
