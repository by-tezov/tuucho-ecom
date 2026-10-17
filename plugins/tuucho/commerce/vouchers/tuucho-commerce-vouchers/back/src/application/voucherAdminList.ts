import type pg from 'pg';
import { decryptPii } from '@kernel/back/platform/security/piiCrypto';
import { offerFromRow } from '../domain/voucherPricing.js';
import type { VoucherRow } from '../domain/voucherTypes.js';

const VOUCHER_SELECT = `
  v.*,
  coalesce(
    array(
      select vau.user_id from voucher_allowed_users vau
       where vau.voucher_code = v.code
       order by vau.user_id
    ),
    '{}'::uuid[]
  ) as allowed_user_ids`;

export async function listVouchers(pool: pg.Pool) {
  const { rows } = await pool.query<VoucherRow>(`select ${VOUCHER_SELECT} from vouchers v order by v.code`);
  const { rows: quantities } = await pool.query<{
    code: string;
    redeemed_quantity: string;
    held_quantity: string;
    has_redemption: boolean;
  }>(
    `select v.code,
       (select count(*)
          from voucher_redemptions vr
          join orders o on o.id = vr.order_id
         where vr.voucher_code = v.code and o.status <> 'cancelled')::text as redeemed_quantity,
       (select count(*) from voucher_holds vh where vh.voucher_code = v.code and vh.state = 'held' and vh.expires_at > now())::text as held_quantity,
       exists (select 1 from voucher_redemptions vr where vr.voucher_code = v.code) as has_redemption
     from vouchers v`,
  );
  const quantitiesByCode = new Map(
    quantities.map((row) => [
      row.code,
      {
        redeemed: Number(row.redeemed_quantity),
        held: Number(row.held_quantity),
        hasRedemption: row.has_redemption,
      },
    ]),
  );
  const { rows: uses } = await pool.query<{
    voucher_code: string;
    user_id: string | null;
    email: string | null;
    order_number: string;
    redeemed_at: string;
  }>(
    `select vr.voucher_code, vr.user_id,
            coalesce(u.email, o.guest_email, o.customer_email) as email,
            o.order_number, vr.redeemed_at
     from voucher_redemptions vr
     join orders o on o.id = vr.order_id
     left join users u on u.id = vr.user_id
     order by vr.redeemed_at desc`,
  );
  return {
    vouchers: rows.map((row) => {
      const counts = quantitiesByCode.get(row.code) ?? { redeemed: 0, held: 0, hasRedemption: false };
      return {
        code: row.code,
        enabled: row.enabled,
        quantity: row.quantity,
        redeemedQuantity: counts.redeemed,
        heldQuantity: counts.held,
        remainingQuantity: Math.max(row.quantity - counts.redeemed - counts.held, 0),
        canDelete: !counts.hasRedemption && counts.held === 0,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        maxUsesPerUser: row.max_uses_per_user,
        minSubtotal: row.min_subtotal != null ? Number(row.min_subtotal) : null,
        allowedUserIds: row.allowed_user_ids,
        offer: offerFromRow(row),
      };
    }),
    redemptions: uses.map((use) => ({ ...use, email: decryptPii(use.email) })),
  };
}
