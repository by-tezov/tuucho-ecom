import { config } from '../../../../config/env.js';
import type { AddressInput, AddressPatch } from '../application/addresses.js';
import { boundedPhone, boundedPostalCode, boundedPrintable } from '../../../../utils/fieldLimits.js';
import { isNonEmptyString } from '../../../../utils/validate.js';
import { pickupPointsField, stringArrayField } from '../presentation/addressFields.js';

/** An address can belong to more than one network at once (see
 * addresses.service.ts) — defaults to `['home']` when none is sent for a
 * livraison address. A facturation address never carries a network or a
 * pickup reference. */
export function addressInputFromBody(body: Record<string, unknown>): AddressInput | undefined {
  const kind = body.kind === 'livraison' || body.kind === 'facturation' ? body.kind : undefined;
  const recipientName = boundedPrintable(body.recipientName, config.fieldLimits.recipientNameMax);
  const companyName = boundedPrintable(body.companyName, config.fieldLimits.companyNameMax);
  const line1 = boundedPrintable(body.line1, config.fieldLimits.addressLineMax);
  const line2 =
    body.line2 === undefined ||
    body.line2 === null ||
    (typeof body.line2 === 'string' && body.line2.trim() === '')
      ? undefined
      : boundedPrintable(body.line2, config.fieldLimits.addressLineMax);
  const deliveryNotesRaw =
    body.deliveryNotes === undefined ||
    body.deliveryNotes === null ||
    (typeof body.deliveryNotes === 'string' && body.deliveryNotes.trim() === '')
      ? undefined
      : boundedPrintable(body.deliveryNotes, config.fieldLimits.deliveryNotesMax);
  const postalCode = boundedPostalCode(body.postalCode);
  const city = boundedPrintable(body.city, config.fieldLimits.cityMax);
  const countryCode = boundedPrintable(body.countryCode, config.fieldLimits.countryCodeMax);
  const label =
    body.label === undefined ||
    body.label === null ||
    (typeof body.label === 'string' && body.label.trim() === '')
      ? undefined
      : boundedPrintable(body.label, config.fieldLimits.addressLabelMax);
  const phone =
    body.phone === undefined ||
    body.phone === null ||
    (typeof body.phone === 'string' && body.phone.trim() === '')
      ? undefined
      : boundedPhone(body.phone);
  const isFacturation = kind === 'facturation';
  const networkCodesRaw = isFacturation ? [] : stringArrayField(body.networkCodes);
  const networkCodes = isFacturation ? [] : networkCodesRaw.length > 0 ? networkCodesRaw : ['home'];
  const pickupPoints = isFacturation ? {} : pickupPointsField(body.pickupPoints, networkCodes);
  if (
    !kind ||
    (!recipientName && !companyName) ||
    (typeof body.recipientName === 'string' && body.recipientName.trim().length > 0 && !recipientName) ||
    (typeof body.companyName === 'string' && body.companyName.trim().length > 0 && !companyName) ||
    !line1 ||
    !postalCode ||
    !city ||
    !countryCode ||
    (body.line2 !== undefined &&
      body.line2 !== null &&
      !(typeof body.line2 === 'string' && body.line2.trim() === '') &&
      !line2) ||
    (body.deliveryNotes !== undefined &&
      body.deliveryNotes !== null &&
      !(typeof body.deliveryNotes === 'string' && body.deliveryNotes.trim() === '') &&
      !deliveryNotesRaw) ||
    (body.label !== undefined &&
      body.label !== null &&
      !(typeof body.label === 'string' && body.label.trim() === '') &&
      !label) ||
    (body.phone !== undefined &&
      body.phone !== null &&
      !(typeof body.phone === 'string' && body.phone.trim() === '') &&
      !phone) ||
    (!isFacturation && 'pickupPoints' in body && !pickupPoints)
  )
    return undefined;
  return {
    kind,
    recipientName,
    companyName,
    line1,
    line2,
    deliveryNotes: isFacturation ? undefined : deliveryNotesRaw,
    postalCode,
    city,
    countryCode,
    label,
    phone,
    networkCodes,
    pickupPoints,
    isDefault: body.isDefault === true,
    savedForFuture: body.savedForFuture !== false,
  };
}

export function addressPatchFromBody(body: Record<string, unknown>): AddressPatch | undefined {
  if ('networkCodes' in body || 'pickupPoints' in body) return undefined;
  const patch: AddressPatch = {};
  if ('recipientName' in body || 'companyName' in body) {
    const recipientName = boundedPrintable(body.recipientName, config.fieldLimits.recipientNameMax);
    const companyName = boundedPrintable(body.companyName, config.fieldLimits.companyNameMax);
    if (
      (typeof body.recipientName === 'string' && body.recipientName.trim().length > 0 && !recipientName) ||
      (typeof body.companyName === 'string' && body.companyName.trim().length > 0 && !companyName)
    ) {
      return undefined;
    }
    if (!recipientName && !companyName) return undefined;
    patch.recipientName = recipientName;
    patch.companyName = companyName;
  }
  if (isNonEmptyString(body.line1)) {
    const line1 = boundedPrintable(body.line1, config.fieldLimits.addressLineMax);
    if (!line1) return undefined;
    patch.line1 = line1;
  }
  if (isNonEmptyString(body.postalCode)) {
    const postalCode = boundedPostalCode(body.postalCode);
    if (!postalCode) return undefined;
    patch.postalCode = postalCode;
  }
  if (isNonEmptyString(body.city)) {
    const city = boundedPrintable(body.city, config.fieldLimits.cityMax);
    if (!city) return undefined;
    patch.city = city;
  }
  if (isNonEmptyString(body.countryCode)) {
    const countryCode = boundedPrintable(body.countryCode, config.fieldLimits.countryCodeMax);
    if (!countryCode) return undefined;
    patch.countryCode = countryCode;
  }
  if ('line2' in body) {
    if (
      body.line2 === undefined ||
      body.line2 === null ||
      (typeof body.line2 === 'string' && body.line2.trim() === '')
    ) {
      patch.line2 = undefined;
    } else {
      const line2 = boundedPrintable(body.line2, config.fieldLimits.addressLineMax);
      if (!line2) return undefined;
      patch.line2 = line2;
    }
  }
  if ('deliveryNotes' in body) {
    if (
      body.deliveryNotes === undefined ||
      body.deliveryNotes === null ||
      (typeof body.deliveryNotes === 'string' && body.deliveryNotes.trim() === '')
    ) {
      patch.deliveryNotes = undefined;
    } else {
      const deliveryNotes = boundedPrintable(body.deliveryNotes, config.fieldLimits.deliveryNotesMax);
      if (!deliveryNotes) return undefined;
      patch.deliveryNotes = deliveryNotes;
    }
  }
  if ('label' in body) {
    if (
      body.label === undefined ||
      body.label === null ||
      (typeof body.label === 'string' && body.label.trim() === '')
    ) {
      patch.label = undefined;
    } else {
      const label = boundedPrintable(body.label, config.fieldLimits.addressLabelMax);
      if (!label) return undefined;
      patch.label = label;
    }
  }
  if ('phone' in body) {
    if (
      body.phone === undefined ||
      body.phone === null ||
      (typeof body.phone === 'string' && body.phone.trim() === '')
    ) {
      patch.phone = undefined;
    } else {
      const phone = boundedPhone(body.phone);
      if (!phone) return undefined;
      patch.phone = phone;
    }
  }
  if (body.isDefault === true) patch.isDefault = true;
  return patch;
}
