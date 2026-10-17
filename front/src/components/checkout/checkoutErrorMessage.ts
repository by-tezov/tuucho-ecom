import { ApiError } from '../../api/errors';
import { isBackendUnavailableError } from '../../api/http';
import type { Strings } from '../../assets/i18n/types';
import { checkoutFacingError } from '../../utils/checkoutFacingError';

/** Shared by both confirmation dialogs' on-demand intent creation (see
 * onCreateCardIntent/onCreatePayPalIntent) — this is the same error mapping
 * the cart page used to apply eagerly, before intent creation moved to be
 * on-demand at Payer time instead of firing as soon as delivery details
 * resolve. */
export function mapCheckoutErrorMessage(e: unknown, t: Strings): string {
  if (isBackendUnavailableError(e)) return '';
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'empty_cart':
        return t.cart.errorEmptyCart;
      case 'price_missing':
        return t.cart.errorPriceMissing;
      case 'size_unavailable':
        return t.cart.errorSizeUnavailable;
      case 'address_not_found':
        return t.cart.errorAddressUnavailable;
      case 'courier_not_found':
      case 'courier_country_unavailable':
      case 'courier_network_unavailable':
        return t.cart.errorCourierUnavailable;
      case 'shipping_overflow':
        return t.cart.errorShippingOverflow;
      case 'express_unavailable':
        return t.cart.errorExpressUnavailable;
      case 'payment_method_country_unavailable':
        return t.cart.errorPaymentMethodCountryUnavailable;
      case 'payment_method_forbidden':
        return t.cart.errorPaymentMethodForbidden;
      case 'payment_method_not_available':
        return t.cart.errorPaymentMethodNotAvailable;
      case 'loyalty_insufficient':
        return t.cart.errorLoyaltyInsufficient;
      case 'loyalty_incompatible_with_voucher':
        return t.cart.errorLoyaltyIncompatibleWithVoucher;
      default:
        return checkoutFacingError(
          t.cart.paymentErrorGeneric,
          e.serverMessage?.trim() || t.cart.errorPaymentPrepareFailed(e.code),
        );
    }
  }
  return t.cart.paymentErrorGeneric;
}
