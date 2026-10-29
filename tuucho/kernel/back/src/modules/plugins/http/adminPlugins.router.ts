import { Router } from 'express';
import multer from 'multer';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { buildDocsSite } from '../application/loadPluginDocs.js';
import {
  isPluginEffectivelyEnabled,
  readRootPackageVersion,
  listPlugins,
  patchPluginSettings,
  patchPluginSecrets,
  scanPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from '../application/pluginStore.js';
import {
  getProductAxes,
  getStoreIdentity,
  getStoreMenus,
  getThemeCustomization,
  patchProductAxes,
  patchStoreIdentity,
  patchStoreMenus,
  patchThemeCustomization,
  type ProductAxisSetting,
  type StoreMenuItem,
} from '../application/storeSettings.js';
import { installPluginArchive } from '../application/pluginInstall.js';
import { withPluginView } from './pluginAdminView.js';
import { loadBundledPluginsManifest } from '../application/bundledPlugins.js';
import { checkUpdates } from '../application/updates/checkUpdates.js';
import { getUpdateJob, startUpdateJob } from '../application/updates/updateJob.js';
import { getPaymentGateway } from '@tuucho/plugin-sdk';

const archiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

export const adminPluginsRouter = Router();

adminPluginsRouter.use('/plugins', requireAuth, requirePermission('preferences'));
adminPluginsRouter.use('/docs', requireAuth, requirePermission('preferences'));
adminPluginsRouter.use('/store', requireAuth, requirePermission('preferences'));

adminPluginsRouter.get('/plugins', async (_req, res) => {
  const [plugins, bundled] = await Promise.all([listPlugins(), loadBundledPluginsManifest()]);
  const bundledIds = new Set(bundled.plugins.map((entry) => entry.id));
  res.json({
    success: true,
    coreVersion: readRootPackageVersion(),
    bundledKernel: bundled.kernel,
    plugins: plugins.map((plugin) => ({
      ...withPluginView(plugin),
      bundled: bundledIds.has(plugin.id),
      repository: plugin.manifest.repository ?? null,
    })),
  });
});

adminPluginsRouter.post('/plugins/updates/check', async (_req, res) => {
  try {
    const check = await checkUpdates();
    res.json({ success: true, check });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Check failed.';
    res.status(502).json({ success: false, error: { code: 'update_check_failed', message } });
  }
});

adminPluginsRouter.get('/plugins/updates/status', (_req, res) => {
  const job = getUpdateJob();
  res.json({ success: true, job });
});

adminPluginsRouter.post('/plugins/updates/apply', (req, res) => {
  const scope = req.body?.scope;
  const pluginId = typeof req.body?.pluginId === 'string' ? req.body.pluginId : undefined;
  if (scope !== 'all' && scope !== 'kernel' && scope !== 'plugins' && scope !== 'plugin') {
    res.status(400).json({ success: false, error: { code: 'invalid_request', message: 'scope must be all, kernel, plugins, or plugin.' } });
    return;
  }
  try {
    const job = startUpdateJob({ scope, pluginId });
    res.json({ success: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Apply failed.';
    res.status(409).json({ success: false, error: { code: 'update_busy', message } });
  }
});

adminPluginsRouter.get('/docs', async (_req, res) => {
  if (!(await isPluginEffectivelyEnabled('tuucho-docs-developer'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  const site = await buildDocsSite();
  res.json({ success: true, coreVersion: readRootPackageVersion(), ...site });
});

adminPluginsRouter.get('/plugins/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  const plugin = (await listPlugins()).find((entry) => entry.id === id);
  if (!plugin) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, plugin: withPluginView(plugin) });
});

adminPluginsRouter.post('/plugins/upload', archiveUpload.single('archive'), async (req, res) => {
  const file = req.file;
  if (!file?.buffer) {
    res.status(400).json({ success: false, error: { code: 'invalid_request', message: 'Missing archive file.' } });
    return;
  }
  const result = await installPluginArchive(file.buffer, file.originalname || 'plugin.zip');
  if (!result.ok) {
    const status = result.error === 'plugin_incompatible' ? 409 : 400;
    res.status(status).json({ success: false, error: { code: result.error, message: result.message } });
    return;
  }
  const plugin = (await listPlugins()).find((entry) => entry.id === result.id);
  res.json({
    success: true,
    id: result.id,
    enabled: result.enabled,
    plugin: plugin ? withPluginView(plugin) : null,
  });
});

adminPluginsRouter.post('/plugins/scan', async (_req, res) => {
  const { plugins, added, incompatible } = await scanPlugins();
  res.json({
    success: true,
    coreVersion: readRootPackageVersion(),
    added,
    incompatible,
    plugins: plugins.map((plugin) => withPluginView(plugin)),
  });
});

adminPluginsRouter.post('/plugins/:id/uninstall', async (req, res) => {
  const id = String(req.params.id ?? '');
  const result = await uninstallPlugin(id, req.body?.confirm === true);
  if ('error' in result) {
    if (result.error === 'unconfirmed') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    if (result.error === 'required') {
      res.status(400).json({ success: false, error: { code: 'plugin_required' } });
      return;
    }
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, reverted: result.reverted });
});

adminPluginsRouter.patch('/plugins/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (typeof req.body?.enabled === 'boolean') {
    const paymentMethods = getPaymentGateway(id)?.methods ?? [];
    const result = await setPluginEnabled(id, req.body.enabled);
    if ('error' in result) {
      if (result.error === 'incompatible') {
        const message = result.compatibility?.errors.map((entry) => entry.message).join(' ') ?? '';
        res.status(409).json({
          success: false,
          error: { code: 'plugin_incompatible', message },
        });
        return;
      }
      const code = result.error === 'required' ? 'plugin_required' : 'not_found';
      res.status(result.error === 'required' ? 400 : 404).json({ success: false, error: { code } });
      return;
    }
    const codes = result.manifest.courierCodes ?? [];
    if (result.manifest.kinds.includes('shipping') && codes.length > 0) {
      await pool.query(`update couriers set enabled = $2 where code = any($1::text[])`, [codes, req.body.enabled]);
    }
    if (result.manifest.kinds.includes('payment') && req.body.enabled === false && paymentMethods.length > 0) {
      const keys = paymentMethods.map((method) => `payment_${method}_enabled`);
      await pool.query(
        `update app_preferences
            set value = 'false'::jsonb, updated_at = now()
          where key = any($1::text[])`,
        [keys],
      );
    }
    res.json({ success: true, plugin: withPluginView(result) });
    return;
  }
  if (req.body?.settings && typeof req.body.settings === 'object') {
    const schema = (await listPlugins()).find((entry) => entry.id === id)?.manifest.settingsSchema ?? {};
    const publicSettings: Record<string, unknown> = {};
    const secretSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(req.body.settings as Record<string, unknown>)) {
      if (schema[key]?.type === 'secret') secretSettings[key] = value;
      else publicSettings[key] = value;
    }
    const result = await patchPluginSettings(id, publicSettings);
    if ('error' in result) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (Object.keys(secretSettings).length > 0) await patchPluginSecrets(id, secretSettings);
    const after = (await listPlugins()).find((entry) => entry.id === id)!;
    res.json({ success: true, plugin: withPluginView(after) });
    return;
  }
  if (req.body?.secrets && typeof req.body.secrets === 'object') {
    const result = await patchPluginSecrets(id, req.body.secrets);
    if ('error' in result) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, plugin: withPluginView(result) });
    return;
  }
  res.status(400).json({ success: false, error: { code: 'invalid_request' } });
});

adminPluginsRouter.get('/store', async (_req, res) => {
  const [identity, axes, theme, menus] = await Promise.all([
    getStoreIdentity(),
    getProductAxes(),
    getThemeCustomization(),
    getStoreMenus(),
  ]);
  res.json({ success: true, identity, axes, theme, menus });
});

adminPluginsRouter.patch('/store', async (req, res) => {
  const body = req.body ?? {};
  if (body.identity && typeof body.identity === 'object') {
    const identity = await patchStoreIdentity(body.identity);
    res.json({ success: true, identity });
    return;
  }
  if (Array.isArray(body.axes)) {
    const axes = await patchProductAxes(body.axes as ProductAxisSetting[]);
    res.json({ success: true, axes });
    return;
  }
  if (body.theme && typeof body.theme === 'object') {
    const theme = await patchThemeCustomization(body.theme);
    res.json({ success: true, theme });
    return;
  }
  if (Array.isArray(body.menus)) {
    const menus = await patchStoreMenus(body.menus as StoreMenuItem[]);
    res.json({ success: true, menus });
    return;
  }
  res.status(400).json({ success: false, error: { code: 'invalid_request' } });
});
