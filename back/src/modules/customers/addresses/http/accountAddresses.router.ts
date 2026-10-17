import { Router } from 'express';
import { pool } from '../../../../db/pool.js';
import { requireAuth } from '../../../../middleware/requireAuth.js';
import * as addresses from '../application/addresses.js';
import * as cart from '../../../cart/application/cart.js';
import {
  requireCheckoutPrivacySession,
  sendCheckoutPrivacySessionError,
} from '../../../commerce/application/checkoutPrivacySession.js';
import { addressInputFromBody, addressPatchFromBody } from './addressSchemas.js';
import { toPublicAddress } from '../presentation/addressPresenter.js';

export const accountAddressesRouter = Router();

accountAddressesRouter.get('/addresses', requireAuth, async (req, res) => {
  const rows = await addresses.listForUser(pool, req.user!.id);
  res.json({ success: true, addresses: rows.map(toPublicAddress) });
});

/** Checkout-eligible owned address, including an unconsumed one-time row.
 * A consumed row remains encrypted for its historical order only. The active
 * gift cart’s copied destination is readable without a checkout privacy
 * session so Marc can pay that promise in the shop cart. */
accountAddressesRouter.get('/addresses/:id', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const active = await cart.getActiveCart(pool, req.user!.id);
  if (active?.kind === 'gift' && active.address_id === id) {
    const row = await addresses.getForUser(pool, req.user!.id, id);
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, address: toPublicAddress(row) });
    return;
  }
  try {
    const session = await requireCheckoutPrivacySession(pool, req, req.user!.id);
    const row = await addresses.getForCheckout(pool, req.user!.id, id, session.id);
    if (!row) {
      res.status(404).json({ success: false, error: { code: 'not_found' } });
      return;
    }
    res.json({ success: true, address: toPublicAddress(row) });
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
});

accountAddressesRouter.post('/addresses', requireAuth, async (req, res) => {
  const input = addressInputFromBody(req.body ?? {});
  if (!input) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  try {
    const session =
      input.savedForFuture === false
        ? await requireCheckoutPrivacySession(pool, req, req.user!.id, true)
        : undefined;
    const row = await addresses.create(pool, req.user!.id, input, session?.id);
    res.status(201).json({ success: true, address: toPublicAddress(row) });
  } catch (error) {
    if (!sendCheckoutPrivacySessionError(res, error)) throw error;
  }
});

accountAddressesRouter.patch('/addresses/:id', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const patch = addressPatchFromBody(req.body ?? {});
  if (!patch) {
    res.status(400).json({ success: false, error: { code: 'invalid_request' } });
    return;
  }
  const row = await addresses.update(pool, req.user!.id, id, patch);
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, address: toPublicAddress(row) });
});

accountAddressesRouter.delete('/addresses/:id', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const deleted = await addresses.remove(pool, req.user!.id, id);
  if (!deleted) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true, deleted: true });
});

accountAddressesRouter.post('/addresses/:id/set-default', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await addresses.setDefault(pool, req.user!.id, id);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true });
});

/** Clicking the default badge — see unsetDefault's own doc comment on why
 * this is allowed to leave a genuine zero-default state. */
accountAddressesRouter.post('/addresses/:id/unset-default', requireAuth, async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await addresses.unsetDefault(pool, req.user!.id, id);
  if (!ok) {
    res.status(404).json({ success: false, error: { code: 'not_found' } });
    return;
  }
  res.json({ success: true });
});
