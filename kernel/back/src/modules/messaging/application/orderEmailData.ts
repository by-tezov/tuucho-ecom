/** Everything an order email renders, HTML and plaintext alike. */
export interface OrderEmailData {
  orderNumber: string;
  total: number;
  courierName: string | null;
  express: boolean;
  shippingFee: number;
  shippingListFee?: number;
  rulesItemDiscount?: number;
  extraLines?: Array<{ label: string; amount: number }>;
  voucherCode?: string | null;
  voucherDiscount?: number | null;
  loyaltyCredit?: number | null;
  loyaltyEarn?: number | null;
  loyaltyEarnStatus?: 'pending' | 'granted' | 'void' | null;
  /** Short, human-displayable HMAC fingerprint of the order's content — see
   * orders.service.ts's computeOrderContentHash/formatIntegrityToken. Only
   * set on orders created after this feature shipped (nullable for older
   * rows), and only ever shown on the customer confirmation, not the spy
   * copy or the shipped email. */
  integrityToken?: string | null;
  /** At least one of recipientName/companyName is always set. */
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  /** When false, confirmation/shipped mails also render the billing block.
   * Omitted / true = billing same as shipping (no second block). */
  billingSameAsShipping?: boolean;
  billingRecipientName?: string | null;
  billingCompanyName?: string | null;
  billingLine1?: string | null;
  billingLine2?: string | null;
  billingPostalCode?: string | null;
  billingCity?: string | null;
  billingCountryCode?: string | null;
  items: {
    productId?: string | null;
    id?: string | null;
    productUid?: string | null;
    productType?: string | null;
    title: string | { fr: string };
    shapeKey: string;
    shapeLabel?: string;
    lengthKey?: string;
    lengthLabel?: string;
    packKey?: string;
    packLabel?: string;
    photo?: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    origin?: 'user' | 'rule' | string | null;
    locked?: boolean;
    /** Customer note typed on the cart card; null when none. */
    comment?: string | null;
    nails?: Array<{
      title: string | { fr: string };
      shapeLabel?: string;
      lengthLabel?: string;
      finger: string;
      photo?: string | null;
    }>;
  }[];
}
