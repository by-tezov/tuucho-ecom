import type { CheckoutPaymentMethod } from '../../api/checkout';
import type { Strings } from '../../assets/i18n/types';
import type { WalletAvailability } from '../../hooks/useWalletAvailability';
import type { PaymentBootstrap } from '../../state/cartPaymentBootstrap';
import type { ConfirmDeliveryAddressFields } from './CheckoutConfirmationShell';

/** Stable first-paint data from the cart bootstrap. */
export type CheckoutPaymentBootstrap = PaymentBootstrap & {
  walletAvailability: WalletAvailability;
  revision: number;
};

export type WalletCheckoutMethod = Extract<CheckoutPaymentMethod, 'google_pay' | 'apple_pay'>;

export interface CheckoutFormState {
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
}

export interface PreparedPaymentIntent {
  clientSecret: string;
  reservationExpiresAt: string;
}

/** What a payment / cancel confirmation lists, one row per kind present. */
export interface ConfirmItemCounts {
  /** Catalogue nail sets. */
  nailQty: number;
  /** Plugin extra-set rows, never counted as catalogue sets. */
  extraQty: number;
  accessoryQty: number;
  giftQty: number;
}

export interface CheckoutSummaryProps {
  t: Strings;
  total: number;
  hasOutOfStockItems: boolean;
  /** Catalogue sets, extra-set rows, accessories and gifts counted apart —
   * see ConfirmItemsCountSummary, one line per kind that's present. */
  itemCounts: ConfirmItemCounts;
  receiptEmail: string | null;
  /** Selected livraison address — shown on payment confirm like cancel order. */
  deliveryAddress?: ConfirmDeliveryAddressFields | null | undefined;
}

export interface CheckoutCallbacks {
  onPaymentMethodChange: (id: string | null) => void;
  onStateChange: (state: CheckoutFormState) => void;
  onSuccess: (orderNumber: string, loyaltyEarn?: number | null) => void;
  onCreateCardIntent: (paymentMethodId: string) => Promise<PreparedPaymentIntent>;
  /** Card fields collected in the pay sheet (no pre-saved pm_…). */
  onCreateNewCardIntent: () => Promise<PreparedPaymentIntent>;
  onCreatePayPalIntent: () => Promise<PreparedPaymentIntent>;
  onCreateBancontactIntent: () => Promise<PreparedPaymentIntent>;
  onCreateWalletIntent: (method: WalletCheckoutMethod) => Promise<PreparedPaymentIntent>;
  onCompleteFreeOrder: () => Promise<{ order: { orderNumber: string; loyaltyEarn?: number } }>;
}

export interface CartCheckoutSectionProps extends CheckoutCallbacks, CheckoutSummaryProps {
  deliveryReady: boolean;
  isFreeOrder: boolean;
  selectedPaymentMethodId: string | null;
  /** Delivery address country — refreshes geo union for payment overflow. */
  shippingCountryCode?: string | undefined;
  formId: string;
  guestCheckoutReady: boolean;
  paymentBootstrap: CheckoutPaymentBootstrap;
}
