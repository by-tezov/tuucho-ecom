import { Router } from 'express';
import { pool } from '@kernel/back/db/pool';
import * as addresses from '@kernel/back/modules/customers/addresses/application/addresses';
import * as couriers from '@kernel/back/modules/delivery/application/couriers';
import { buildCountriesPayload } from '@kernel/back/modules/delivery/application/deliveryPayloads';
import { localize, requestLanguage } from '@kernel/back/utils/language';
import { boundedPhone, boundedPostalCode, boundedPrintable } from '@kernel/back/utils/fieldLimits';
import { isNonEmptyString } from '@kernel/back/utils/validate';
import { loadReceiverOffer } from '../application/loadOffer.js';
import { loadReceiverSummary, putReceiverDestination } from '../application/receiverAccess.js';
import type { GiftDestinationInput } from '../infrastructure/giftOfferRepo.js';
import { failGift } from '../domain/errors.js';
import { rawPathToken, withGiftErrors } from './giftErrors.js';
import { giftReceiverDestinationBodySchema, parseGiftSchema } from './giftSchemas.js';

/** Julie's delivery-address surface: where the gift ships and the two country
 * lists that form needs. Split out of giftReceiver.router.ts only for size —
 * it mounts on the same paths, behind the same PIN guard, and stays a leaf
 * router with no logic of its own. */
export const giftReceiverDestinationRouter = Router();

giftReceiverDestinationRouter.put('/:token/destination', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) {
      res.status(400).json({ success: false, error: { code: 'invalid_request' } });
      return;
    }
    const offer = await loadReceiverOffer(pool, token);
    const body = parseGiftSchema(giftReceiverDestinationBodySchema, req.body ?? {}) ?? {};
    const destination: GiftDestinationInput = {
      recipientName:
        typeof body.recipientName === 'string' ? (boundedPrintable(body.recipientName, 80) ?? null) : null,
      companyName:
        typeof body.companyName === 'string' ? (boundedPrintable(body.companyName, 80) ?? null) : null,
      line1: boundedPrintable(body.line1, 120) ?? '',
      line2: typeof body.line2 === 'string' ? (boundedPrintable(body.line2, 120) ?? null) : null,
      deliveryNotes:
        typeof body.deliveryNotes === 'string' ? (boundedPrintable(body.deliveryNotes, 500) ?? null) : null,
      postalCode: boundedPostalCode(body.postalCode) ?? '',
      city: boundedPrintable(body.city, 80) ?? '',
      countryCode: isNonEmptyString(body.countryCode) ? body.countryCode.toUpperCase() : '',
      phone:
        body.phone === undefined || body.phone === null || body.phone === ''
          ? null
          : (boundedPhone(body.phone) ?? null),
      courierCode: isNonEmptyString(body.courierCode) ? body.courierCode : '',
      networkCodes: Array.isArray(body.networkCodes)
        ? body.networkCodes.filter((code: unknown): code is string => typeof code === 'string')
        : [],
      pickupPoints:
        body.pickupPoints && typeof body.pickupPoints === 'object' && !Array.isArray(body.pickupPoints)
          ? (body.pickupPoints as GiftDestinationInput['pickupPoints'])
          : {},
    };
    const updated = await putReceiverDestination(pool, offer, destination);
    res.json({ success: true, ...(await loadReceiverSummary(pool, updated)) });
  });
});

giftReceiverDestinationRouter.get('/:token/address-countries', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) failGift('invalid_request');
    await loadReceiverOffer(pool, token);
    res.json({ success: true, countries: await buildCountriesPayload(pool, requestLanguage(req)) });
  });
});

giftReceiverDestinationRouter.get('/:token/phone-countries', async (req, res) => {
  await withGiftErrors(res, async () => {
    const token = rawPathToken(req);
    if (!token) failGift('invalid_request');
    await loadReceiverOffer(pool, token);
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
});
