/**
 * Whether a courier and network combination obliges the customer to give a
 * phone number.
 *
 * A delivery rule, not a label-printing detail: checkout has to refuse the
 * order before payment, which is well before a label exists. Re-exported from
 * `shipping` so existing label callers are unaffected.
 */
import { config } from '../../../config/env.js';

/** Both Mondial Relay delivery modes use the recipient phone number: Home
 * delivery needs it for contact, while Point Relais uses it to deliver the
 * collection code. Keep this in the carrier adapter so checkout and label
 * generation apply exactly the same courier/network matching rules. */
export function requiresMondialRelayRecipientPhone(
  courierCode: string | null,
  networkCode: string | null,
): boolean {
  const mr = config.mondialRelay;
  const isPoint =
    !!mr.pointCourierCode &&
    !!mr.pointNetworkCode &&
    courierCode === mr.pointCourierCode &&
    networkCode === mr.pointNetworkCode;
  const isHome =
    !!mr.homeCourierCode &&
    !!mr.homeNetworkCode &&
    courierCode === mr.homeCourierCode &&
    (networkCode === mr.homeNetworkCode || networkCode === 'mondial-relay-home');
  return isPoint || isHome;
}
