/** HTTP mapping for expected checkout-domain failures.
 *
 * Domain services return typed failure reasons without an Express dependency.
 * Every checkout transport uses this map to preserve one public contract.
 */
export const CHECKOUT_FAILURE_STATUS: Readonly<Record<string, number>> = {
  address_not_found: 404,
  billing_address_not_found: 404,
  payment_method_not_available: 409,
  courier_not_found: 404,
  recipient_phone_required: 400,
  voucher_not_found: 404,
  voucher_disabled: 409,
  voucher_not_started: 409,
  voucher_expired: 409,
  voucher_depleted: 409,
  voucher_user_not_allowed: 403,
  voucher_user_limit_reached: 409,
  voucher_conditions_not_met: 409,
  voucher_forbidden_by_rule: 409,
  gift_not_payable: 409,
  composition_editing: 409,
  size_unavailable: 409,
};
