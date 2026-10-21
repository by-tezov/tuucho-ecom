import { config } from '../../../config/env.js';
import type { GuestAddressInput, GuestLineInput } from '../../orders/application/ordersFacade.js';
import {
  boundedEmail,
  boundedPhone,
  boundedPostalCode,
  boundedPrintable,
  boundedVoucherCode,
  isPositiveIntegerAtMost,
  lineCommentOrNull,
} from '../../../utils/fieldLimits.js';
import { isLanguage } from '../../../utils/language.js';
import { isNonEmptyString } from '../../../utils/validate.js';
import { pickupPointsField, stringArrayField } from '../../customers/addresses/presentation/addressFields.js';

const MAX_GUEST_ITEMS = 50;

function guestLineInputFromBody(raw: unknown): GuestLineInput | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const item = raw as Record<string, unknown>;
  const productId = isNonEmptyString(item.productId) ? item.productId : undefined;
  const quantity = isPositiveIntegerAtMost(item.quantity, config.fieldLimits.cartQuantityMax)
    ? item.quantity
    : undefined;
  const comment = lineCommentOrNull(item.comment);
  if (!productId || quantity === undefined || comment === undefined) return undefined;
  return {
    productId,
    shapeKey: typeof item.shapeKey === 'string' ? item.shapeKey : '',
    lengthKey: typeof item.lengthKey === 'string' ? item.lengthKey : '',
    size: typeof item.size === 'string' ? item.size : '',
    packKey: typeof item.packKey === 'string' ? item.packKey : '',
    quantity,
    comment,
  };
}

export function guestItemsFromBody(raw: unknown): GuestLineInput[] | undefined {
  if (!Array.isArray(raw) || raw.length > MAX_GUEST_ITEMS) return undefined;
  if (raw.length === 0) return [];
  const items = raw.map(guestLineInputFromBody);
  if (items.some((item) => item === undefined)) return undefined;
  return items as GuestLineInput[];
}

export function guestAddressInputFromBody(raw: unknown): GuestAddressInput | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const body = raw as Record<string, unknown>;
  const recipientName = boundedPrintable(body.recipientName, config.fieldLimits.recipientNameMax);
  const companyName = boundedPrintable(body.companyName, config.fieldLimits.companyNameMax);
  const line1 = boundedPrintable(body.line1, config.fieldLimits.addressLineMax);
  const line2 =
    body.line2 === undefined ||
    body.line2 === null ||
    (typeof body.line2 === 'string' && body.line2.trim() === '')
      ? null
      : (boundedPrintable(body.line2, config.fieldLimits.addressLineMax) ?? undefined);
  const deliveryNotes =
    body.deliveryNotes === undefined ||
    body.deliveryNotes === null ||
    (typeof body.deliveryNotes === 'string' && body.deliveryNotes.trim() === '')
      ? null
      : (boundedPrintable(body.deliveryNotes, config.fieldLimits.deliveryNotesMax) ?? undefined);
  const postalCode = boundedPostalCode(body.postalCode);
  const city = boundedPrintable(body.city, config.fieldLimits.cityMax);
  const countryCode = boundedPrintable(body.countryCode, config.fieldLimits.countryCodeMax);
  const phone =
    body.phone === undefined ||
    body.phone === null ||
    (typeof body.phone === 'string' && body.phone.trim() === '')
      ? null
      : (boundedPhone(body.phone) ?? undefined);
  if (
    (!recipientName && !companyName) ||
    (typeof body.recipientName === 'string' && body.recipientName.trim().length > 0 && !recipientName) ||
    (typeof body.companyName === 'string' && body.companyName.trim().length > 0 && !companyName) ||
    !line1 ||
    line2 === undefined ||
    deliveryNotes === undefined ||
    !postalCode ||
    !city ||
    !countryCode ||
    phone === undefined
  ) {
    return undefined;
  }

  const declaredNetworks = stringArrayField(body.networkCodes);
  const hasPickupNetwork = declaredNetworks.some((code) => code !== 'home');
  const networkCodes = [...new Set(hasPickupNetwork ? declaredNetworks : ['home', ...declaredNetworks])];
  const pickupPoints = pickupPointsField(body.pickupPoints, networkCodes);
  if (body.pickupPoints !== undefined && pickupPoints === undefined) return undefined;
  return {
    recipientName: recipientName ?? null,
    companyName: companyName ?? null,
    line1,
    line2,
    deliveryNotes,
    postalCode,
    city,
    countryCode,
    phone,
    networkCodes,
    pickupPoints: pickupPoints ?? {},
    label: boundedPrintable(body.label, config.fieldLimits.addressLabelMax) ?? null,
    savedForFuture: body.savedForFuture === true,
  };
}

/** Shared parse for every state-changing guest checkout route. */
export function parseGuestCheckoutRequest(body: Record<string, unknown>) {
  const items = guestItemsFromBody(body.items);
  const address = guestAddressInputFromBody(body.address);
  const billingAddress =
    body.billingAddress && typeof body.billingAddress === 'object'
      ? guestAddressInputFromBody(body.billingAddress)
      : undefined;
  const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
  const express = body.express === true;
  const email = boundedEmail(body.email);
  const gdprConsent =
    body.gdprConsent && typeof body.gdprConsent === 'object'
      ? (body.gdprConsent as Record<string, unknown>)
      : undefined;
  const gdprAccepted = gdprConsent?.accepted === true;
  const language = typeof body.language === 'string' && isLanguage(body.language) ? body.language : undefined;
  const voucherCode = boundedVoucherCode(body.voucherCode);
  const rememberCard = body.rememberCard === true;
  if (
    !items ||
    !address ||
    (body.billingAddress && !billingAddress) ||
    !courierCode ||
    !email ||
    !gdprAccepted ||
    (body.voucherCode !== undefined &&
      body.voucherCode !== null &&
      !(typeof body.voucherCode === 'string' && body.voucherCode.trim() === '') &&
      !voucherCode)
  ) {
    return undefined;
  }
  return {
    items,
    address,
    billingAddress,
    courierCode,
    express,
    email,
    language,
    voucherCode,
    rememberCard,
  };
}

/**
 * The quote body behind `/guest/checkout/voucher/validate`: the same ad-hoc
 * basket the guest is about to pay for. `undefined` means the body is not
 * usable at all; a basket with neither a line nor a composed set counts as
 * not usable, as it has nothing to price.
 */
export function parseGuestVoucherValidateBody(body: Record<string, unknown>) {
  const items = guestItemsFromBody(body.items);
  const address = guestAddressInputFromBody(body.address);
  const billingAddress =
    body.billingAddress && typeof body.billingAddress === 'object'
      ? guestAddressInputFromBody(body.billingAddress)
      : undefined;
  const courierCode = isNonEmptyString(body.courierCode) ? body.courierCode : undefined;
  const code = boundedVoucherCode(body.code);
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : undefined;
  if (
    !items ||
    !address ||
    (body.billingAddress && !billingAddress) ||
    !courierCode ||
    !code
  ) {
    return undefined;
  }
  return {
    items,
    address,
    billingAddress,
    courierCode,
    express: body.express === true,
    code,
    email,
  };
}
