import type pg from 'pg';
import { emailLookupHash } from '../../../platform/security/piiCrypto.js';

export type VoucherCustomerScope = {
  userId?: string;
  guestEmail?: string;
  excludeReservationId?: string;
};

export function normalizeVoucherCustomerScope(scope?: string | VoucherCustomerScope): VoucherCustomerScope {
  if (typeof scope === 'string') return { userId: scope };
  return scope ?? {};
}

async function resolveVoucherCustomerEmailLookup(
  client: pg.Pool | pg.PoolClient,
  scope: VoucherCustomerScope,
): Promise<string | undefined> {
  if (scope.guestEmail) return emailLookupHash(scope.guestEmail);
  if (!scope.userId) return undefined;
  const { rows } = await client.query<{ email_lookup: string }>(
    `select email_lookup from users where id = $1`,
    [scope.userId],
  );
  return rows[0]?.email_lookup;
}

async function countCustomerVoucherUses(
  client: pg.Pool | pg.PoolClient,
  code: string,
  userId: string | undefined,
  emailLookup: string | undefined,
  excludeReservationId?: string,
): Promise<number> {
  if (!userId && !emailLookup) return 0;
  const { rows } = await client.query<{ count: string }>(
    `select count(*)::text as count
     from (
       select 1
       from voucher_redemptions vr
       join orders o on o.id = vr.order_id
       where vr.voucher_code = $1 and o.status <> 'cancelled'
         and (
           ($2::uuid is not null and (vr.user_id = $2 or o.user_id = $2))
           or ($3::text is not null and o.guest_email_lookup = $3)
         )
       union all
       select 1
       from voucher_holds vh
       where vh.voucher_code = $1 and vh.state = 'held' and vh.expires_at > now()
         and ($4::uuid is null or vh.reservation_id is distinct from $4)
         and (
           ($2::uuid is not null and vh.user_id = $2)
           or ($3::text is not null and vh.guest_email_lookup = $3)
         )
     ) uses`,
    [code, userId ?? null, emailLookup ?? null, excludeReservationId ?? null],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function voucherPerCustomerLimitFailure(
  client: pg.Pool | pg.PoolClient,
  code: string,
  maxUsesPerUser: number,
  scopeInput?: string | VoucherCustomerScope,
): Promise<'voucher_user_limit_reached' | undefined> {
  if (maxUsesPerUser <= 0) return undefined;
  const scope = normalizeVoucherCustomerScope(scopeInput);
  const emailLookup = await resolveVoucherCustomerEmailLookup(client, scope);
  if (!scope.userId && !emailLookup) return undefined;
  const customerUses = await countCustomerVoucherUses(
    client,
    code,
    scope.userId,
    emailLookup,
    scope.excludeReservationId,
  );
  return customerUses >= maxUsesPerUser ? 'voucher_user_limit_reached' : undefined;
}
