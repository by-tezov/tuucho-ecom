import type { InvoiceCopy } from '../domain/invoiceCopy.js';

export type { InvoiceCopy };

export interface InvoiceItem {
  productId?: string | null;
  productUid?: string | null;
  productType?: string | null;
  id?: string | null;
  title: string;
  shapeKey: string;
  shapeLabel: string;
  lengthKey?: string;
  lengthLabel?: string;
  packKey?: string;
  packLabel?: string;
  size: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  origin?: 'user' | 'rule' | string | null;
  locked?: boolean;
  /** Customer note typed on the cart card; null when none. */
  comment?: string | null;
  nails?: Array<{
    title: string;
    productUid?: string | null;
    shapeLabel?: string;
    lengthLabel?: string;
    finger: string;
    /** "Couleur : Rose", empty for a nail without variations. */
    variationLabel?: string;
  }>;
}

export interface InvoiceData {
  invoiceNumber: string;
  orderNumber: string;
  orderDate: Date;
  integrityToken: string | null;
  /** Delivery address — always shown, even when identical to the billing one.
   * At least one of recipientName/companyName is always set. */
  recipientName: string | null;
  companyName: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  countryCode: string;
  /** Bill-to address — the actual invoice recipient. */
  billingRecipientName: string | null;
  billingCompanyName: string | null;
  billingLine1: string;
  billingLine2: string | null;
  billingPostalCode: string;
  billingCity: string;
  billingCountryCode: string;
  items: InvoiceItem[];
  subtotal: number;
  shippingFee: number;
  shippingListFee: number;
  rulesItemDiscount: number;
  courierName: string | null;
  express: boolean;
  extraLines: Array<{ label: string; amount: number }>;
  total: number;
  paymentCaptureStatus: 'authorized' | 'captured' | 'not_required' | 'canceled' | 'expired';
  paymentMethodType: 'card' | 'paypal' | 'bancontact' | 'free' | null;
  paymentCardBrand: string | null;
  paymentCardLast4: string | null;
  gift?: {
    giverDisplayName: string;
    receiverName: string;
    maxSets: number | null;
    maxBudget: number | null;
  } | null;
  copy: InvoiceCopy;
}
