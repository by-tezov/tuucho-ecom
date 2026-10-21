/**
 * Resolves the courier a checkout will actually ship with.
 *
 * The same four questions for every checkout: does the courier exist and is it
 * enabled, does it serve the delivery country, which of its networks is this
 * address eligible for, and does that combination require a phone number.
 *
 * Only the third differs between an account holder and a guest: a saved
 * address has its eligible networks in `address_networks`, while a one-shot
 * guest address declares them on the request. That difference is the
 * `networks` argument, and it is the only reason this was previously written
 * twice.
 */
import type pg from 'pg';
import type { PartialTrilingual } from '../../../types.js';
import { requiresMondialRelayRecipientPhone } from './recipientPhone.js';

export type CheckoutCourierFailure =
  | 'courier_not_found'
  | 'courier_country_unavailable'
  | 'courier_network_unavailable'
  | 'recipient_phone_required';

/** Where the address's eligible network codes come from. */
export type NetworkEligibility =
  { kind: 'savedAddress'; addressId: string } | { kind: 'declared'; codes: string[] };

export type ResolvedCheckoutCourier = {
  courier: { id: string; code: string; name: PartialTrilingual };
  networkCode: string;
};

export async function resolveCheckoutCourier(
  client: pg.Pool | pg.PoolClient,
  input: {
    courierCode: string;
    countryCode: string;
    phone: string | null;
    networks: NetworkEligibility;
  },
): Promise<{ ok: true; resolved: ResolvedCheckoutCourier } | { ok: false; reason: CheckoutCourierFailure }> {
  const { rows: courierRows } = await client.query<{ id: string; code: string; name: PartialTrilingual }>(
    `select id, code, name from couriers where code = $1 and enabled`,
    [input.courierCode],
  );
  const courier = courierRows[0];
  if (!courier) return { ok: false, reason: 'courier_not_found' };

  const { rows: countryMatch } = await client.query(
    `select 1 from courier_countries where courier_id = $1 and country_code = $2 and enabled`,
    [courier.id, input.countryCode],
  );
  if (countryMatch.length === 0) return { ok: false, reason: 'courier_country_unavailable' };

  // An address can belong to more than one network: compatible whenever the
  // courier's and the address's network sets share at least one code. Among
  // any overlap the lowest `delivery_networks.sort_order` wins, so the code
  // snapshotted onto the order is deterministic.
  const { rows: networkMatch } =
    input.networks.kind === 'savedAddress'
      ? await client.query<{ network_code: string }>(
          `select cn.network_code
           from courier_networks cn
           join address_networks an on an.network_code = cn.network_code and an.address_id = $2
           join delivery_networks dn on dn.code = cn.network_code
           where cn.courier_id = $1
           order by dn.sort_order
           limit 1`,
          [courier.id, input.networks.addressId],
        )
      : await client.query<{ network_code: string }>(
          `select cn.network_code
           from courier_networks cn
           join delivery_networks dn on dn.code = cn.network_code
           where cn.courier_id = $1 and cn.network_code = any($2::text[])
           order by dn.sort_order
           limit 1`,
          [courier.id, input.networks.codes],
        );

  const matched = networkMatch[0];
  if (!matched) return { ok: false, reason: 'courier_network_unavailable' };
  if (requiresMondialRelayRecipientPhone(courier.code, matched.network_code) && !input.phone?.trim()) {
    return { ok: false, reason: 'recipient_phone_required' };
  }

  return { ok: true, resolved: { courier, networkCode: matched.network_code } };
}
