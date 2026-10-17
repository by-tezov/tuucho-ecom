/** Both vocabularies appear in order-revision payloads, so the API contract
 * owns them and the front is typed against the same declaration. */
export type { OrderRevisionKind } from '../../../contract/orders.js';

export type OrderRevisionRequestedBy = 'customer' | 'ops';
