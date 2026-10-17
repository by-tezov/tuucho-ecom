/**
 * Compatibility entry point for cart routes. Payment selection and all
 * confirmation forms live in CheckoutPaymentSection so the public cart
 * surface stays small and stable.
 */
export {
  CartCheckoutSection,
  type CartCheckoutSectionProps,
  type CheckoutFormState,
  type CheckoutPaymentBootstrap,
} from '../checkout/CheckoutPaymentSection';
