import {
  readCourierPriceJson,
  readOptionalCourierPriceJson,
  resolveCourierPrice,
  resolveOptionalCourierPrice,
} from './courierPrice.js';

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function shippingFeeForTier(
  price: unknown,
  expressPrice: unknown,
  express: boolean,
  countryCode: string,
):
  | { ok: true; shippingListFee: number }
  | { ok: false; reason: 'express_unavailable' | 'shipping_price_unavailable' } {
  if (express) {
    const expressValue = readOptionalCourierPriceJson(expressPrice);
    if (expressValue === null) return { ok: false, reason: 'express_unavailable' };
    const resolved = resolveOptionalCourierPrice(expressValue, countryCode);
    if (resolved === null) return { ok: false, reason: 'express_unavailable' };
    return { ok: true, shippingListFee: resolved };
  }
  const listPrice = readCourierPriceJson(price);
  const resolved = resolveCourierPrice(listPrice, countryCode);
  if (resolved === null) return { ok: false, reason: 'shipping_price_unavailable' };
  return { ok: true, shippingListFee: resolved };
}
