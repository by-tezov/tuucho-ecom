# Loyalty API

Split out of the account API so a change to one subject does not carry the
others. The conventions in [00-conventions.md](./00-conventions.md) apply to
every route here.

Related: [Account API](./03-account.md) · [Addresses and favorites API](./10-addresses.md) · [Delivery options API](./11-delivery.md) · [Payment methods API](./12-payment-methods.md) · [Cart API](./13-cart.md) · [Account checkout and orders API](./14-account-checkout.md) · [Loyalty API](./15-loyalty.md).

### `GET /account/loyalty/wallet`

Auth required. Customer wallet summary. The programme is always on:
`enabled` and `earningEnabled` are always true, and earn, grant, and expiry
reminders always run. Includes `burnNoticeAmount` / `burnNoticeExpiresAt`
when credit is inside the configured pre-expiry window (`burn_notice_weeks`
before the lot’s `expires_at`). See `docs/schema/07-loyalty.md`.

### `GET /account/loyalty/ledger`

Auth required. Paginated ledger (`page`, `pageSize` query params). Each entry
includes `orderId` / `orderNumber` when the movement is tied to an order
(earn/spend); manual and expiry rows may leave them null.

### `GET /account/loyalty/preview`

Auth required. Merchandise-only earn/spend quote for the active cart
(optional `applyLoyalty`, `voucherCode`). Shipping, address, and courier are
ignored — earn/spend use paid merchandise after cart rules, voucher item
discount, and wallet credit. A gift (or checkout) hold already covering that
cart is treated as available, same as checkout pricing, so Julie’s confirm
does not drop Marc’s nail lines from `loyaltyEarn`. Response `{ "success": true, "preview": { … } }` with `enabled`,
`earningEnabled`, `loyaltyCredit`, `loyaltyEarn`, `incompatibleWithVoucher`,
`total` (merchandise after those discounts), wallet `availableBalance`, and
`atRisk` / `atRiskExpiresAt` when burn-notice applies.
