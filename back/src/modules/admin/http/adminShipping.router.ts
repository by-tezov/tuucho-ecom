import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import { localize, requestLanguage } from '../../../utils/language.js';
import {
  listCountryVocab,
  setAddressCountryEnabled,
} from '../../customers/addresses/application/addresses.js';
import {
  listCouriers,
  setCourierCountryEnabled,
  setCourierEnabled,
} from '../../delivery/application/couriers.js';
import { courierCountryCatalogReady } from '../../../modules/delivery/domain/courierCountryCatalog.js';
import { recordAdminActivityBestEffort } from '../../activity/application/recordAdminActivity.js';
import { activityChangeDetail } from '../../activity/application/changeDetail.js';

export const adminShippingRouter = Router();

adminShippingRouter.get('/shipping-catalog', requireAuth, requirePermission('preferences'), async (req, res) => {
  const language = requestLanguage(req);
  const countryVocab = await listCountryVocab(pool);
  const courierRows = await listCouriers(pool);
  res.json({
    success: true,
    addressCountries: Object.entries(countryVocab).map(([code, entry]) => ({
      code,
      label: localize(entry.label, language),
      enabled: entry.enabled,
    })),
    couriers: courierRows.map((c) => ({
      code: c.code,
      name: localize(c.name, language),
      enabled: c.enabled,
      countries: c.countries
        .filter((country) => courierCountryCatalogReady(c, country.code))
        .map((country) => ({
          code: country.code,
          enabled: country.enabled,
        })),
    })),
  });
});

adminShippingRouter.patch('/address-countries/:code', requireAuth, requirePermission('preferences'), async (req, res) => {
  const code = String(req.params.code ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { rows: beforeRows } = await pool.query<{ enabled: boolean }>(
    `select enabled from address_countries where code = $1`,
    [code],
  );
  if (!beforeRows[0]) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const beforeEnabled = beforeRows[0].enabled;
  const ok = await setAddressCountryEnabled(pool, code, req.body.enabled);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const { changes, changeSummary, detail } = activityChangeDetail(
    {},
    { enabled: beforeEnabled },
    { enabled: req.body.enabled },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'shipping',
    action: req.body.enabled ? 'shipping.address_country.enable' : 'shipping.address_country.disable',
    summary:
      changes.length === 0
        ? `Pays d'adresse ${code}: aucun changement`
        : `Pays d'adresse ${code}: ${changeSummary}`,
    targetType: 'address_country',
    targetId: code,
    detail,
  });
  res.json({ success: true, code, enabled: req.body.enabled });
});

adminShippingRouter.patch('/couriers/:code', requireAuth, requirePermission('preferences'), async (req, res) => {
  const code = String(req.params.code ?? '');
  if (!code || typeof req.body?.enabled !== 'boolean') {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const { rows: beforeRows } = await pool.query<{ enabled: boolean }>(
    `select enabled from couriers where code = $1`,
    [code],
  );
  if (!beforeRows[0]) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const beforeEnabled = beforeRows[0].enabled;
  const ok = await setCourierEnabled(pool, code, req.body.enabled);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  const { changes, changeSummary, detail } = activityChangeDetail(
    {},
    { enabled: beforeEnabled },
    { enabled: req.body.enabled },
  );
  await recordAdminActivityBestEffort(pool, req.user!, {
    category: 'shipping',
    action: req.body.enabled ? 'shipping.courier.enable' : 'shipping.courier.disable',
    summary:
      changes.length === 0
        ? `Transporteur ${code}: aucun changement`
        : `Transporteur ${code}: ${changeSummary}`,
    targetType: 'courier',
    targetId: code,
    detail,
  });
  res.json({ success: true, code, enabled: req.body.enabled });
});

adminShippingRouter.patch(
  '/couriers/:code/countries/:countryCode',
  requireAuth,
  requirePermission('preferences'),
  async (req, res) => {
    const code = String(req.params.code ?? '');
    const countryCode = String(req.params.countryCode ?? '').toUpperCase();
    if (!code || !/^[A-Z]{2}$/.test(countryCode) || typeof req.body?.enabled !== 'boolean') {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const { rows: beforeRows } = await pool.query<{ enabled: boolean }>(
      `select cc.enabled
         from courier_countries cc
         join couriers c on c.id = cc.courier_id
        where c.code = $1 and cc.country_code = $2`,
      [code, countryCode],
    );
    if (!beforeRows[0]) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    const beforeEnabled = beforeRows[0].enabled;
    const result = await setCourierCountryEnabled(pool, code, countryCode, req.body.enabled);
    if (!result.ok) {
      const status = result.reason === 'courier_not_found' || result.reason === 'not_found' ? 404 : 400;
      res.status(status).json({ success: false, error: { code: result.reason } });
      return;
    }
    const { changes, changeSummary, detail } = activityChangeDetail(
      { courierCode: code, countryCode },
      { enabled: beforeEnabled },
      { enabled: req.body.enabled },
    );
    await recordAdminActivityBestEffort(pool, req.user!, {
      category: 'shipping',
      action: req.body.enabled
        ? 'shipping.courier_country.enable'
        : 'shipping.courier_country.disable',
      summary:
        changes.length === 0
          ? `Pays ${countryCode} pour ${code}: aucun changement`
          : `Pays ${countryCode} pour ${code}: ${changeSummary}`,
      targetType: 'courier_country',
      targetId: `${code}:${countryCode}`,
      detail,
    });
    res.json({ success: true, code, countryCode, enabled: req.body.enabled });
  },
);

/** Creates a bearer-only customer session for the currently signed-in admin.
 * It deliberately does not create a refresh token or call recordConnection,
 * so it never appears in the represented customer's recent-login history. */
