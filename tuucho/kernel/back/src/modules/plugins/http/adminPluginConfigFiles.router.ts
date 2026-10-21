import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { applyPluginConfigFromDisk } from '../application/pluginConfigApply.js';
import {
  applyAllPluginConfigFromDisk,
  exportAllPluginConfigZip,
  exportLayersForPlugin,
  importPluginConfigBuffer,
  importPluginConfigNamedFiles,
  zipConfigEntries,
  type BulkReport,
} from '../application/pluginConfigBulk.js';
import { envelopeJson } from '../application/pluginConfigEnvelope.js';
import { listPlugins } from '../application/pluginStore.js';
import { withPluginView } from './pluginAdminView.js';

const archiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

export const adminPluginConfigFilesRouter = Router();

adminPluginConfigFilesRouter.use('/plugins', requireAuth, requirePermission('preferences'));

function sendDownload(
  res: { setHeader: (n: string, v: string) => void; send: (b: Buffer) => void },
  filename: string,
  body: Buffer,
  type: string,
) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

function archiveError(res: { status: (n: number) => { json: (b: unknown) => void } }, error: unknown) {
  res.status(400).json({
    success: false,
    error: {
      code: 'invalid_archive',
      message: error instanceof Error ? error.message : 'Invalid archive.',
    },
  });
}

function perPluginImportStatus(report: BulkReport): { status: number; code: string } | null {
  if (report.blocked.length === 0) return null;
  const reason = report.blocked[0]?.reason ?? 'invalid_envelope';
  if (reason === 'compat_core' || reason === 'compat_plugin' || reason === 'format') {
    return { status: 409, code: 'plugin_config_incompatible' };
  }
  return { status: 400, code: 'invalid_request' };
}

adminPluginConfigFilesRouter.post(
  '/plugins/config-files/apply-all',
  requirePermission('plugin_config_import'),
  async (_req, res) => {
    const report = await applyAllPluginConfigFromDisk(await listPlugins());
    res.json({ success: true, ...report });
  },
);

adminPluginConfigFilesRouter.post(
  '/plugins/config-files/import-all',
  requirePermission('plugin_config_import'),
  archiveUpload.single('archive'),
  async (req, res) => {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    try {
      const report = await importPluginConfigBuffer(
        file.buffer,
        file.originalname || 'config.zip',
        await listPlugins(),
      );
      res.json({ success: true, ...report });
    } catch (error) {
      archiveError(res, error);
    }
  },
);

adminPluginConfigFilesRouter.get(
  '/plugins/config-files/export-all',
  requirePermission('plugin_config_export'),
  async (_req, res) => {
    const zip = exportAllPluginConfigZip(await listPlugins());
    if (!zip) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    sendDownload(res, 'plugin-config.zip', Buffer.from(zip), 'application/zip');
  },
);

adminPluginConfigFilesRouter.post(
  '/plugins/:id/config-files/apply',
  requirePermission('plugin_config_import'),
  async (req, res) => {
    const id = String(req.params.id ?? '');
    const plugin = (await listPlugins()).find((entry) => entry.id === id);
    if (!plugin) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const result = await applyPluginConfigFromDisk(plugin);
    if (!result.ok) {
      res.status(404).json({
        success: false,
        error: { code: result.error === 'no_files' ? 'not_found' : result.error },
      });
      return;
    }
    const after = (await listPlugins()).find((entry) => entry.id === id)!;
    res.json({ success: true, plugin: withPluginView(after), warnings: result.warnings });
  },
);

adminPluginConfigFilesRouter.post(
  '/plugins/:id/config-files/import',
  requirePermission('plugin_config_import'),
  (req, res, next) => {
    const type = String(req.headers['content-type'] ?? '');
    if (type.includes('multipart/form-data')) {
      archiveUpload.single('archive')(req, res, next);
      return;
    }
    next();
  },
  async (req, res) => {
    const id = String(req.params.id ?? '');
    const plugin = (await listPlugins()).find((entry) => entry.id === id);
    if (!plugin) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    try {
      let report: BulkReport;
      if (req.file?.buffer) {
        report = await importPluginConfigBuffer(
          req.file.buffer,
          req.file.originalname || 'config.zip',
          [plugin],
          plugin.id,
        );
      } else {
        const files = req.body?.files;
        if (!Array.isArray(files) || files.length === 0) {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        for (const file of files) {
          if (!file || typeof file.name !== 'string' || typeof file.text !== 'string') {
            res.status(400).json({ success: false, error: { code: 'invalid_request' } });
            return;
          }
        }
        report = await importPluginConfigNamedFiles(files, plugin);
      }
      const fail = perPluginImportStatus(report);
      if (fail) {
        const message = `${plugin.id}: ${report.blocked[0]?.reason ?? 'blocked'}`;
        if (fail.code === 'plugin_config_incompatible') {
          res.status(409).json({
            success: false,
            error: { code: 'plugin_config_incompatible', message },
          });
          return;
        }
        res.status(400).json({
          success: false,
          error: { code: 'invalid_request', message },
        });
        return;
      }
      const after = (await listPlugins()).find((entry) => entry.id === id)!;
      res.json({ success: true, plugin: withPluginView(after), ...report });
    } catch (error) {
      archiveError(res, error);
    }
  },
);

adminPluginConfigFilesRouter.get(
  '/plugins/:id/config-files/export',
  requirePermission('plugin_config_export'),
  async (req, res) => {
    const id = String(req.params.id ?? '');
    const plugin = (await listPlugins()).find((entry) => entry.id === id);
    if (!plugin) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const layers = exportLayersForPlugin(plugin);
    if (layers.length === 0) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    if (layers.length === 1) {
      const only = layers[0]!;
      const name = only.path.split('/').pop() ?? 'config.json';
      sendDownload(res, name, Buffer.from(envelopeJson(only.envelope), 'utf8'), 'application/json');
      return;
    }
    sendDownload(res, `${plugin.id}-config.zip`, Buffer.from(zipConfigEntries(layers)), 'application/zip');
  },
);
