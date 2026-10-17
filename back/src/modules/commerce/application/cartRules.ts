import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  CART_RULE_KINDS,
  validateAndNormalizeParams,
  type CartRuleKind,
  type CartRuleRow,
  type CartRuleUpsertInput,
} from '../domain/cartRuleEvaluation.js';
import { mapCartRuleRow } from './cartRulesList.js';

/** The rule vocabulary and its evaluation are defined in
 * `domain/cartRuleEvaluation.ts`; this module owns their storage. Re-exported
 * so a caller needs one import for both. */
export * from '../domain/cartRuleEvaluation.js';
export { listCartRules } from './cartRulesList.js';

export async function getCartRuleByCode(
  client: pg.Pool | pg.PoolClient,
  code: string,
): Promise<CartRuleRow | undefined> {
  const normalized = code.trim().toLowerCase();
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
     from cart_rules where lower(code) = $1`,
    [normalized],
  );
  return rows[0] ? mapCartRuleRow(rows[0]) : undefined;
}

export async function upsertCartRule(
  client: pg.Pool | pg.PoolClient,
  input: CartRuleUpsertInput,
): Promise<CartRuleRow> {
  const code = input.code.trim().toLowerCase();
  if (!code || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) throw new Error('invalid_params');
  const kind = input.kind;
  if (!CART_RULE_KINDS.includes(kind)) throw new Error('invalid_params');
  const params = validateAndNormalizeParams(kind, input.params);
  const enabled = input.enabled !== false;
  const priority = input.priority ?? 100;
  if (!Number.isInteger(priority)) throw new Error('invalid_params');
  const forbidVoucher = input.forbidVoucher === true;

  const existing = await getCartRuleByCode(client, code);
  if (existing) {
    const { rows } = await client.query<{
      id: string;
      code: string;
      kind: CartRuleKind;
      enabled: boolean;
      priority: number;
      forbid_voucher: boolean;
      params: unknown;
    }>(
      `update cart_rules
       set code = $2, kind = $3, enabled = $4, priority = $5, forbid_voucher = $6, params = $7::jsonb, updated_at = now()
       where id = $1
       returning id, code, kind, enabled, priority, forbid_voucher, params`,
      [existing.id, code, kind, enabled, priority, forbidVoucher, JSON.stringify(params)],
    );
    return mapCartRuleRow(rows[0]!);
  }

  const { rows } = await client.query<{
    id: string;
    code: string;
    kind: CartRuleKind;
    enabled: boolean;
    priority: number;
    forbid_voucher: boolean;
    params: unknown;
  }>(
    `insert into cart_rules (id, code, kind, enabled, priority, forbid_voucher, params)
     values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     returning id, code, kind, enabled, priority, forbid_voucher, params`,
    [randomUUID(), code, kind, enabled, priority, forbidVoucher, JSON.stringify(params)],
  );
  return mapCartRuleRow(rows[0]!);
}

export async function setCartRuleEnabled(
  client: pg.Pool | pg.PoolClient,
  code: string,
  enabled: boolean,
): Promise<boolean> {
  const { rowCount } = await client.query(
    `update cart_rules set enabled = $2, updated_at = now() where lower(code) = $1`,
    [code.trim().toLowerCase(), enabled],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteCartRule(client: pg.Pool | pg.PoolClient, code: string): Promise<boolean> {
  const { rowCount } = await client.query(`delete from cart_rules where lower(code) = $1`, [
    code.trim().toLowerCase(),
  ]);
  return (rowCount ?? 0) > 0;
}

/** After merchandise lines priced: compute discounts/shipping. Gift lines already at unit 0.
 * Franco uses paid-item subtotal after volume remise — never `shippingListFee`. */
