export type GiftFailureCode =
  | 'gift_inactive'
  | 'gift_frozen'
  | 'gift_gone'
  | 'gift_stock_unavailable'
  | 'gift_budget_exceeded'
  | 'gift_accessory_budget_exceeded'
  | 'gift_accessories_forbidden'
  | 'gift_sets_exceeded'
  | 'gift_budget_ceiling'
  | 'gift_budget_floor'
  | 'gift_already_ordered'
  | 'gift_not_payable'
  | 'gift_not_editable'
  | 'gift_extend_limit'
  | 'gift_pin_required'
  | 'gift_pin_invalid'
  | 'gift_pin_throttled'
  | 'gift_pin_locked'
  | 'not_found'
  | 'invalid_request';

export class GiftFailure extends Error {
  readonly code: GiftFailureCode;
  readonly httpStatus: number;
  readonly extras: Record<string, unknown> | undefined;

  constructor(code: GiftFailureCode, httpStatus: number, message = code, extras?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.extras = extras;
  }
}

export function failGift(code: GiftFailureCode, extras?: Record<string, unknown>): never {
  throw new GiftFailure(code, giftHttpStatus(code), code, extras);
}

export function giftHttpStatus(code: GiftFailureCode): number {
  switch (code) {
    case 'gift_gone':
      return 410;
    case 'gift_inactive':
    case 'gift_frozen':
    case 'gift_stock_unavailable':
    case 'gift_budget_exceeded':
    case 'gift_accessory_budget_exceeded':
    case 'gift_accessories_forbidden':
    case 'gift_sets_exceeded':
    case 'gift_already_ordered':
    case 'gift_not_payable':
    case 'gift_not_editable':
    case 'gift_extend_limit':
      return 409;
    case 'gift_pin_required':
    case 'gift_pin_invalid':
      return 401;
    case 'gift_pin_throttled':
      return 429;
    case 'gift_pin_locked':
      return 403;
    case 'not_found':
      return 404;
    default:
      return 400;
  }
}
