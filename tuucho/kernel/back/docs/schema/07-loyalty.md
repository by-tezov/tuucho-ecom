# Loyalty wallet

Euro-wallet tables and columns live in the squashed init. Failsafe
uniqueness, hold sweeper index, `earn_reversal`, and return-case earn
retention are part of that schema. The programme is always on: customers
always earn, grants heal, and expiry reminders send. There is no Boutique
switch.

Euro wallet: lots expire on the next calendar cut-off (Europe/Paris) after
`granted_at + lot_duration_months`. Cut-offs are every N months from **1 March**
(N must divide 12): e.g. 6 → 1 March & 1 September; 12 → 1 March only. So a
6-month lot lives at least 6 months and under 12 months. Expiry materialization
burns remaining amounts into history. Expired checkout holds are released in
the same transactional sweep before lot expiry so abandoned reservations cannot
freeze credit past `STOCK_RESERVATION_TTL`.

Programme numbers come from tuucho-commerce-loyalty plugin settings
(`valuePer100`, `lotDurationMonths` in `1|2|3|4|6|12`, `burnNoticeWeeks`
1–520, `reminderIntervalDays` 1–90). The programme itself is not a preference.

| Table / column | Role |
| --- | --- |
| `loyalty_settings` | Leftover singleton (`id = 1`). The running API does not read it; keep the row so a code rollback still finds the old columns. |
| `products.loyalty_multiplier` | Per-product earn multiplier (default 1); manager key `loyalties` on `data-static.json` |
| `loyalty_lots` | Spendable buckets: `amount`, `remaining`, `granted_at`, `expires_at`, `status` (`active` / `depleted` / `expired`). At most one earn lot per `order_id` (`source = 'order'`). |
| `loyalty_ledger` | Append-only audit: `earn`, `spend`, `spend_refund`, `expire`, `credit_manual`, `uncredit_manual`, `earn_reversal`. Unique: one `earn` / `earn_reversal` per `order_id`, one `spend_refund` per `(order_id, lot_id)`, one `expire` per `lot_id`. `spend_refund` restores consumed lots on cancel (including need_review cancel and return-review). `earn_reversal` reverses only the **unused** remainder of that order’s earn lot when a return is resolved. Hard-delete of the account removes that user's ledger rows (`user_id` is NOT NULL with an ON DELETE CASCADE FK since `1791300000000_index_and_fk_tuning.js`; it was SET NULL, which forced the app to delete them first). |
| `loyalty_holds` + `loyalty_hold_allocations` | Pin lot `remaining` during checkout reservation (FIFO by `expires_at`). Held rows past `expires_at` are released by the loyalty cron / wallet heal before lot expiry. |
| `order_return_cases.loyalty_earn_retained_cents` | Earn from the returned order already spent elsewhere; deducted from the Stripe refund (`max(0, refund − retained)`). Never drains other wallet lots. |
| `carts.apply_loyalty` | Checkout selection (default **false**); omitted HTTP flag means false |
| `orders.loyalty_credit` | Frozen credit applied at confirm |
| `orders.loyalty_earn` | Frozen earn preview at confirm |
| `orders.loyalty_earn_status` | `pending` → `granted` on admin verify of `received`, or `void` if cancelled pre-grant. Legacy guest confirms may still store amount with `void` until claim+verify grants the lot. After return-review, unused granted earn is reversed via `earn_reversal` (status stays `granted`; heal must not re-grant). |
| `orders.loyalty_granted_at` | When the lot was created from order earn |

Earn base: paid merchandise after cart rules and voucher, after loyalty credit
allocated across paid lines, × line `loyalty_multiplier`, × `LOYALTY_VALUE_PER_100 / 100`.
Shipping and gift lines do not earn.

Grant: `POST /admin/orders/:id/verify` when `status = received` and `user_id` is set credits the wallet immediately for `loyalty_earn_status` in `pending` or legacy `void` with `loyalty_earn > 0` and no `loyalty_granted_at`. If verify happens before claim (`user_id` still null), grant waits until the guest order is linked to an account (`POST /account/guest-orders/:id/claim`, manage-order login attach, or matching-email login attach) — then every received+verified due earn for that account is granted in the same transaction. Opening `GET /account/loyalty/wallet` also heals any remaining due grants that have not been reversed.

Return / refund policy: cagnotte spent **as payment** on the order may be
restored (`spend_refund`, subject to calendar expiry). Earn from that order is
lost: unused lot remainder → `earn_reversal`; already-spent earn → retained on
the cash reimbursement. A return is never blocked because the wallet cannot
cover spent earn.

Pricing order in `priceCheckout`: rules → voucher → loyalty credit → total.
