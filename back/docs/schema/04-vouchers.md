# Vouchers

Added by `1738000017000_vouchers.js` (case-insensitive code index included).
Voucher definitions are imported from `pamsurin-manager/voucher/<name>.json`;
the database is authoritative for availability and redemption. `init`
generates an `ABC-123` name when omitted, but a voucher's source name/code is
otherwise any non-empty string; it is unique and matched case-insensitively.
A checkout that passes preview creates a short-lived `voucher_holds` row
alongside its stock reservation; only successful payment, or an explicitly
confirmed zero-total checkout, consumes that hold and records a redemption.
The complete multilingual display templates are imported separately from
`voucher/data-type.json` into `voucher_offer_type_labels`, also added by
`1738000017000_vouchers.js`.

| Table | Essential fields | Notes |
| --- | --- | --- |
| `vouchers` | `code`, `enabled`, `quantity`, `max_uses_per_user`, `min_subtotal`, `starts_at`, `ends_at`, `offer_type`, `percent`, `amount`, `required_item_quantity`, `max_item_price` | `offer_type` is `percent`, `amount`, `free_shipping`, `free_item`, or `free_item_nth`. Both free-item types apply to paid nail sets only (accessories never count). `free_item` makes one nail set free: the highest-priced paid nail unit whose `unit_price` is at most `max_item_price`. `free_item_nth` gives the lowest-priced extra nail set free for every `required_item_quantity` paid nail sets. `max_uses_per_user` defaults to `1`; `0` means unlimited per customer (global `quantity` still applies). `min_subtotal` is optional and allowed only for `amount` and `free_shipping`: the merchandise subtotal after cart-rule item discounts and before shipping/voucher must reach this floor. `starts_at` / `ends_at` are inclusive calendar dates compared with today's date in Europe/Paris (not UTC). The allow-list moved out of this table into `voucher_allowed_users` — see below. |
| `voucher_allowed_users` | `voucher_code`, `user_id`, `created_at` | Added by `1787380000003_voucher_allowed_users.js`, replacing `vouchers.allowed_user_ids uuid[]`. No rows for a voucher means it is public; any rows make it an allow-list enforced at preview and checkout. The array had no foreign key (a deleted account left its id behind forever), no index, and was diffed with `JSON.stringify` during import so a reordering counted as a change; this follows `product_user_library_users`, which already solves the same "per-user access list" problem. Both foreign keys cascade. Reads rebuild the aggregated `uuid[]` shape the service already expected, so only the queries changed, not `VoucherRow`. |
| `voucher_offer_type_labels` | `offer_type`, `template` (`jsonb`) | Imported `data-type.json` template for every supported language. Values use placeholders such as `{percent}`, `{amount}`, `{requiredItemQuantity}`, `{freeItemQuantity}`, and `{maxItemPrice}` and are localized only for checkout preview UI; price authority remains the voucher definition. |
| `voucher_holds` | `voucher_code`, `user_id` (nullable), `reservation_id` (nullable), `guest_email_lookup` (nullable), `state`, `expires_at`, `order_id` | State is `held`, `consumed` or `released`. Guests use `reservation_id` and `guest_email_lookup` (HMAC of checkout e-mail); authenticated checkouts keep both `user_id` and the exact reservation identity. The check requires at least one of `user_id` or `reservation_id`. This preserves per-account allow-list/availability rules while exact reservation release prevents one checkout from releasing another. Partial unique indexes prevent two active holds of the same code per user, per reservation, and per guest e-mail lookup. Active holds count against finite quantity and, when `max_uses_per_user > 0`, against the per-customer cap. |
| `voucher_redemptions` | `voucher_code`, `user_id` (nullable), `order_id`, `item_discount`, `shipping_discount`, `redeemed_at` | Immutable order audit trail. `user_id` is null for guest checkouts. A redeemed voucher cannot be deleted, only disabled, preserving traceability. Redemptions attached to cancelled orders remain in the audit trail but do not consume voucher quantity, so the coupon becomes available again. |
