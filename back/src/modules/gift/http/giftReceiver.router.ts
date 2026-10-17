import { Router } from 'express';
import { pool } from '../../../db/pool.js';
import { generateOpaqueToken, hashOpaqueToken } from '../../../platform/security/opaqueToken.js';
import * as couriers from '../../delivery/application/couriers.js';
import { getGiftSettings } from '../infrastructure/giftSettingsRepo.js';
import {
  findLockSessionStatus,
  getGiftDestination,
  insertLockSession,
} from '../infrastructure/giftOfferRepo.js';
import { buildCouriersPayload } from '../../delivery/application/deliveryPayloads.js';
import { requestLanguage } from '../../../utils/language.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import { loadReceiverOffer } from '../application/loadOffer.js';
import {
  loadReceiverSummary,
  putReceiverItem,
  removeReceiverItem,
} from '../application/receiverAccess.js';
import { confirmReceiverChoice } from '../application/receiverConfirm.js';
import { addHours } from '../application/clocks.js';
import { publicDestination } from '../application/presenters.js';
import {
  resolveAccessoryPackKey,
  resolveCartLineVariant,
} from '../../catalog/application/productCartQueries.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';
import { giftReceiverDestinationRouter } from './giftReceiverDestination.router.js';
import { giftReceiverGalleryRouter } from './giftReceiverGallery.router.js';
import { giftReceiverCompositionRouter } from './giftReceiverComposition.router.js';
import { giftPinRateLimiter } from '../../../middleware/rateLimiters.js';
import { unlockGiftPin } from '../application/giftPin.js';
import { requireGiftPin } from './giftPinGuard.js';
import {
  giftPinBodySchema,
  giftReceiverConfirmBodySchema,
  giftReceiverItemBodySchema,
  parseGiftSchema,
} from './giftSchemas.js';

export const giftReceiverRouter = Router();

giftReceiverRouter.post('/:token/pin', giftPinRateLimiter, async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const pinBody = parseGiftSchema(giftPinBodySchema, req.body ?? {});
    const unlocked = await unlockGiftPin(pool, offer, 'receiver', pinBody?.pin);
    res.json({ success: true, pinToken: unlocked.pinToken, expiresAt: unlocked.expiresAt.toISOString() });
  });
});

// Scoped-down on purpose: this is the lock token from POST /:token/session,
// never the receiver token — a tab holding a lock re-sends *this* from every
// non-gift page to see if the lock still makes sense, so it never has to
// keep the powerful receiver token around (which can read items/addresses/
// pricing and mutate the offer) just to answer "am I still locked". No PIN
// gate either: this route is deliberately registered before the `.use`
// below, and the only thing it ever reveals is the bare status.
giftReceiverRouter.get('/lock/:token/status', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const status = await findLockSessionStatus(pool, hashOpaqueToken(token));
    res.json({ success: true, status });
  });
});

giftReceiverRouter.use('/:token', requireGiftPin('receiver'));
giftReceiverRouter.use(giftReceiverGalleryRouter);
giftReceiverRouter.use(giftReceiverDestinationRouter);
giftReceiverRouter.use(giftReceiverCompositionRouter);

giftReceiverRouter.get('/:token', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    res.json({ success: true, ...(await loadReceiverSummary(pool, offer, requestLanguage(req))) });
  });
});

giftReceiverRouter.post('/:token/session', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const settings = await getGiftSettings(pool);
    const lockToken = generateOpaqueToken();
    const expiresAt = addHours(new Date(), settings.lockSessionTtlHours);
    await insertLockSession(pool, offer.id, hashOpaqueToken(lockToken), expiresAt);
    res.json({
      success: true,
      lockToken,
      expiresAt: expiresAt.toISOString(),
      idleTimeoutMs: settings.lockSessionTtlHours * 3_600_000,
    });
  });
});

giftReceiverRouter.get('/:token/items', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    res.json({ success: true, ...(await loadReceiverSummary(pool, offer, requestLanguage(req))) });
  });
});

giftReceiverRouter.put('/:token/items', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const body = parseGiftSchema(giftReceiverItemBodySchema, req.body ?? {});
    if (!body) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const productId = isNonEmptyString(body.productId) ? body.productId : undefined;
    const quantity =
      typeof body.quantity === 'number' && Number.isInteger(body.quantity) ? body.quantity : undefined;
    if (!productId || quantity === undefined || quantity < 0) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const variant = await resolveCartLineVariant(pool, productId, body.shapeKey, body.lengthKey, body.size);
    if (!variant) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const packKey = await resolveAccessoryPackKey(pool, productId, body.packKey);
    if (packKey === null) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const updated = await putReceiverItem(pool, offer, {
      productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
      packKey,
      quantity,
    });
    res.json({ success: true, ...(await loadReceiverSummary(pool, updated, requestLanguage(req))) });
  });
});

giftReceiverRouter.delete('/:token/items', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const body = parseGiftSchema(giftReceiverItemBodySchema, req.body ?? {});
    if (!body) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const productId = isNonEmptyString(body.productId) ? body.productId : undefined;
    if (!productId) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const variant = await resolveCartLineVariant(pool, productId, body.shapeKey, body.lengthKey, body.size);
    if (!variant) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const updated = await removeReceiverItem(pool, offer, {
      productId,
      shapeKey: variant.shapeKey,
      lengthKey: variant.lengthKey,
      size: variant.size,
    });
    res.json({ success: true, ...(await loadReceiverSummary(pool, updated, requestLanguage(req))) });
  });
});

giftReceiverRouter.get('/:token/couriers', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    await loadReceiverOffer(pool, token);
    const destination = await getGiftDestination(pool, (await loadReceiverOffer(pool, token)).id);
    const language = requestLanguage(req);
    const payload = await buildCouriersPayload(pool, language);
    const country = destination?.countryCode;
    res.json({
      success: true,
      couriers: payload
        .filter((courier) => !country || courier.countries.includes(country))
        .map((courier) => ({
          ...courier,
          packets: courier.packets.map(({ packetKey, maxQuantity }) => ({ packetKey, maxQuantity })),
        })),
    });
  });
});

giftReceiverRouter.get('/:token/destination', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const destination = await getGiftDestination(pool, offer.id);
    res.json({ success: true, destination: publicDestination(destination) });
  });
});

giftReceiverRouter.post('/:token/confirm', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    const body = parseGiftSchema(giftReceiverConfirmBodySchema, req.body);
    if (!token || !body) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const updated = await confirmReceiverChoice(pool, offer, body.email);
    res.json({ success: true, ...(await loadReceiverSummary(pool, updated, requestLanguage(req))) });
  });
});

giftReceiverRouter.get('/:token/status', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    let orderStatus: string | null = null;
    let paymentReceived = false;
    let trackingAvailable = false;
    if (offer.orderId) {
      const { rows } = await pool.query<{
        status: string;
        payment_capture_status: string;
        courier_code: string | null;
      }>(`select status, payment_capture_status, courier_code from orders where id = $1`, [offer.orderId]);
      const row = rows[0];
      if (row) {
        orderStatus = row.status;
        paymentReceived =
          row.payment_capture_status === 'authorized' ||
          row.payment_capture_status === 'captured' ||
          row.payment_capture_status === 'not_required';
        if (row.courier_code) {
          trackingAvailable =
            (await couriers.trackingAvailableByCode(pool, [row.courier_code])).get(row.courier_code) ?? false;
        }
      }
    }
    res.json({
      success: true,
      status: offer.status,
      orderStatus,
      paymentReceived,
      trackingAvailable,
      clocks: {
        holdExpiresAt: offer.holdExpiresAt?.toISOString() ?? null,
        payByAt: offer.payByAt?.toISOString() ?? null,
        receiverVisibleUntil: offer.receiverVisibleUntil?.toISOString() ?? null,
      },
    });
  });
});
