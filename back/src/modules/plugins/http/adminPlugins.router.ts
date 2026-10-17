import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { localize, requestLanguage } from '../../../utils/language.js';
import {
  listCourierPacketPrices,
  setCourierPacketPrice,
} from '../../delivery/application/courierPacketPrices.js';
import { parseCourierPriceValue, type CourierPriceValue } from '../../commerce/domain/courierPrice.js';
import { buildDocsSite } from '../application/loadPluginDocs.js';
import {
  CORE_VERSION,
  isPluginEffectivelyEnabled,
  listPlugins,
  patchPluginSettings,
  scanPlugins,
  setPluginEnabled,
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
import type { InstalledPlugin } from '../application/pluginStore.js';

export const adminPluginsRouter = Router();

adminPluginsRouter.use(requireAuth, requirePermission('preferences'));

async function withRates(plugin: InstalledPlugin, language: ReturnType<typeof requestLanguage>) {
  const codes = plugin.manifest.courierCodes ?? [];
  if (plugin.manifest.kind !== 'shipping' || codes.length === 0) {
    return { ...plugin, rates: [] as Array<{ code: string; name: string; packets: unknown[] }> };
  }
  const rows = await listCourierPacketPrices(pool, codes);
  return {
    ...plugin,
    rates: rows.map((row) => ({
      code: row.code,
      name: localize(row.name, language),
      packets: row.packets,
    })),
  };
}

adminPluginsRouter.get('/plugins', async (req, res) => {
  const language = requestLanguage(req);
  const plugins = await listPlugins();
  res.json({
    success: true,
    coreVersion: CORE_VERSION,
    plugins: await Promise.all(plugins.map((plugin) => withRates(plugin, language))),
  });
});

adminPluginsRouter.get('/docs', async (_req, res) => {
  if (!(await isPluginEffectivelyEnabled('docs-developer'))) {
    res.status(404).json({ success: false, error: { code: 'plugin_disabled' } });
    return;
  }
  const site = await buildDocsSite();
  res.json({ success: true, coreVersion: CORE_VERSION, ...site });
});

adminPluginsRouter.get('/plugins/:id', async (req, res) => {
  const language = requestLanguage(req);
  const id = String(req.params.id ?? '');
  const plugin = (await listPlugins()).find((entry) => entry.id === id);
  if (!plugin) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, plugin: await withRates(plugin, language) });
});

adminPluginsRouter.post('/plugins/scan', async (req, res) => {
  const language = requestLanguage(req);
  const { plugins, added, incompatible } = await scanPlugins();
  res.json({
    success: true,
    coreVersion: CORE_VERSION,
    added,
    incompatible,
    plugins: await Promise.all(plugins.map((plugin) => withRates(plugin, language))),
  });
});

adminPluginsRouter.patch('/plugins/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  const language = requestLanguage(req);
  if (typeof req.body?.enabled === 'boolean') {
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
    if (result.manifest.kind === 'shipping' && codes.length > 0) {
      await pool.query(`update couriers set enabled = $2 where code = any($1::text[])`, [codes, req.body.enabled]);
    }
    if (id === 'payment-stripe' && req.body.enabled === false) {
      await pool.query(
        `update app_preferences
            set value = 'false'::jsonb, updated_at = now()
          where key in (
            'payment_card_enabled',
            'payment_paypal_enabled',
            'payment_bancontact_enabled',
            'payment_google_pay_enabled',
            'payment_apple_pay_enabled'
          )`,
      );
    }
    res.json({ success: true, plugin: await withRates(result, language) });
    return;
  }
  if (req.body?.settings && typeof req.body.settings === 'object') {
    const result = await patchPluginSettings(id, req.body.settings);
    if ('error' in result) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, plugin: await withRates(result, language) });
    return;
  }
  if (Array.isArray(req.body?.rates)) {
    const manifest = (await listPlugins()).find((plugin) => plugin.id === id);
    if (!manifest) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const allowed = new Set(manifest.manifest.courierCodes ?? []);
    for (const entry of req.body.rates as Array<{ code?: string; packets?: Array<{ key?: string; price?: unknown }> }>) {
      const code = String(entry.code ?? '');
      if (!allowed.has(code)) continue;
      for (const packet of entry.packets ?? []) {
        const parsed = parseCourierPriceValue(packet.price);
        if (!packet.key || parsed === undefined) {
          res.status(400).json({ success: false, error: { code: 'invalid_request' } });
          return;
        }
        const ok = await setCourierPacketPrice(pool, code, packet.key, parsed as CourierPriceValue);
        if (!ok) {
          res.status(404).json({ success: false, error: { code: 'not_found' } });
          return;
        }
      }
    }
    res.json({ success: true, plugin: await withRates(manifest, language) });
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
