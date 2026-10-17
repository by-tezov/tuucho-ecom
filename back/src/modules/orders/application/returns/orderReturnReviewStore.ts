import type pg from 'pg';
import type { OrderRow } from '../../domain/order.js';
import { decryptOrderRow } from '../../infrastructure/orderRows.js';

export type OrderReturnType = 'unclaimed' | 'refused' | 'other';
export type OrderReturnDetectionSource = 'carrier' | 'admin';
export type OrderReturnRefundMode = 'full' | 'courier_deduction' | 'custom' | 'none';

export interface OrderReturnCaseRow {
  id: string;
  order_id: string;
  previous_status: 'sent' | 'disponible';
  return_type: OrderReturnType;
  detection_source: OrderReturnDetectionSource;
  carrier_evidence: unknown;
  detected_by: string | null;
  detected_at: string;
  resolution_state: 'open' | 'refund_pending' | 'resolved' | 'dismissed';
  decision_reason: string | null;
  refund_mode: OrderReturnRefundMode | null;
  refund_amount_cents: number | null;
  courier_retained_cents: number | null;
  courier_default_cents: number | null;
  loyalty_earn_retained_cents: number;
  courier_override_reason: string | null;
  resolution_request: StoredResolutionRequest | null;
  refund_attempt: number;
  stripe_payment_intent_id: string | null;
  stripe_refund_id: string | null;
  stripe_refund_status: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  email_status: 'not_sent' | 'sending' | 'sent' | 'failed';
  email_attempted_at: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface FulfillmentStockRow {
  order_id: string;
  product_id: string | null;
  product_uid: string;
  shape_key: string;
  length_key: string;
  size: string;
  shipped_quantity: number;
  restocked_quantity: number;
}

export interface OrderReturnStockInput {
  productUid: string;
  shapeKey: string;
  lengthKey: string;
  size: string;
  quantity: number;
}

export interface ResolveOrderReturnInput {
  refundMode: OrderReturnRefundMode;
  courierRetainedCents: number;
  customRefundAmountCents?: number;
  decisionReason: string;
  courierOverrideReason?: string;
  stock: OrderReturnStockInput[];
}

export interface CanonicalResolutionInput {
  refundMode: OrderReturnRefundMode;
  courierRetainedCents: number;
  customRefundAmountCents: number | null;
  decisionReason: string;
  courierOverrideReason: string | null;
  stock: OrderReturnStockInput[];
}

export interface StoredResolutionRequest {
  input: CanonicalResolutionInput;
  refundAmountCents: number;
  loyaltyEarnRetainedCents: number;
}

export function moneyCents(value: string | number): number {
  return Math.round(Number(value) * 100);
}

export function returnStockKey(
  value: Pick<OrderReturnStockInput, 'productUid' | 'shapeKey' | 'lengthKey' | 'size'>,
): string {
  return JSON.stringify([value.productUid, value.shapeKey, value.lengthKey, value.size]);
}

export function canonicalResolutionInput(input: ResolveOrderReturnInput): CanonicalResolutionInput {
  return {
    refundMode: input.refundMode,
    courierRetainedCents: input.courierRetainedCents,
    customRefundAmountCents: input.customRefundAmountCents ?? null,
    decisionReason: input.decisionReason.trim(),
    courierOverrideReason: input.courierOverrideReason?.trim() || null,
    stock: [...input.stock]
      .map((line) => ({
        productUid: line.productUid,
        shapeKey: line.shapeKey,
        lengthKey: line.lengthKey,
        size: line.size,
        quantity: line.quantity,
      }))
      .sort((left, right) => returnStockKey(left).localeCompare(returnStockKey(right))),
  };
}

export function sameCanonicalInput(left: CanonicalResolutionInput, right: CanonicalResolutionInput): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function latestReturnCase(
  client: pg.Pool | pg.PoolClient,
  orderId: string,
  activeOnly = false,
): Promise<OrderReturnCaseRow | undefined> {
  const { rows } = await client.query<OrderReturnCaseRow>(
    `select * from order_return_cases
      where order_id = $1
        ${activeOnly ? "and resolution_state in ('open', 'refund_pending')" : ''}
      order by created_at desc
      limit 1`,
    [orderId],
  );
  return rows[0];
}

export async function returnOrderById(
  client: pg.Pool | pg.PoolClient,
  orderId: string,
  forUpdate = false,
): Promise<OrderRow | undefined> {
  const { rows } = await client.query<OrderRow>(
    `select * from orders where id = $1${forUpdate ? ' for update' : ''}`,
    [orderId],
  );
  return rows[0] ? decryptOrderRow(rows[0]) : undefined;
}
