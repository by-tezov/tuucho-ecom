import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { deleteNetwork, listNetworks, syncNetworks } from '../../delivery/application/couriers.js';
import { listCountryVocab, syncCountries } from '../../customers/addresses/application/addresses.js';

import { countryMap, networkMap } from '../application/courierImport.js';
import { recordOperatorActivityBestEffort } from '../../activity/application/recordOperatorActivity.js';

export const courierVocabularyRouter = Router();

/** Backs `courier -- seed`'s vocabulary push — the delivery-network
 * vocabulary from catalog source's courier/data-networks.json, same role
 * as POST /operation/library-import/vocabulary for shapes/colors. */
courierVocabularyRouter.post('/networks', async (req, res) => {
  const body = req.body ?? {};
  const networks = networkMap(body.networks);
  const deleteMissing = body.deleteMissing === true;
  const rawNetworks = body.networks;
  const validSource =
    !!rawNetworks &&
    typeof rawNetworks === 'object' &&
    !Array.isArray(rawNetworks) &&
    Object.keys(rawNetworks).every((code) => code.length > 0) &&
    Object.keys(networks).length === Object.keys(rawNetworks).length;
  if (deleteMissing && !validSource) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
    });
    return;
  }
  const result = await syncNetworks(pool, networks, deleteMissing);
  res.json({ success: true, ...result });
});

/** Backs `courier -- seed`'s shipping-country push — catalog source's
 * courier/data-countries.json, the same role data-networks.json plays for
 * delivery networks. It lives with the couriers because a courier's
 * `countries` list can only name a country this table already holds. */
courierVocabularyRouter.post('/countries', async (req, res) => {
  const body = req.body ?? {};
  const countries = countryMap(body.countries);
  const disableMissing = body.disableMissing === true;
  const rawCountries = body.countries;
  const validSource =
    !!rawCountries &&
    typeof rawCountries === 'object' &&
    !Array.isArray(rawCountries) &&
    Object.keys(countries).length === Object.keys(rawCountries).length;
  if (!validSource) {
    res.status(400).json({
      success: false,
      error: { code: 'invalid_request' },
    });
    return;
  }
  const result = await syncCountries(pool, countries, disableMissing);
  res.json({ success: true, ...result });
});

/** Raw vocabulary snapshot for the courier CLI's read-only drift check. */
courierVocabularyRouter.get('/countries', async (_req, res) => {
  res.json({ success: true, countries: await listCountryVocab(pool) });
});

/** Raw vocabulary snapshot for the courier CLI's read-only drift check. */
courierVocabularyRouter.get('/networks', async (_req, res) => {
  const networks = await listNetworks(pool);
  res.json({ success: true, networks });
});

/** Backs `courier -- delete-network <code>`. */
courierVocabularyRouter.delete('/networks/:code', async (req, res) => {
  const { code } = req.params as { code: string };
  const deleted = await deleteNetwork(pool, code);
  if (!deleted) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  await recordOperatorActivityBestEffort(pool, {
    category: 'shipping',
    action: 'courier.delete_network',
    summary: `Suppression reseau: ${code}`,
    targetType: 'network',
    targetId: code,
  });
  res.json({ success: true, deleted: true });
});
