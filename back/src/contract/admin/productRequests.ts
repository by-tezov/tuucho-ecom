/**
 * Generated from the API contract. Do not edit here.
 *
 * Source of truth: pamsurin-back `src/contract/admin/productRequests.ts`.
 * Regenerate the front copy with `npm run sync:contract` in pamsurin-back.
 */

export type AdminProductRequestStatus = 'requested' | 'accepted' | 'refused';

export interface AdminProductRequest {
  id: string;
  publicId: string;
  email: string;
  productUid: string;
  title: string;
  shapeLabel: string;
  lengthKey: string;
  size: string;
  quantity: number;
  comment: string | null;
  status: AdminProductRequestStatus;
  unitPrice: number | null;
  photoPath: string | null;
  responsePrice: number | null;
  responseMessage: string | null;
  createdAt: string;
  statusUpdatedAt: string;
}

export interface AdminProductRequestMessage {
  id: string;
  direction: 'admin' | 'customer';
  body: string;
  createdAt: string;
}
