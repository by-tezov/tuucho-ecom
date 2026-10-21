import type pg from 'pg';
import { type AdminOrderRow, type OrderItemRow, type OrderRow } from '../domain/order.js';
import { isLanguage } from '../../../utils/language.js';
import { decryptPii } from '../../../platform/security/piiCrypto.js';
import { applyFilters } from '../../plugins/application/hooks.js';

export function decryptOrderRow(row: OrderRow): OrderRow {
  return {
    ...row,
    guest_email: decryptPii(row.guest_email),
    customer_email: decryptPii(row.customer_email)!,
    customer_first_name: decryptPii(row.customer_first_name),
    customer_last_name: decryptPii(row.customer_last_name),
    placed_as_guest: row.placed_as_guest === true,
    language: row.language && isLanguage(row.language) ? row.language : null,
    recipient_name: decryptPii(row.recipient_name),
    company_name: decryptPii(row.company_name),
    line1: decryptPii(row.line1)!,
    line2: decryptPii(row.line2),
    delivery_notes: decryptPii(row.delivery_notes),
    postal_code: decryptPii(row.postal_code)!,
    city: decryptPii(row.city)!,
    phone: decryptPii(row.phone),
    billing_recipient_name: decryptPii(row.billing_recipient_name),
    billing_company_name: decryptPii(row.billing_company_name),
    billing_line1: decryptPii(row.billing_line1)!,
    billing_line2: decryptPii(row.billing_line2),
    billing_postal_code: decryptPii(row.billing_postal_code)!,
    billing_city: decryptPii(row.billing_city)!,
    billing_phone: decryptPii(row.billing_phone),
  };
}

export function decryptAdminOrderRow(row: AdminOrderRow): AdminOrderRow {
  return {
    ...decryptOrderRow(row),
    user_email: row.user_email != null ? decryptPii(row.user_email) : null,
    user_first_name: decryptPii(row.user_first_name),
    user_last_name: decryptPii(row.user_last_name),
    user_phone: decryptPii(row.user_phone),
  };
}

type AddressPiiFields = {
  recipient_name: string | null;
  company_name: string | null;
  line1: string;
  line2: string | null;
  delivery_notes?: string | null;
  postal_code: string;
  city: string;
  phone: string | null;
};

export function decryptAddressPiiFields<T extends AddressPiiFields>(row: T): T {
  return {
    ...row,
    recipient_name: decryptPii(row.recipient_name),
    company_name: decryptPii(row.company_name),
    line1: decryptPii(row.line1)!,
    line2: decryptPii(row.line2),
    ...(Object.prototype.hasOwnProperty.call(row, 'delivery_notes')
      ? { delivery_notes: decryptPii(row.delivery_notes ?? null) }
      : {}),
    postal_code: decryptPii(row.postal_code)!,
    city: decryptPii(row.city)!,
    phone: decryptPii(row.phone),
  };
}

export async function attachItems(
  client: pg.Pool | pg.PoolClient,
  orders: OrderRow[],
): Promise<Map<string, OrderItemRow[]>> {
  if (orders.length === 0) return new Map();
  const { rows } = await client.query<OrderItemRow>(
    `select * from order_items where order_id = any($1::uuid[]) order by case when origin = 'rule' then 1 else 0 end, id`,
    [orders.map((order) => order.id)],
  );
  const hydrated = await applyFilters('orders.hydrate', rows, { client });
  const byOrder = new Map<string, OrderItemRow[]>();
  for (const row of hydrated) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push(row);
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}
