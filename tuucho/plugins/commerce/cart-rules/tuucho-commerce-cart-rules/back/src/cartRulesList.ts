import type pg from 'pg';
import { isPluginEnabled } from '@kernel/back/modules/plugins/application/pluginStore';
import type { CartRuleKind, CartRuleRow } from './cartRuleEvaluation.js';

export function mapCartRuleRow(row: {
  id: string;
  code: string;
  kind: CartRuleKind;
  enabled: boolean;
  priority: number;
  forbid_voucher: boolean;
  params: unknown;
}): CartRuleRow {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    enabled: row.enabled,
    priority: row.priority,
    forbid_voucher: row.forbid_voucher,
    params: row.params,
  };
}

export async function listCartRules(client: pg.Pool | pg.PoolClient): Promise<CartRuleRow[]> {
  if (!(await isPluginEnabled('tuucho-commerce-cart-rules', client))) return [];
  const { rows } = await client.query<{
    id: string;
    code: string;
    kind: CartRuleKind;
    enabled: boolean;
    priority: number;
    forbid_voucher: boolean;
    params: unknown;
  }>(
    `select id, code, kind, enabled, priority, forbid_voucher, params
     from cart_rules
     order by priority asc, code asc`,
  );
  return rows.map(mapCartRuleRow);
}
