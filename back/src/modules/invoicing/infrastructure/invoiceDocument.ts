import type { OrderDisplaySection } from '../../../utils/groupOrderDisplayLines.js';

/** Shapes and fixed French copy the invoice PDF renders. The invoice is
 * always French (see invoices.ts's INVOICE_LANGUAGE), so these labels are a
 * fixed set, not looked up per language. */

// The invoice is always French (see invoices.service.ts's INVOICE_LANGUAGE),
// so these section-header labels above the nail set / accessory / gift
// blocks of the item table are a fixed set, not looked up per language.
export const ITEM_SECTION_LABELS_FR: Record<OrderDisplaySection, string> = {
  nail: 'Pieces',
  composition: 'Ensembles',
  accessory: 'Accessoires',
  gift: 'Cadeaux offerts',
};

export const FINGER_LABELS_FR: Record<string, string> = {
  'left-thumb': 'pouce gauche',
  'left-index': 'index gauche',
  'left-middle': 'majeur gauche',
  'left-ring': 'annulaire gauche',
  'left-pinky': 'auriculaire gauche',
  'right-thumb': 'pouce droit',
  'right-index': 'index droit',
  'right-middle': 'majeur droit',
  'right-ring': 'annulaire droit',
  'right-pinky': 'auriculaire droit',
};

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
  voucherCode: string | null;
  voucherDiscount: number | null;
  loyaltyCredit: number | null;
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
}
