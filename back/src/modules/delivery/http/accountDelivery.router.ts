import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { requireAuth } from '../../../middleware/requireAuth.js';
import * as addresses from '../../customers/addresses/application/addresses.js';
import * as cart from '../../cart/application/cart.js';
import * as courierPreferences from '../application/courierPreferences.js';
import * as couriers from '../application/couriers.js';
import {
  deleteUserPreference,
  getUserPreference,
  setUserPreference,
} from '../../identity/application/userPreferences.js';
import { localize, requestLanguage } from '../../../utils/language.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import {
  buildCountriesPayload,
  buildCouriersPayload,
  DEFAULT_COURIER_PREFERENCE,
} from '../application/deliveryPayloads.js';

export const accountDeliveryRouter = Router();

accountDeliveryRouter.get('/address-countries', async (req, res) => {
  res.json({ success: true, countries: await buildCountriesPayload(pool, requestLanguage(req)) });
});

/** Union of countries served by any shop-enabled courier. */
accountDeliveryRouter.get('/phone-countries', async (req, res) => {
  const language = requestLanguage(req);
  const codes = await couriers.listEnabledShippingCountryCodes(pool);
  const rows = await addresses.listCountriesByCodes(pool, codes);
  res.json({
    success: true,
    countries: rows.map((country) => ({
      code: country.code,
      label: localize(country.label, language),
    })),
  });
});

accountDeliveryRouter.get('/delivery-networks', async (req, res) => {
  const language = requestLanguage(req);
  const networks = await couriers.listNetworks(pool);
  res.json({
    success: true,
    networks: networks.map((network) => ({
      code: network.code,
      name: localize(network.name, language),
    })),
  });
});

accountDeliveryRouter.get('/couriers', async (req, res) => {
  res.json({ success: true, couriers: await buildCouriersPayload(pool, requestLanguage(req)) });
});

accountDeliveryRouter.get('/default-courier', requireAuth, async (req, res) => {
  const courierCode = await getUserPreference(pool, req.user!.id, DEFAULT_COURIER_PREFERENCE);
  res.json({ success: true, courierCode });
});

accountDeliveryRouter.put('/default-courier', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
  if (!courierCode) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const enabled = await couriers.listEnabled(pool);
  if (!enabled.some((courier) => courier.code === courierCode)) {
    res.status(404).json({ success: false, error: { code: 'courier_not_found' } });
    return;
  }
  const disabledCodes = await courierPreferences.listDisabledCourierCodes(pool, req.user!.id);
  if (disabledCodes.includes(courierCode)) {
    res.status(404).json({ success: false, error: { code: 'courier_not_found' } });
    return;
  }
  await setUserPreference(pool, req.user!.id, DEFAULT_COURIER_PREFERENCE, courierCode);
  await cart.setActiveCartCourierSelection(pool, req.user!.id, courierCode);
  res.json({ success: true, courierCode });
});

accountDeliveryRouter.post('/default-courier/unset-default', requireAuth, async (req, res) => {
  await deleteUserPreference(pool, req.user!.id, DEFAULT_COURIER_PREFERENCE);
  res.json({ success: true });
});

accountDeliveryRouter.get('/disabled-couriers', requireAuth, async (req, res) => {
  const courierCodes = await courierPreferences.listDisabledCourierCodes(pool, req.user!.id);
  res.json({ success: true, courierCodes });
});

accountDeliveryRouter.post('/disabled-couriers', requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
  if (!courierCode) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const courierId = await couriers.findCourierIdByCode(pool, courierCode);
  if (!courierId) {
    res.status(404).json({ success: false, error: { code: 'courier_not_found' } });
    return;
  }
  await courierPreferences.disable(pool, req.user!.id, courierId);
  const currentDefault = await getUserPreference(pool, req.user!.id, DEFAULT_COURIER_PREFERENCE);
  if (currentDefault === courierCode) {
    await deleteUserPreference(pool, req.user!.id, DEFAULT_COURIER_PREFERENCE);
  }
  res.json({ success: true });
});

accountDeliveryRouter.delete('/disabled-couriers/:courierCode', requireAuth, async (req, res) => {
  const { courierCode } = req.params as { courierCode: string };
  const courierId = await couriers.findCourierIdByCode(pool, courierCode);
  if (!courierId) {
    res.status(404).json({ success: false, error: { code: 'courier_not_found' } });
    return;
  }
  await courierPreferences.enable(pool, req.user!.id, courierId);
  res.json({ success: true });
});
