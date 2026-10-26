# Administration

`/admin/*` is the browser-facing administration API. Every endpoint requires
an authenticated bearer token for a live staff account (any role other than
`user`); impersonation tokens are refused (`403 forbidden`). It is
intentionally separate from `/operation/*`, which is not
on the public API at all: imports and infrastructure CLIs reach a
loopback-only ops server through an SSH port forward (see
[Operations](./07-operation.md)). That surface must never be exposed to a
browser session.

## Access: roles and permissions

Each administration section is gated by one **permission** code. An account
holds any number of staff roles (`user_roles`; none = customer). A role holds
its own **grants** and inherits every grant of its **parent** roles,
transitively (`role_parents`). Each grant is **on** or **off**, and
**dominant** or not (default: not dominant; no grant = off, not dominant).

The account's permissions are resolved over all its roles and all their
ancestors, per permission:

1. any **dominant off** → no access (it wins over everything, a dominant on
   included);
2. otherwise any **on** (dominant or not) → access (an on wins over a
   non-dominant off);
3. otherwise → no access.

Holding `super-admin` ("Super-administrateur", the highest role) grants
every permission regardless of other roles, and is the only role that manages
roles and assigns them, including to other `super-admin` accounts (never to
itself). Before the staff-roles squash its code was `admin`. Grants
are read from the database on every request, so a change applies to the
next call without signing out. A request to a section the account does not
hold returns `403 forbidden`.

| Permission             | Endpoints                                                                                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stats`                | `GET /admin/stats`                                                                                                                                                                                                                                        |
| `orders`               | `/admin/orders*` (queue, detail, status, verify, need-review, return review, sticker, tracking, attention counts)                                                                                                                                         |
| `product_requests`     | `/admin/product-requests*`                                                                                                                                                                                                                                |
| `messages`             | `/admin/chats*`, `/admin/unconnected-contacts*`                                                                                                                                                                                                           |
| `users`                | `/admin/users` and `/admin/users/:id/*` except role assignment                                                                                                                                                                                            |
| `impersonate`          | `POST /admin/impersonate`                                                                                                                                                                                                                                 |
| `reviews`              | `/admin/vinted-reviews*`                                                                                                                                                                                                                                  |
| `library_stock`        | `/admin/library-stock*`                                                                                                                                                                                                                                   |
| `accessory_stock`      | `/admin/accessory-stock*`                                                                                                                                                                                                                                 |
| `catalogue_edit`       | `/admin/catalogue/*` together with the stock permission of that catalogue, and `/admin/catalogue-vocabulary*` on its own                                                                                                                                  |
| `courier_edit`         | `/admin/courier-catalog*` (JSON texts, times, prices, parcels; enable flags stay on `preferences`)                                                                                                                                                        |
| `cart_rules`           | `/admin/cart-rules*`                                                                                                                                                                                                                                      |
| `vouchers`             | `/admin/vouchers*`                                                                                                                                                                                                                                        |
| `loyalty`              | `/admin/loyalty/*`                                                                                                                                                                                                                                        |
| `gift`                 | `/admin/gift/*`                                                                                                                                                                                                                                           |
| `preferences`          | `/admin/preferences`, `/admin/shipping-catalog`, `/admin/couriers/:code`, `/admin/couriers/:code/countries/:countryCode`, `/admin/address-countries*`, `/admin/plugins*`, `/admin/store` (ordinary Configure save). File import/export are not this code. |
| `plugin_config_import` | `POST /admin/plugins/:id/config-files/apply`, `POST /admin/plugins/:id/config-files/import`, `POST /admin/plugins/config-files/apply-all`, `POST /admin/plugins/config-files/import-all` (also requires `preferences` to reach `/admin/plugins`)          |
| `plugin_config_export` | `GET /admin/plugins/:id/config-files/export`, `GET /admin/plugins/config-files/export-all` (also requires `preferences` to reach `/admin/plugins`)                                                                                                        |
| `activity`             | `/admin/activity*`                                                                                                                                                                                                                                        |
| `cron_logs`            | `/admin/cron-logs*`                                                                                                                                                                                                                                       |
| `api_log`              | `/admin/api-log*`, `/admin/email-log*`                                                                                                                                                                                                                    |

Two reads are shared with the Users section's account card:
`GET /admin/orders/:id` accepts `orders` **or** `users`, and
`GET /admin/loyalty/users/:userId/wallet` and `…/ledger` accept `loyalty` **or**
`users`.

Role management (`/admin/roles*`: create, edit, delete) is **super-admin
only** and is not a grantable permission: a staff role could otherwise grant
itself more.

Role assignment (`PUT /admin/users/:id/roles`) is open to a super-admin
(any role, `super-admin` included) and to a staff account whose resolved
**assignable** and **targetable** lists (below) both hold at least one role:
the lists are the right itself, there is no separate permission. Each role
carries a list
of roles its holders may assign (`assignable`) and whether that list is
dominant (`assignableDominant`). Over the account's roles and all their
ancestors, the lists are merged: the union of every list, narrowed to each
dominant list. With lists `{a,b}` and `{b,c}`: both non-dominant give a, b, c;
`{a,b}` dominant gives a, b; both dominant give b; an empty dominant list
gives nothing. `super-admin` and `user` are never assignable entries.

Each role also carries a list of **targetable** roles (`targetable`, with
`targetableDominant`), merged the same way: the accounts its holders may
edit. An account is editable only when every role it holds is in the
caller's resolved targetable list; an account holding no staff role needs
`user` listed. `super-admin` is never targetable, so a manager allowed to
assign preparator cannot edit an account holding a role above it unless that
role is listed.

### `GET /admin/access`

Any staff account. Returns its own roles and resolved permissions; the front
builds its navigation from it. `manageRoles` is true when it holds `super-admin`.

```json
{
  "success": true,
  "access": {
    "roles": [{ "code": "manager", "label": "Manager" }],
    "manageRoles": false,
    "assignableRoles": [{ "code": "preparator", "label": "Préparateur" }],
    "targetableRoles": { "all": false, "roles": ["user", "preparator"] },
    "permissions": ["orders", "library_stock", "accessory_stock", "user_library_stock", "catalogue_edit"]
  }
}
```

### `GET /admin/roles`

Administrator only. Every role (system roles first) and the permission
catalogue in display order:

```json
{
  "success": true,
  "roles": [
    {
      "code": "manager",
      "label": "Manager",
      "system": false,
      "grants": [{ "permission": "library_stock", "granted": true, "dominant": false }],
      "parents": ["preparator"],
      "permissions": ["orders", "library_stock"],
      "assignable": ["preparator"],
      "assignableDominant": false,
      "assignableResolved": ["preparator"],
      "targetable": ["user", "preparator"],
      "targetableDominant": false,
      "targetableResolved": ["user", "preparator"],
      "userCount": 1,
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "permissions": ["stats", "orders", "…"]
}
```

`grants` is the role's own stored grants (only those on, or dominant).
`permissions` is the resolved result of its own grants plus every
ancestor's: every code for `super-admin`, none for `user`. `userCount` is how many
accounts hold the role (for `user`: accounts holding no staff role).

### `GET /admin/roles/config-files`

Administrator only. Compares `tuucho-config/config.role.json` merged with
`tuucho-config/config.role.<APP_TARGET>.json` (an env entry replaces the role
with the same code) to the staff roles in the database. Built-in `user` and
`super-admin` are not in the file. Names are not in the file: the admin shows
the language-file name, and English is the default.

```json
{ "success": true, "present": true, "differ": false }
```

`user` and `super-admin` stay system roles. Apply skips them.

### `POST /admin/roles/config-files/apply`

Administrator only. Upserts every non-system role from those files. Does not
delete a role that is absent from the file. `404 no_files` when neither file
exists. `400 unknown_permission`, `400 invalid_parent`, `400 invalid_assignable`,
`400 invalid_targetable`, `400 role_cycle`.

### `POST /admin/roles/config-files/import`

Administrator only. Body `{ "name": "config.role.json", "text": "{...}" }`.
`name` ending in `config.role.<environment>.json` writes that overlay. Any
other name writes `config.role.json`. Then applies, same result as apply.

### `GET /admin/roles/config-files/export`

Administrator only. Writes the current staff roles to `config.role.json`
(no built-in roles, no names) and downloads that file.

### `POST /admin/roles`

Administrator only. Body:

```json
{
  "label": "Service client",
  "grants": [{ "permission": "messages", "granted": true, "dominant": false }],
  "parents": ["preparator"],
  "assignable": ["preparator"],
  "assignableDominant": false,
  "targetable": ["user", "preparator"],
  "targetableDominant": false
}
```

`label` is trimmed and single-spaced, 2 to 60 characters; the `code` is
derived from it (lower-case ASCII, words joined by `_`, e.g.
`service_client`) and never changes afterwards. `grants` (default none) lists
at most one entry per catalogue permission; `dominant` defaults to `false`,
and an entry off and not dominant is dropped (same as no grant). `parents`
(default none) are existing staff roles, never `user` or `super-admin`.
`assignable` (default none) and `assignableDominant` travel together (one
without the other is `400 invalid_request`); entries are existing staff
roles, never `user` or `super-admin` (`400 invalid_assignable`). `targetable`
and `targetableDominant` follow the same rule; entries are existing roles,
`user` included, never `super-admin` (`400 invalid_targetable`). Returns
`201` with `role`. Errors: `400 invalid_request` (bad body, unknown or
repeated permission), `400 invalid_label` (no usable code can be derived),
`400 invalid_parent` (unknown parent, or `user`/`super-admin`), `409 role_exists`
(code already taken). Journaled as `roles.create` (category `settings`).

### `PATCH /admin/roles/:code`

Super-admin only. Body with any of `label`, `grants` (the full new grant
set), `parents` (the full new parent list), `assignable` with
`assignableDominant` (the full new list and its dominance), `targetable` with
`targetableDominant`. Returns `role`. Errors: `400 invalid_request`,
`400 invalid_parent`, `400 invalid_assignable`, `400 invalid_targetable`,
`404 not_found`,
`409 system_role` (`user` and `super-admin` are never edited), `409 role_cycle`
(the role would become its own ancestor). Journaled as `roles.update` with
the label, grant and parent difference; a write that changes nothing is not
journaled. Inheritance edits are serialized so two concurrent edits cannot
together form a loop.

### `DELETE /admin/roles/:code`

Super-admin only. Deletes a staff role, never blocked by its use: in one
transaction it is removed from every account holding it (their `role`
summary recomputed from the roles they keep; an account left with none
becomes a customer), removed from the parents of every role inheriting from
it (they keep their other parents and own grants), then deleted with its
grants and parent links. Returns
`{"success":true,"removedFromAccounts":2,"removedFromRoles":["manager"]}`.
Errors: `404 not_found`, `409 system_role`. Journaled as `roles.delete`
with the affected account ids (`targets`) and role codes.

### `PUT /admin/users/:id/roles`

Super-admin, or a staff account with non-empty resolved assignable and
targetable lists (see Access above).
Body `{"roles":["manager","preparator"]}`: the account's full new set of
staff roles; `[]` makes it a customer. `user` is not a valid entry. A
super-admin may set any roles, `super-admin` included. A delegated caller
may only add or remove roles from its resolved assignable list (the
account's other roles must be sent back unchanged), and never on an account
holding `super-admin`. Returns
`{"success":true,"user":{"id","role","roles":[{"code","label"}]}}` where
`role` is the `users.role` summary (`super-admin` when held, else the first staff
role, else `user`). Errors: `400 invalid_request` (malformed list or unknown
role), `403 forbidden` (no assignable role), `403 account_not_targetable`
(the account holds a role outside the caller's targetable list, or holds
none and `user` is not listed), `403 role_not_assignable` (a
role added or removed is outside the caller's list), `403 protected_account`
(the account holds `super-admin`, or `super-admin` was requested),
`404 not_found` (unknown or deleted account), `409 own_role` (nobody changes
their own roles, so the acting super-admin always remains one). The check
and the write happen in one transaction on the account's current roles.
Journaled as `accounts.set_roles` with the roles before and after; an
unchanged set is not journaled.

### `GET /admin/role-accounts?q=`

Account search of the Roles page ("Rôles des comptes"). Any staff account,
but a caller without a delegation (not a super-admin, and an empty resolved
assignable or targetable list) gets `403 forbidden`. `q` is an exact e-mail (HMAC
lookup over every account) or a `*` glob (`pam*`, `*@gmail.com`) matched
over the 2000 most recent accounts in memory, the e-mail being encrypted at
rest. Only accounts whose roles the caller may change come back: every
account for a super-admin; otherwise those in its resolved targetable list
(see Access above), never a super-admin, never a deleted account. Returns
`{"success":true,"accounts":[{"id","email","firstName","lastName","role","roles":[{"code","label"}]}],"total":3}`
with at most 15 accounts and `total` the number of matches. Changing roles
then goes through `PUT /admin/users/:id/roles`.

### `GET /admin/users` and customer activity

`GET /admin/users?page=&limit=&role=&q=` returns the paginated account cards for
the administration dashboard. `limit` is `15` (default), `30`, or `100`; the
pagination envelope is the same as the order queue. It returns customer
accounts by default; `role=staff` returns every other account (super-admins
and staff roles) for the dashboard's staff switch, and `role=all` returns
every account (the Roles page's account search). `role=admin` is the former
name of `staff` and behaves the same. Each card carries `roles` (every
staff role held, `{code,label}`) and `role` (their summary). Super-admin cards remain read-only for account security
actions.

`q` searches e-mail addresses for the current role. An e-mail without `*` is an
exact search; use `*` as a glob when a partial address is needed, for example
`pam*` or `*@gmail.com`. Exact and glob matches consider the **current main**
email, **currently linked** Google/Facebook/Apple profile emails, and every
**historical** address recorded in `user_identity_events` (former main or
provider emails). Pending (unconfirmed) email changes are not searched. The
wildcard form is intentionally restricted to this admin-only endpoint because
encrypted e-mail values cannot be partially searched in PostgreSQL.

Each row contains the customer identity/status and login metadata plus current
sign-in methods (`hasPassword`, `hasGoogle`/`googleEmail`,
`hasFacebook`/`facebookEmail`, `hasApple`/`appleEmail`) and:

```json
{
  "orders": {
    "inFlight": { "count": 2, "total": 68 },
    "received": { "count": 4, "total": 142 },
    "cancelled": { "count": 1, "total": 35 }
  },
  "activityCounts": { "contacts": 1, "chats": 2, "productRequests": 1, "identityHistory": 3 }
}
```

Every amount is `orders.total` (the placed amount, including delivery and
discounts). `inFlight` includes `confirmed`, `in_preparation`, `to_send`,
`sent`, and `disponible`; `received` and `cancelled` each include both
admin-verified and still-unverified terminal orders.

`POST /admin/users/:id/lock` locks an active non-administrator account and revokes every
refresh session. Body: `{"reason":"string"}` — required, trimmed, 3–500
characters; stored as `lock_reason` with `lock_source = admin` and
`locked_by_user_id` set to the bearer administrator. `POST /admin/users/:id/unlock`
restores a locked customer to `active` and clears lock metadata.
Both return:

```json
{
  "success": true,
  "user": {
    "id": "…",
    "status": "locked",
    "lockedAt": "2026-09-01T12:00:00.000Z",
    "lockReason": "…",
    "lockSource": "admin"
  }
}
```

(`unlock` returns `status: "active"` and null lock fields.)

Each list/detail card also exposes `lockedAt`, `lockReason`, and
`lockSource` when `status = "locked"`.
Only non-administrator accounts in the matching state are eligible (a staff
member cannot lock their own account: `403 forbidden`). Locking and
unlocking follow the role-assignment hierarchy: a customer (no staff role)
is open to anyone with `users`; a staff account only to a super-admin or to
a caller whose resolved targetable list holds every role of that account
(see Access above), otherwise `403 forbidden`. Attempting to
repeat an action returns `409 already_locked` / `not_locked`; a missing or
invalid lock reason returns `400 invalid_request`; a pending-
deletion account returns `409 invalid_user_status`; a super-admin or an
unknown id is `404`. One exception: a locked super-admin (locked from the
lock link of the super-admin sign-in alert, see
[Auth](./02-auth.md#super-admin-sign-in-alert), or by the CLI) can be
unlocked by another super-admin through `POST /admin/users/:id/unlock`; for
any other caller it stays `404`. A super-admin is never locked from this
page. Role changes use `PUT /admin/users/:id/roles` above.

The card detail modals use these all-status, paginated lists (the same
`page`/`limit` rules):

- `GET /admin/users/:id/orders` returns `id`, `orderNumber`, `confirmedAt`,
  `status`, `total`, and `adminVerified`; opening a row then uses the existing
  `GET /admin/orders/:id` full snapshot.
- `GET /admin/users/:id/chats` returns the usual admin chat summaries, but
  only rows directly owned by `chat_sessions.user_id`.
- `GET /admin/users/:id/product-requests` returns the usual product-request
  summaries, but only rows directly owned by `product_requests.user_id`.
- `GET /admin/users/:id/contacts` returns anonymous contact-form summaries
  whose normalized email has an exact HMAC match with the account's _current_
  email. Anonymous contacts have no account FK, so this is intentionally
  labelled an email match in the UI; a changed account email does not claim
  older threads.
- `GET /admin/users/:id/identity-history` returns append-only identity events
  (`kind`, `createdAt`, `email`, `previousEmail`, `providerSubject`,
  `backfilled`), newest first. Kinds: `account_created`, `email_changed`, `google_linked` /
  `google_unlinked`, `facebook_linked` / `facebook_unlinked`, `apple_linked` /
  `apple_unlinked`. Seed rows from migrate have `backfilled: true`. Available
  for every role.

### `GET /admin/orders?status=&page=&limit=&verified=` and `GET /admin/orders/:id`

`status` is required and must be one of the order statuses, including the
internal `need_review` and `return_review` exception statuses. Returns
one page in that status. `limit` is `15` (default), `30`, or `100`:
`{"success":true,"orders":[…],"pagination":{"page":1,"pageSize":15,"total":42,"totalPages":3}}`.
Each list row has the order number, customer/guest email, `placedAsGuest`
(true when checkout was guest — stays true after claim), user-item count,
total, and `adminVerified` (true when `admin_verified_at` is set). `page`
defaults to `1`. Optional `verified=true|false` is only valid for
`received` and `cancelled` (`400 invalid_request` otherwise) and filters on
whether an administrator has acknowledged the terminal order.
`GET /admin/orders/:id` returns the full fulfillment detail only when an
administrator opens that order, including the delivery snapshot, item rows,
the current formatted `integrityToken` (or `null` for legacy orders), and
`sentAt` (the physical handoff time, `null` until sent or where a historical
value cannot be recovered), `statusUpdatedAt` (last status transition — used
while `disponible` to show days spent at the pickup point),
`adminVerified`, and `adminVerifiedAt`. Detail also includes `placedAsGuest`
(same meaning as the list field). Item rows carry `comment` (the customer
note typed on the cart card, `null` when none). Item rows preserve `origin`;
`origin:"rule"` is a gift line, so the administration list counts only
`origin:"user"` items. Nail lines expose localized `shapeLabel` and
`lengthLabel` (with `shapeKey` / `lengthKey` / `size`) in that order for the
admin detail chips. No unfiltered list endpoint exists, allowing the
dashboard to remain empty until an administrator explicitly chooses a status.

For `status = "need_review"`, the detail also contains `statusReason`,
`needReviewBlocked`, `stripePaymentIntentId`, and the resolution audit fields
(`needReviewResolvedAt`, `needReviewResolvedBy`, `needReviewResolution`,
`stripeResolution`). This is a financial exception, not a fulfillment status.
The customer can still see the order, but customer payloads do not contain
`statusReason` and the customer UI intentionally renders no status badge.

For an order that has a return case, detail also contains `returnReview`:
the previous status, detected return type/source/evidence, resolution state,
financial decision/audit, final-email status, `stockLedgerComplete`, and the
per-variant stock rows. Exact-ledger rows include shipped/restocked/remaining
physical units; historical rows have a null maximum and require an explicit
manual quantity.

### `POST /admin/orders/:id/need-review-resolution`

Resolves one `need_review` order after an administrator explicitly confirms
the decision. Body:

```json
{ "decision": "continue" | "cancel", "confirmed": true }
```

`continue` reads Stripe and proceeds only while the PaymentIntent is still
authorized (`requires_capture`) or captured (`succeeded`), has no refund, and
the order is not marked `needReviewBlocked`. It never captures funds.
`cancel` is the human-triggered financial action: it cancels a cancellable
PaymentIntent authorization, or creates the remaining full refund for a
captured PaymentIntent. Only after Stripe succeeds does the database move to
`confirmed` or `cancelled`, restore stock/consumed loyalty when cancelling,
and record the administrator plus `stripeResolution`. Stable idempotency keys
make a repeated request safe. There is no background worker or retry cron.

Response adds `changed` and `stripeResolution` (`decision`, `action`,
`paymentIntentId`, `paymentIntentStatus`, optional refund id/status). Missing
order → `404`; invalid body → `400`; incompatible local/Stripe state,
blocked continue, or a pending refund → `409`; Stripe unavailable → `503`;
Stripe action failed → `502`.

### Returned-parcel review endpoints

`return_review` is opened by shipment tracking for a high-confidence
unclaimed/refused/return-to-sender event. Detection never refunds, cancels,
restocks, or sends the final email.

- `GET /admin/orders/:id/return-review/financial-preview` reads the current
  PaymentIntent/refunds and returns `totalPaidCents`,
  `alreadyRefundedCents`, `remainingRefundableCents`,
  `courierDefaultCents` (the order's recorded list delivery price), and
  `refundPending`.
- `POST /admin/orders/:id/return-review/resolve` is the only resolver. Body:

```json
{
  "refundMode": "full | courier_deduction | custom | none",
  "courierRetainedCents": 500,
  "customRefundAmountCents": 1200,
  "decisionReason": "required internal reason",
  "courierOverrideReason": "required when the editable courier amount differs from its default",
  "stock": [{ "productUid": "...", "shapeKey": "...", "lengthKey": "...", "size": "M", "quantity": 1 }],
  "confirmed": true
}
```

`customRefundAmountCents` is present only for `custom`. `full` refunds the
remaining refundable Stripe amount; `courier_deduction` subtracts the
selected courier amount; `none` refunds zero. When the order already granted
loyalty earn, any portion of that earn already spent on later orders is
**retained on the cash reimbursement** (`loyaltyEarnRetainedCents` on the
return case): after courier deduction the Stripe refund is
`max(0, amount − retained)`. Unused earn on that order’s lot is reversed
(`earn_reversal`); other wallet lots are never drained, and the return is
never refused for insufficient balance. Cagnotte spent **as payment** on the
returned order is still restored via `spend_refund`. The server accepts cents
only, re-reads Stripe, caps the refund to the remaining balance (after earn
retention), validates every stock key/quantity, and serializes concurrent
administrators. Captured payments use an idempotent partial/full refund; an
uncaptured authorization is cancelled. A pending refund leaves the case in
`refund_pending`; retrying the identical request resumes the same Stripe
idempotency attempt. Only a successful financial outcome atomically cancels
the order, restores the selected physical quantities, refunds consumed
loyalty spend, voids pending earn, reverses unused granted earn, records the
actor, and sends the localized final email. Email failure does not roll back
the financial/database result.

- `POST /admin/orders/:id/return-review/dismiss` body
  `{ "reason":"...", "confirmed":true }` dismisses a false carrier signal
  and restores the recorded previous status without money or stock changes.
  The identical stored carrier evidence is suppressed after dismissal; a
  distinct later return event can open a new review.
- `POST /admin/orders/:id/return-review/retry-email` retries only the final
  email of an already resolved case; it never repeats payment or stock work.

Resolve errors: missing → `404`; malformed body → `400`; stale/conflicting
case, pending refund, excessive refund, or invalid stock → `409`; Stripe not
configured → `503`; Stripe action failure → `502`.

### `GET /admin/orders/attention-counts`

Returns the counts shown as badges on the administration Orders tile:
`{"success":true,"counts":{"confirmed":N,"disponible":N,"needReview":N,"returnReview":N,"receivedUnverified":N,"cancelledUnverified":N}}`.
`receivedUnverified` / `cancelledUnverified` exclude rows with
`admin_verified_at` set.

### `GET /admin/stats`

Dashboard aggregates for the administration Numbers tile:

- `library`: public nail source stock — `quantity`, `stockValue`,
  `averageUnitPrice` (`stockValue / quantity`, or `null`), `minUnitPrice` /
  `maxUnitPrice` (cheapest / dearest unit price among in-stock priced
  variants, or `null`), and `bySize` (`XS`/`S`/`M`/`L` each with `quantity`
  and `stockValue`).
- `accessories`: accessory source pool — `quantity`, `stockValue`,
  `averageUnitPrice`.
- `orders`: counts for `confirmed` / `sent` / `received` / `cancelled`; the
  `need_review` and `return_review` exceptions are excluded from fulfillment counts and sales totals
  until an administrator resolves it.
  `confirmed` includes the pre-dispatch statuses `confirmed`, `in_preparation`,
  and `to_send`; `sent` includes Point Relais parcels marked `disponible`,
  awaiting collection. The payload also includes
  sales excluding cancelled rows: `merchandiseSold` (`sum(total - shipping_fee)`),
  `shippingPaid` (`sum(shipping_fee)`), and `totalSold` (`sum(total)`).

### `POST /admin/orders/:id/verify`

One-way acknowledgement for a terminal order (`received` or `cancelled`).
Sets `admin_verified_at = now()` and returns the updated admin order payload.
When `status = received`, loyalty earn is granted to the linked account
immediately if `user_id` is set; otherwise grant waits until a guest order is
claimed to an account. Already verified → `409 already_verified` (still retries
any missed loyalty grant when `user_id` is now set). Wrong status → `409 invalid_status`.
Missing order → `404`. There is no undo.

### Catalogue product JSON (`/admin/catalogue/:catalogue…`)

Full create / replace / delete for one product through a manager-shaped JSON
document (title, description, every locale, stock, pictures, …). Stock/price
patch endpoints below stay for quick edits. `:catalogue` is `library`,
`user-library`, `nail`, or `accessory`. Each call needs both `catalogue_edit`
and the permission of that catalogue (`library_stock`, `user_library_stock`,
or `accessory_stock`). Unit-offer catalogues use `library_stock`. A uid that belongs to another
catalogue returns `404`.

The document uses catalog source key names (`product-uid`, `$almond`,
`color-main`, `is-variation`, …). Saving updates the shop database only; it
does not write manager files. Validation failures return `400` with
`{ code: 'invalid_request', message }` for the editor to show under the field.

#### `GET /admin/catalogue/:catalogue/template`

Empty pretty document for that catalogue (`product-uid` blank, locale shells
included). Response `{"success":true,"document":{…}}`.

#### `GET /admin/catalogue/:catalogue/:productUid`

Loads the product as `{ success, document, photos }`. `photos` is a strip of
`{ photo, shapeKey, lengthKey, variationKey, hash, small, modal }` for the UI;
those URLs are not part of the editable JSON. Picture stems in a loaded
document are `"1"`, `"2"`, … in position order with each stored modal hash.

#### `POST /admin/catalogue/:catalogue`

Create. `multipart/form-data`: text field `document` (JSON string) and optional
file field `photos` (JPEG/PNG/WebP, up to 40 files, 25MB each). Filename stem
must match a `photo` value in the document (e.g. `z.kit.webp` → `"photo":"z.kit"`).
A missing or blank `product-uid` is filled with a new `LL-LL-DDD` code, the
same alphabet as catalog source (`ACEGHJKLMQRSTUWXYZ` and digits `23456789`).
That generator is a subset of the stored rule: A-Z, 0-9, and single dashes,
1 to 20 characters (for example `AQ-YZ-367` or `AA-BB-123-TEST`). The value
is stored uppercase. The code is refused when `products.product_uid` already
has it, and another one is drawn. A non-empty uid outside that rule stays a `400`.
New files are stored as WebP: modal longest side 1600, small 400 cover.
The picture hash is the SHA-256 of the modal file. Adding or replacing a
picture (a file whose stem matches that `photo`) writes a new hash, a new
modal, and a new small. A picture kept by its existing hash is not re-encoded.
Existing hashed pictures without an upload are kept; a `photo` with neither a
matching hash nor a file is refused. Response
`{"success":true,"productUid","created":true,"changes":[…]}`. Duplicate uid →
`400`.

#### `PUT /admin/catalogue/:catalogue/:productUid`

Replace. Same multipart body as create. `document.product-uid` must match the
URL. Metadata goes through the same import path as operations `seed --update`
(`update: true`) without wiping pictures first; pictures are then reconciled
from the document. Response
`{"success":true,"productUid","created":false,"changes":[…]}`.

#### `DELETE /admin/catalogue/:catalogue/:productUid`

Deletes the product row and its catalogue links. Confirmed order snapshots keep
their copy (`product_id` set to null). Open cart lines on the product go away
with it. Photo files on disk are left behind. Response
`{"success":true,"deleted":true}`. Missing → `404`.

### Catalogue vocabulary (`/admin/catalogue-vocabulary`)

Edits shop vocabulary one entry at a time. Requires `catalogue_edit` only.
Saving updates the shop database. It does not write catalog source files.

There are two `data-common` sources.

Library (the shared `product/data-common.json` used by library, library-user
and library-nail for shape, length and colour words): one shape, one length,
or one colour.

- Shape: `{ title, gender, attributive, length: ["$medium", "$long"] }`.
  `length` is a list of references. Each key must already exist as a length.
  Saving updates that shape and which lengths it offers. A length dropped
  from the list is removed from products that sold that pair.
- Length: `{ value, title, gender }`. Saving updates the shared length and
  every shape that offers it. A length no shape offers yet can still be saved.
- Colour: the translation object itself, `{ "fr": "jaune", "en": "yellow" }`.

Nail (`product/library-nail/data-common.json`, the `variation` table): one
axis title, or one option.

- Axis: `{ title }`. Options are edited separately and are left in place
  when the title is saved.
- Option: the translation object itself. The axis must already exist.
  Deleting an axis or an option removes it from nails that offered it.

`GET /admin/catalogue-vocabulary` returns
`{ success, library: { shapes, lengths, colors }, nail: [{ key, options }] }`.

`GET /admin/catalogue-vocabulary/library/:part/:key`,
`PUT /admin/catalogue-vocabulary/library/:part/:key` and
`DELETE /admin/catalogue-vocabulary/library/:part/:key` with `:part`
`shape`, `length` or `color`. `PUT` body `{ document }`. Response
`{ success, created }`. Unknown part or key → `404`.
A shape that names a missing length → `400`. A key is lowercase letters,
digits and hyphens.

`GET /admin/catalogue-vocabulary/nail/:axis`,
`PUT /admin/catalogue-vocabulary/nail/:axis` and
`DELETE /admin/catalogue-vocabulary/nail/:axis` edit the axis title.
`GET /admin/catalogue-vocabulary/nail/:axis/:option`,
`PUT /admin/catalogue-vocabulary/nail/:axis/:option` and
`DELETE /admin/catalogue-vocabulary/nail/:axis/:option` edit one option.
An option whose axis does not exist → `404`.

A vocabulary row a product still references in a way the database will not
cascade → `409` `{ code: "conflict" }`.

### `GET /admin/library-stock`

Returns an alphabetically ordered `page` (default `1`) of public nail-library
variants — one entry per product × shape × length (not aggregated across
shapes). `limit` is `15` (default), `30`, or `100`. Each row includes
product UID, French title, creation date, current price (or `null`),
`shapeKey` / `shapeLabel` / `lengthKey` / `lengthLabel`, source XS/S/M/L
quantities for that variant, variant `total`, a catalogue `thumbnail`,
`stockValue` (price × variant total), `hidden` (the whole product),
`variantHidden` (this shape/length alone), and `featuredUntil` (last day
of the "Nouveautés" window, `YYYY-MM-DD`, or `null` when the set is not
featured or its window has elapsed). The envelope also carries `featuredDays`,
the length the featured action applies, so the dashboard can name it without a
second copy of the number. There is no global totals payload.
Optional `q` filters by product UID: without `*` it is a case-insensitive
substring; with `*` it is a whole-UID glob (`*` = any characters).
Optional `hidden=visible` drops hidden products and hidden variants, and `stock=in` drops sold-out
rows; both default to keeping everything. They are applied before paging, so a
filtered list never reports more pages than it can fill. The same two
parameters work on `/admin/accessory-stock` and `/admin/user-library-stock`.

### `PATCH /admin/library-stock/:productUid`

Admin update for one public nail-library variant:
`{"shapeKey","lengthKey","price"?, "sizes"?{"XS","S","M","L"}}`.
`shapeKey` and `lengthKey` are required and must exist on the product.
Optional `price` (≥ 0) appends a price-history row when it differs from the
current price. Optional `sizes` replaces **source** availability for that
shape×length only (other variants untouched; zero sizes delete the row).
Returns `{"success":true,"row":…}` with the updated variant. Missing product
→ `404`; bad keys/values → `400`.

### `PATCH /admin/library-stock/:productUid/hidden`

Sets visibility with `{"hidden":true|false}`: the whole product, or with
`"shapeKey"` that shape (every length of it), or with `"shapeKey"` +
`"lengthKey"` that one shape/length, the rest of the product unchanged. A
hidden product, shape or shape/length is absent from every shop surface
(gallery, product page, filters, SEO, sitemap) and a cart line on it is
unavailable; photos and stock are kept. Response
`{"success":true,"hidden":<product>,"hiddenShapeLengths":[{"shapeKey","lengthKey"}]}`.
The next `seed --update` re-applies `data-static.json` `hidden` (see
`docs/command/02-imports.md`). Missing product → `404`; bad body, a length
without its shape, or a shape/length the product does not have → `400`.

### `PATCH /admin/library-stock/:productUid/featured`

Starts or clears the "Nouveautés" window with `{"featured":true|false}`.
`true` sets `featured_from` to the database's `current_date` and `featured_for`
to `featuredDays` (15); `false` clears both. The window is product-level, like
`hidden` — every variant of the set shares it. Returns
`{"success":true,"featuredUntil":…}`, `null` once cleared. Missing product →
`404`; bad body → `400`.

Only public nail-library sets are addressable here: the private user library
has no "Nouveautés" surface.

### `GET /admin/user-library-stock`

Same list as `/admin/library-stock` for `audience = 'user-library'`. Each row
adds `owners`, the assigned account emails. `hidden=visible` and `stock=in`
apply before paging, the same way as the public list. Permission
`user_library_stock`. There is no featured window on this list.

### `PATCH /admin/user-library-stock/:productUid`

Same price and size update as the public nail stock route, plus optional
`owners`: an array of account emails (or ids) that replaces the assignment.
Unknown email → `400` `{ code: "invalid_request", message }`. An empty array
clears the assignment. Omit `owners` to leave it unchanged. Price, sizes, or
owners must be present. Missing product → `404`. Permission
`user_library_stock`.

### `PATCH /admin/user-library-stock/:productUid/hidden`

Same visibility body as the public route, limited to user-library nails.

### `GET /admin/accessory-stock`

Returns an alphabetically ordered `page` (default `1`, `limit` = `15`, `30`,
or `100`) from the same available-unit scope as `npm run accessory --
stock-report`: all accessory products. Each row includes its UID, French title,
type, creation date,
`packs` (byQuantity multipliers, else `{}`), either a scalar `unitPrice` or
explicit `packPrices` (never both), a `thumbnail`, remaining available units,
a stock value, and `hidden`. Pack-priced accessories derive that value from their
largest pack (pack price ÷ pack quantity × available units). Optional `q`
filters by product UID (`*` wildcard, same rules as library-stock). There is
no global totals payload.

### `PATCH /admin/accessory-stock/:productUid`

Admin update for one accessory: `{"available"?, "unitPrice"?, "packPrices"?}`.
At least one field is required; `unitPrice` and `packPrices` cannot be sent
together. `available` (≥ 0 integer) replaces the shared source pool
(`shape/length/size` empty). `unitPrice` (≥ 0) appends a price-history row
when it differs — only for accessories that do not use pack prices.
`packPrices` replaces `accessory_pack_prices` and must use exactly the
product's existing pack keys — only for pack-priced byQuantity accessories.
Returns `{"success":true,"row":…}`. Missing product → `404`; bad keys/values
→ `400`.

### `PATCH /admin/accessory-stock/:productUid/hidden`

Sets accessory visibility with `{"hidden":true|false}` (accessories have no
shape: `shapeKey` is `400`). Missing product → `404`; bad body → `400`.

## Plugins and store

Plugin runtime for the shop kernel. Drop-in manifests live under nested
plugin `package.json` files (`tuucho` discriminator) in `plugins/` (bundled) and `plugins/user/` (user).
The operator guide is
[docs/plugins.md](../plugins.md) and inside admin
(Documentation plugin). Requires `requireAuth` plus the `preferences`
permission.

### `GET /admin/plugins`

Installed plugins with manifest (`name`, `description`, `version`, `engines.core`, `dependsOn`),
`enabled`, `settings`, `schemaVersion` (package version after plugin
`back/migrations/` ran), `missingFromDisk` (folder gone, row still present),
`compatibility` (`ok` plus `errors[]`, including `missing_from_disk`).
Packet prices are not on this payload: they are the courier catalog
(`courier_edit`). Top-level `coreVersion` is the live root `package.json`
product version (Plugins “Core”), not `tuucho-versioning.lock.json`. Requires
`requireAuth` plus `preferences`.

### `GET /admin/docs`

Developer handbook: `coreVersion`, `groups[]`, `articles[]`. Articles are
loaded from each plugin `docs/articles.json` and `docs/handbook.json`, not
hardcoded only in docs-developer. `404 plugin_disabled` when
`tuucho-docs-developer` is off.

### `GET /admin/plugins/:id`

One installed plugin. Missing id → `404 not_found`.

### `POST /admin/plugins/upload`

Multipart field `archive` (`.zip` or `.tgz`, max 20 MB). Validates
`package.json` with a `tuucho` object (including required `installPath` and, except locale plugins,
a non-empty npm `description`) and `engines.core`, rejects
zip-slip, absolute paths, and archive members that would write under
`plugins/` or `kernel`. Unpacks a `tuucho-*` id under `plugins/…`
and every other id under `plugins/user/…`, using `installPath`. Path guards
reject escape, the wrong tree, overlapping ids/paths, and overwrite.
Scans (install / `up`), then enables. Existing disk id → `400 already_installed`.
Unsafe preferred path → `400 unsafe_path`. Occupied dest → `400 path_conflict`.
Incompatible → `409 plugin_incompatible`. Missing file → `400 invalid_request`.

### `POST /admin/plugins/updates/check`

Reads the latest **git tag** (`MAJOR.MINOR.PATCH`, never `v0.0.2`, never
untagged `master`) on https://github.com/by-tezov/tuucho-ecom and each user
plugin `repository`. A private repository is read with the fine-grained token saved
for that URL on Admin, Core (`github_repository_access`). No saved token means
the request stays unauthenticated, which is enough for a public repository.
Check `currentTag` is the live root `package.json`
version, not `tuucho-versioning.lock.json`. Latest is that origin’s newest official tag.
Local greater than latest: ahead of the published tag, no Apply. Equal:
nothing to update. Local less than latest: walk every tag. Returns the tag
path, kernel/plugin diffs, dirty `plugins/` paths, and third-party
rows. GitHub unreachable → `502 update_check_failed`. Requires `preferences`.

### `POST /admin/plugins/updates/apply`

Body `{ "scope": "all"|"kernel"|"plugins"|"plugin", "pluginId"?: string }`.
Admin Core checks and applies `kernel` only. Admin Plugins checks and applies
`plugins` or one `plugin`. `all` stays available on this route.
Starts a snapshot then walks every intermediate tag. Tuucho scopes never write
`plugins/user/`. Kernel scope writes `tuucho/kernel`, `tuucho/plugin-sdk`,
`tuucho/factory-config`, `tuucho/docs`, `tuucho/tuucho-versioning.json`, and
the shop root `package.json`; `all` adds `tuucho/plugins`. Each scoped tree is
replaced wholesale, so files removed inside it between tags disappear, but a
path outside this list (root `scripts/`, `AGENTS.md`, `.agents/`, `.prettierrc`,
a deleted root `docs/`) is never written or cleaned up: root-level moves
between 0.0.5 and 0.0.6 require `git pull`. A user `plugin` scope replaces that folder only. Concurrent
Apply → `409 update_busy`. Poll `GET /admin/plugins/updates/status` for the log.

### `GET /admin/plugins/updates/status`

Current Apply job (`running` / `ok` / `error`) plus log lines, or `job: null`.

### `POST /admin/plugins/scan`

Reads every nested plugin `package.json` (`tuucho` block) under `plugins/` and `plugins/user/`, inserts missing `plugins`
rows, disables plugins whose `engines.core` or `dependsOn` range fails, applies
pending plugin `up` migrations for enabled compatible plugins, and
returns `{ "success": true, "added": string[], "incompatible": string[],
"coreVersion": string, "plugins": [...] }`. Admin Plugins runs this scan as
part of Check for updates. The route stays available. Scan is install: it
discovers the folder and, when the plugin is enabled, runs schema `up`.

### `POST /admin/plugins/:id/config-files/apply`

Reads merged plugin JSON on disk into `plugins.settings` / sealed
`plugins.secrets` and stamps `config_files_hash`. Requires `preferences`
and `plugin_config_import`. No files → `404 not_found`. Never logs bodies.
Disk JSON stays flat (no envelope).

### `POST /admin/plugins/:id/config-files/import`

JSON `{ "files": [{ "name", "text" }] }` or multipart `archive` (zip/tgz).
Maps by filename (`config.json` / `config.private.json` / `*.example`) or
schema keys. Archive members and downloads use envelope format 1
(`pluginId`, `layer`, `compat`). Secret keys in a public payload →
`400 invalid_request`. Core/plugin range miss or unknown format →
`409 plugin_config_incompatible`. Zip-slip / not an archive →
`400 invalid_archive`. Requires `preferences` and `plugin_config_import`.
Never logs bodies.

### `GET /admin/plugins/:id/config-files/export`

Downloads enveloped JSON from the DB (live secrets in the private layer
only when set). One layer → that JSON file. Two layers →
`<id>-config.zip`. Requires `preferences` and `plugin_config_export`.
Never logs bodies.

### `POST /admin/plugins/config-files/apply-all`

Disk → DB for every **enabled** plugin that has `settingsSchema` and
files. Disabled and no-schema plugins are skipped. Requires `preferences`
and `plugin_config_import`. Never enables or disables a plugin. Never logs
bodies.

### `POST /admin/plugins/config-files/import-all`

Multipart `archive` (zip/tgz). Layout `<plugin-id>/config.json` and
`config.private.json`. Named plugins are written even if disabled, and
are not enabled. Per-plugin atomic; not all-or-nothing across the shop.
Unknown ids are skipped. Requires `preferences` and
`plugin_config_import`. Invalid archive → `400 invalid_archive` and zero
writes.

### `GET /admin/plugins/config-files/export-all`

Zip of enabled schema plugins (`plugin-config.zip`). Disabled plugins are
omitted. Empty set → `404 not_found`. Requires `preferences` and
`plugin_config_export`. Never logs bodies.

### `PATCH /admin/plugins/:id`

Body is one of:

- `{ "enabled": true|false }` (required plugins cannot be disabled:
  `400 plugin_required`. Enable of an incompatible plugin:
  `409 plugin_incompatible` with `error.message`. Enable applies pending
  plugin `up` migrations before the row is marked enabled. Disable unloads
  code and **keeps** plugin tables.)
- `{ "settings": { ... } }` (JSON merge into `plugins.settings`)

Missing id → `404 not_found`. Invalid body → `400 invalid_request`.
Enabling or disabling a shipping plugin also toggles matching
`couriers.enabled` rows. Courier texts, times, prices and parcels are
`/admin/courier-catalog` (`courier_edit`), not this PATCH.

### `POST /admin/plugins/:id/uninstall`

Removes the plugin from the host. Body must be `{ "confirm": true }`
(`400 invalid_request` otherwise). Required plugins cannot uninstall
(`400 plugin_required`). Missing id → `404 not_found`.

The host runs each applied file `down` (newest first), drops leftover
tables named `plugin_<id>_…`, deletes `plugins_schema_migrations` rows,
then deletes the `plugins` row. Disable is not this: disable keeps data.
Deleting the folder without this call leaves an orphan row
(`missingFromDisk`). Response: `{ "success": true, "reverted": string[] }`.

### `GET /admin/seo`

Kernel SEO hub. Returns `{ environment, plugins, sitemap, robots, redirects }`
for Settings → SEO: `APP_TARGET` and whether public indexing is on
(`environment.publicIndexing` is true only for `prod`), which SEO plugins are
on, assembled sitemap entries (`sitemap.published` is false outside prod),
assembled shop robots text, and stored redirect rows. Requires `requireAuth`
plus `preferences`.

### `POST /admin/seo/redirects`

Body `{ "fromPath": "/old", "toPath": "/new", "status": 301 | 410 }`. Paths
must start with `/`. Upserts on `from_path`. Invalid body → `400 invalid_request`.
Stored rows apply only while `tuucho-seo-redirects` is on.

### `DELETE /admin/seo/redirects/:id`

Removes one stored row. Unknown id → `404 not_found`. Requires `requireAuth`
plus `preferences`.

### `GET /admin/store`

Store identity (`name`, `suffix`, `taxMode`), product axes, theme tokens,
and menus. Theme tokens are edited on the theme plugin Configure page.
Identity and axes are the Shop page. There is no separate Menus toggle:
page plugin enable is the menu.

### `PATCH /admin/store`

Body is one of `{ "identity": { ... } }`, `{ "axes": [...] }`,
`{ "theme": { "tokens": { ... } } }`, or `{ "menus": [...] }`. Invalid body
→ `400 invalid_request`.

## Couriers and shipping

### `GET /admin/cart-rules`

Admin list of permanent cart rules (`code`, `kind`, `enabled`, `priority`,
`forbidVoucher`, `params`). Owned by the `tuucho-commerce-cart-rules` plugin: when
that plugin is disabled these routes return `404 plugin_disabled` and
checkout sees an empty rule list.

### `POST /admin/cart-rules`

Upsert a cart rule (same shape as `POST /operation/cart-rules`):
`{"code","kind","params","enabled"?,"priority"?,"forbidVoucher"?}`.
Kinds: `gift_per_nail_set`, `nail_qty_percent_tiers`, `free_shipping_above`.
`gift_per_nail_set` params `{ productUid, qtyPerNailSetUnit, minNails }`
(`minNails` 1 to 10). A catalogue nail set is one unit. A composed set is one
unit when it holds at least `minNails` nails, counted by its quantity. Two
gift rules naming the same product add up on one locked line, filed under the
first rule by priority. `nail_qty_percent_tiers` params `{ tiers, minNails }`
uses the same unit, and the percent applies to the line totals of the units
that count. A shorter composed set counts as zero and is not discounted.
For `free_shipping_above`, `params` is
`{ thresholdsByCountry: Record<ISO2, number> }` (uppercase country codes).
Invalid params → `400 invalid_params`.

### `PATCH /admin/cart-rules/:code/enabled`

`{"enabled":true|false}`. Missing rule → `404`.

### `DELETE /admin/cart-rules/:code`

Deletes one rule. Missing → `404`.

### `GET /admin/core-config`

Permission `preferences`. Returns the public kernel file
`tuucho-config/config.json` as text. Private config is never read.

```json
{ "success": true, "present": true, "text": "{\n  \"http\": {}\n}\n" }
```

### `PUT /admin/core-config`

Permission `plugin_config_import` (and `preferences`). Body `{ "text": "{...}" }`.
The text must be a JSON object, at most 1_000_000 characters. Writes
`config.json` pretty-printed. The running process does not reload it: restart
the API. `400 invalid_json`, `400 too_large`.

### `POST /admin/core-config/apply`

Permission `plugin_config_import`. Re-reads `config.json` into the same
response shape. Does not change process env.

### `POST /admin/core-config/import`

Permission `plugin_config_import`. Body `{ "text": "{...}" }`. Same write as PUT.

### `GET /admin/core-config/export`

Permission `plugin_config_export`. Downloads `config.json`. The download never
includes GitHub access tokens.

### `GET /admin/github-access`

Permission `preferences`. Lists repositories that have a saved fine-grained
access token. The token is never returned.

```json
{
  "success": true,
  "entries": [{ "repository": "https://github.com/owner/name", "updatedAt": "2026-10-28T22:00:00.000Z" }]
}
```

### `PUT /admin/github-access`

Permission `plugin_config_import` (and `preferences`). Body
`{ "repository": "https://github.com/owner/name", "token": "github_pat_..." }`.
`repository` is an HTTPS GitHub repo root. `token` is a fine-grained personal
access token (`github_pat_` plus letters, digits, and underscores). Saving the
same repository replaces the token. The value is stored with AES-256-GCM
(`encryptPii`) and is not written to `config.json`. At most 40 repositories.
`400 invalid_repository`, `400 invalid_token`, `400 too_many`.

Check and Apply send `Authorization: Bearer` for a repository that has a row.
A repository with no row is requested with no token.

### `DELETE /admin/github-access`

Permission `plugin_config_import` (and `preferences`). Body
`{ "repository": "https://github.com/owner/name" }`. Removes the saved token.
Unknown repository → `404 not_found`. Invalid URL → `400 invalid_repository`.

### `GET /admin/preferences` and `PATCH /admin/preferences`

Runtime operator toggles stored in `app_preferences` (not env). Response:

```json
{
  "success": true,
  "preferences": {
    "cronShipmentLogEnabled": true,
    "cronAccountDeletionLogEnabled": true,
    "cronGuestSavedCleanupLogEnabled": true,
    "cronLoyaltyLogEnabled": true,
    "cronGiftLogEnabled": true,
    "cronGiftPurgeLogEnabled": true,
    "cronPaymentAuthExpirySpyLogEnabled": true,
    "apiLogEnabled": false,
    "apiLogEnabledEffective": false,
    "contactEmailGuestEnabled": true,
    "contactEmailConnectedEnabled": true,
    "paymentCardEnabled": false,
    "paymentPaypalEnabled": false,
    "paymentBancontactEnabled": false,
    "paymentGooglePayEnabled": false,
    "paymentApplePayEnabled": false,
    "signInGoogleEnabled": false,
    "signInFacebookEnabled": false,
    "signInAppleEnabled": false,
    "facebookMobileDirectOAuthEnabled": true,
    "signInGoogleVerboseEnabled": false,
    "signInFacebookVerboseEnabled": false,
    "signInAppleVerboseEnabled": false,
    "outOfStockEnabled": true,
    "outOfStockSizeRequestEnabled": true,
    "paymentMethodCountries": {
      "card": ["ALL"],
      "paypal": ["ALL"],
      "bancontact": ["BE"],
      "googlePay": ["ALL"],
      "applePay": ["ALL"]
    },
    "spy": {
      "account_created": true,
      "login": true,
      "email_changed": true,
      "account_deletion": true,
      "order_confirmation": true,
      "order_cancelled": true,
      "order_updated": true,
      "payment_failed": true,
      "payment_authorization_expired": true,
      "payment_authorization_expiring": true,
      "cart_abandoned": true,
      "product_request": true,
      "gift_created": true,
      "rate_limit_login": true,
      "rate_limit_auth": true,
      "rate_limit_contact_email": true,
      "rate_limit_refresh": true,
      "rate_limit_voucher": true,
      "rate_limit_checkout": true,
      "rate_limit_payment": true,
      "rate_limit_gallery": true,
      "rate_limit_ops": true,
      "rate_limit_otp_email": true,
      "rate_limit_email_confirmation": true,
      "rate_limit_email_change": true,
      "rate_limit_invoice_download": true,
      "rate_limit_invoice_email": true,
      "rate_limit_password_reset_email": true,
      "rate_limit_login_lockout": true
    },
    "updatedAt": "2026-08-21T18:00:00.000Z"
  }
}
```

`PATCH` accepts any subset of `cronShipmentLogEnabled`,
`cronAccountDeletionLogEnabled`, `cronGuestSavedCleanupLogEnabled`,
`cronLoyaltyLogEnabled`,
`cronGiftLogEnabled`,
`cronGiftPurgeLogEnabled`,
`cronPaymentAuthExpirySpyLogEnabled`,
`apiLogEnabled`,
`contactEmailGuestEnabled`, `contactEmailConnectedEnabled`,
`paymentCardEnabled`, `paymentPaypalEnabled`, `paymentBancontactEnabled`,
`paymentGooglePayEnabled`,
`paymentApplePayEnabled`, `signInGoogleEnabled`, `signInFacebookEnabled`,
`signInAppleEnabled`, `facebookMobileDirectOAuthEnabled`,
`signInGoogleVerboseEnabled`, `signInFacebookVerboseEnabled`,
`signInAppleVerboseEnabled`, `outOfStockEnabled`,
`outOfStockSizeRequestEnabled`, and
`paymentMethodCountries` (partial map of ISO-3166-1 alpha-2 arrays per method,
or the sentinel `ALL` for worldwide; an empty array means no primary countries),
and
`spy`
(partial map of boolean flags). Payment method flags default to `false`
and must be enabled explicitly — the API rejects checkout / add-card for
a shop-disabled method with `403 payment_method_forbidden` (front-end
hiding is not the safety gate). Third-party sign-in flags (`signInGoogleEnabled`,
`signInFacebookEnabled`, `signInAppleEnabled`) likewise default to `false`; sign-in / link for a
shop-disabled provider returns `403 sign_in_method_forbidden` (unlink stays
allowed). Per-provider `signIn*VerboseEnabled` (default `false`) replaces silent
social account creation with a create-vs-link OTP step when that provider’s
email is unknown. `facebookMobileDirectOAuthEnabled` defaults to `true` and
selects the direct Facebook web OAuth flow on mobile when enabled; when
disabled, mobile uses the standard JavaScript SDK `FB.login()` flow. Desktop
always uses `FB.login()`. `outOfStockEnabled` defaults to `true`. When it is
`false`, sold-out nail sets are omitted from gallery browsing, featured,
filter-options, product pages, and the sitemap. Cart hydration by product
id still returns them so an already-added line can show the out-of-stock
notice. Sold-out size chips stay visible in the gallery zoom modal and the
cart size picker. Size requests are the `tuucho-commerce-product-requests`
plugin: enable it to allow storefront requests and the admin inbox; disable
it to hide both (`404 plugin_disabled` on `POST /contact/product-request`).
`outOfStockSizeRequestEnabled` stays on this payload for compatibility;
filter-options reports the plugin gate, not this stored flag. Front-end
hiding is not the safety gate. Email + password / OTP are never preference-gated. Cron log flags only control whether each
cron writes/exposes its private log — processing always runs. Contact email flags only skip the owner notification mail; the
message is still stored. `apiLogEnabledEffective` follows the stored
`apiLogEnabled` preference in every target, including production. Missing keys
are seeded from the previous env defaults on first read.

### `GET /admin/shipping-catalog`

Live shipping toggles over the same rows courier seed owns
(`address_countries.enabled`, `couriers.enabled`,
`courier_countries.enabled`). Auth + admin required. Response:

```json
{
  "success": true,
  "addressCountries": [{ "code": "FR", "label": "localized string", "enabled": true }],
  "couriers": [
    {
      "code": "mondial-relay-point",
      "name": "localized string",
      "enabled": true,
      "countries": [
        { "code": "FR", "enabled": true },
        { "code": "BE", "enabled": true }
      ]
    }
  ]
}
```

Only countries with complete catalog data (delivery time, custody when required,
and a packet price on every tier) appear in each courier's `countries` list.
Incomplete rows stay in the database until the next courier import adds prices,
but the admin UI does not offer toggles for them.

### `PATCH /admin/address-countries/:code`

Body: `{"enabled":true|false}`. Flips whether the country appears in
`GET /account/address-countries` (home typing). Unknown code → `404
not_found`; bad body → `400 invalid_request`. Response
`{"success":true,"code":"FR","enabled":true}`.

### `PATCH /admin/couriers/:code`

Body: `{"enabled":true|false}`. Shop-wide courier on/off. Unknown code →
`404 not_found`; bad body → `400 invalid_request`. Response
`{"success":true,"code":"mondial-relay-home","enabled":true}`.

### `PATCH /admin/couriers/:code/countries/:countryCode`

Body: `{"enabled":true|false}`. Per-country open/closed on one courier.
Disabling always succeeds when the row exists. Enabling re-checks catalog
completeness and may return `400` with
`delivery_time_missing`, `custody_time_missing`, `packet_price_missing`, or
`express_price_incomplete` (or `404` for `courier_not_found` /
`country_not_catalogued` / `not_found`). Response
`{"success":true,"code":"…","countryCode":"FR","enabled":true}`.

These toggles do not rewrite catalog JSON; the next
`npm run courier -- seed --update` remains authoritative for structure
(which countries and packet keys exist on a courier). Texts, times, prices
and parcel sizes of those existing rows are `/admin/courier-catalog`.

### `GET /admin/courier-catalog`

JSON groups for rows that already exist: couriers, address countries,
delivery networks, and parcel measurements. Auth + `courier_edit`. Enable
flags are omitted. Locales are `en` and `fr` only. Response:

```json
{
  "success": true,
  "countries": [{ "code": "FR", "label": { "en": "France", "fr": "France" } }],
  "networks": [{ "code": "$home", "sortOrder": 0, "name": { "en": "Home", "fr": "Domicile" } }],
  "measurements": [{ "quantity": 1, "weight": 120, "length": 18, "width": 8, "depth": 4 }],
  "couriers": [
    {
      "code": "mondial-relay-home",
      "sortOrder": 2,
      "name": { "en": "Mondial Relay", "fr": "Mondial Relay" },
      "description": { "en": "", "fr": "" },
      "countries": [{ "code": "FR", "minDays": 3, "maxDays": 5, "custodyDays": null }],
      "packets": [
        {
          "key": "solo",
          "sortOrder": 0,
          "maxQuantity": 1,
          "prices": [{ "country": "FR", "price": 4.99, "expressPrice": null }]
        }
      ]
    }
  ]
}
```

Puts reject adding or removing couriers, countries, networks or packet keys.
Unknown keys such as `enabled` are ignored. A shared price folds to one
number; per-country maps and a `default` key are accepted. `deliveryTime`
and `custodyTime` expand the same way.

- `PUT /admin/courier-catalog/couriers/:courierCode` — texts, sort order,
  delivery/hold times, packet prices
- `PUT /admin/courier-catalog/countries/:countryCode` — country labels
- `PUT /admin/courier-catalog/networks/:networkCode` — network name and order
- `PUT /admin/courier-catalog/measurements` — parcel weight and size by
  quantity key

Unknown code → `404 not_found`. Invalid document → `400 invalid_request`
with `error.message`.

### `GET /admin/vouchers`

Admin list of voucher definitions, including remaining/redemption/held
quantities, offer details, `allowedEmails` (empty = every account),
`redemptions` (the consumer e-mail from the live account, guest checkout, or
order snapshot; the order number; and the redemption timestamp for each use),
and `canDelete`. A voucher is deletable only when it has never been
redeemed and has no active checkout hold.
Requires `requireAuth` + the `vouchers` permission.
Owned by the `tuucho-commerce-vouchers` plugin: when that plugin is disabled these
routes return `404 plugin_disabled` and checkout preview/hold refuse the
code.

### `POST /admin/vouchers`

Create a voucher. Body:

```json
{
  "code": "PROMO10",
  "quantity": 100,
  "maxUsesPerUser": 1,
  "minSubtotal": 50,
  "startsAt": "2026-01-01",
  "endsAt": "2026-12-31",
  "offerType": "percent",
  "value": 10,
  "emails": ["ada@example.com"]
}
```

`code` is optional: omit it (or send a blank string) to generate an
`ABC-123` name, same as `npm run voucher -- init` without `--name`. A
supplied name is left as-is after trim. `maxUsesPerUser` defaults to `1`
(`0` = unlimited per customer). `minSubtotal` is optional and allowed
only for `amount` and `free_shipping`. `emails` is optional and is the
admin form of CLI `--users`: omit it (or send `[]`) for a public voucher;
otherwise each address must match an existing account and the voucher is
usable only by those accounts. Unknown email → `404 not_found`. `offerType`
is `percent` | `amount` | `free_shipping` | `free_item` | `free_item_nth`.
`value` is required except for `free_shipping` (percent 0–100 exclusive of
0; amount/free_item max price `> 0`; free_item_nth integer ≥ 1). Dates are
`YYYY-MM-DD` with `startsAt ≤ endsAt`. Response
`201 {"success":true,"code":"PROMO10"}`. Duplicate supplied code →
`409 already_exists`; bad body → `400 invalid_request`.

### `PATCH /admin/vouchers/:code/enabled`

Body: `{"enabled":true|false}`. Enables or disables an existing voucher
without changing its offer or quantity. Missing code → `404 not_found`.

### `DELETE /admin/vouchers/:code`

Permanently removes an unused voucher. A voucher with any redemption (even
one attached to a cancelled order) or an active checkout hold cannot be
deleted; disable it instead. Returns `200 {"success":true}`; missing code →
`404 not_found`; protected voucher → `409 voucher_not_deletable`.

### `GET /admin/gift/offers`

Paginated active (non-terminal) offers: decrypted names/emails, budgets,
clocks. No capability tokens. Query `page`, `pageSize`. Full contract:
[08-gift.md](./08-gift.md).

### `POST /admin/loyalty/credit` / `POST /admin/loyalty/uncredit`

Manual wallet ops by customer email: `{ "email": string, "amount": number, "reason": string }`.
Missing account → `404 not_found`; insufficient balance on uncredit →
`409 loyalty_insufficient`.

### `GET /admin/loyalty/manual-ops`

Paginated audit of `credit_manual` / `uncredit_manual` ledger rows (`page`,
`pageSize`). Each entry includes customer email, amount, reason, date, and
admin actor email.

### `GET /admin/loyalty/users/:userId/wallet` / `…/ledger`

Per-user wallet snapshot and full ledger. Manual credit/uncredit goes
through the by-email routes above.

### `PATCH /admin/orders/:id/status`

Fulfillment advances one step at a time, matching the admin order detail UI.
The full status graph, exceptions, and payment-capture rules are in
[Order lifecycle](../orders.md).

| Current status         | Body                                                             | Result                        |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------- |
| `confirmed`            | `{"status":"in_preparation","noPayment":true\|false}`            | `in_preparation`              |
| `in_preparation`       | `{"status":"to_send","skipShippingLabel":true\|false}`           | `to_send`                     |
| `to_send`              | `{"status":"sent"}`                                              | `sent`                        |
| `sent` or `disponible` | `{"advanceToReceived":true}` or `{"advanceToReturnReview":true}` | `received` or `return_review` |

Omitting `noPayment` captures an authorized Stripe payment before preparation;
`noPayment:true` leaves it authorized. Moving to `to_send` always captures an
authorization if necessary. By default the server also generates the carrier
label and persists it before the status changes; `skipShippingLabel:true` moves
to `to_send` without calling the carrier label API (no PDF sticker — use
`set-tracking` or the admin tracking flow later). `advanceToReceived` continues
`sent → disponible → received` when the order has a pickup point, otherwise
`sent → received` (admin verification remains false). `advanceToReturnReview`
opens an admin return case from `sent` or `disponible`. The two advance flags
are mutually exclusive and must be sent without `status`. Customer notification
via `notifyCustomer` only sends the preparation/ready-to-send mail on the first
two transitions; shipped/received side effects still follow their normal
automatic emails when those transitions run.

### `GET /admin/orders/:id/sticker` and `GET /admin/orders/:id/tracking`

The sticker endpoint streams the persisted PDF label to an authenticated
admin. Newly generated Mondial Relay labels request the carrier's native A4
PDF format. Tracking returns the same shipment number, events, and
carrier-owned public tracking URL as the account order endpoint when that
courier/shipment supports it. Carrier milestones on that payload also advance
the order status (same walk as the shipment-tracking cron).

## Administration journal

Append-only history of changes that altered the running application (browser
admin, operator CLIs, system jobs). Each change is one NDJSON line in
`PRIVATE_LOG_ACTIVITY_FILE`. See [schema](../schema/09-activity.md).
Lines older than `CRON_LOG_RETENTION` are removed by the same daily sweep as
the cron journals.

### `GET /admin/activity`

Paginated journal (`page`, `pageSize` default 30, max 100). Filters:

- `category`: `catalogue` | `orders` | `accounts` | `loyalty` | `gift` |
  `promotions` | `shipping` | `messaging` | `settings` | `operations` | `deploy`
- `origin`: `admin` | `operator` | `system`
- `actorUserId`: administrator uuid (implies `origin=admin`)
- `q`: substring match on `summary`, `target_id`, or any `targets` entry

Newest first (`occurred_at`, then `id`). Each entry includes category, action,
outcome, origin, actor fields, operator attribution when present, target,
summary, and redacted `detail`.

A super-admin session start appends `accounts.signin` in category `accounts`,
origin `admin`, and sends the sign-in alert e-mail. Password, one-time code,
and social sign-in use `detail.kind` `signin`. An automatic resume
(`POST /auth/refresh` after `SUPER_ADMIN_SIGNIN_ALERT_IDLE`) uses `resume`.
The summary is `Connexion super-admin.` and `detail` also carries `ip` and
`userAgent`. Other roles are ignored. A refresh inside the idle window is
not a sign-in. A journal or mail failure never fails the login.

For value mutations, `detail.changes` is an array of
`{ "field", "before", "after" }` for fields that actually differed (example:
stock size `sizes.XS` from `2` to `3`). Context such as `shapeKey` /
`lengthKey` may sit beside `changes`. Older rows may lack `changes` and only
carry the after payload. Summaries name the concrete change when short.

### `GET /admin/activity/actors`

Distinct administrators that appear in the journal (`userId`, `email`), for
the filter dropdown.

### `POST /admin/activity/clear`

Authenticated administrator. Deletes the activity journal file and returns
`{ "success": true, "clearedFiles": 0 | 1 }`. The next change creates the
file again.

## Cron journals

Private jsonl tails written by production crons. The browser does not call
`/operation/log/cron-*`. Clearing from the page is the admin route below.
The operations CLI (`npm run log -- clear --cron-*`) remains available.

### `GET /admin/cron-logs/:kind?lines=100`

Authenticated administrator. `:kind` is one of `shipment`,
`account-deletion`, `guest-saved-cleanup`, `loyalty`, `gift`, `gift-purge`,
`payment-auth-expiry`, `warm`. Anything else is `404` (`not_found`).
`lines` is 1 to 500, default 100.

Each kind is gated by the same `cron*LogEnabled` preference as the matching
ops reader. When that switch is off the response is `403` with
`error.code` such as `cron_gift_log_disabled`. A missing or empty file
returns `{ "success": true, "lines": [] }`. Lines are raw NDJSON strings,
newest last as stored. See [production crons](../cron/README.md).

### `POST /admin/cron-logs/:kind/clear`

Authenticated administrator. Same `:kind` values. Unknown kind is `404`
(`not_found`). Deletes that journal file and returns
`{ "success": true, "clearedFiles": 0 | 1 }`. The log preference does not
gate this route: a journal that is turned off can still be erased. The next
cron run creates the file again.

`CRON_LOG_RETENTION` (`1y` in kernel `config/`, 365 days) is how long a
line with `at` is kept. The API process removes older dated lines about once
a day. A line with no `at` stays until this clear.

## API journal

Private NDJSON diagnostic tail. The browser does not call
`GET /operation/log/api`. Reading or clearing this journal is not written
back into it. Writing follows `apiLogEnabled` in every target,
including production. Each record stores the request and the response body,
bounded by `API_LOG_BODY_MAX_BYTES`. Credentials are replaced with
`[REDACTED]` everywhere. A signed-in call stores `x-user-id` in the request
headers. Production also replaces email, phone, name, address and client IP.

### `GET /admin/api-log?lines=100&route=&from=&to=&q=`

Authenticated administrator. `lines` is 1 to 500, default 100. The scan covers
the current file and every rotated generation. Response:

```json
{ "success": true, "enabled": true, "lines": ["..."], "routes": ["/checkout"], "truncated": false }
```

`enabled` is false whenever the write preference is off.
Lines are still returned when a file exists. A missing file returns
`"lines": []`.

`route` is an exact request path. `from` and `to` are inclusive. A full
timestamp is used as given. A `YYYY-MM-DD` value is that UTC calendar day,
from its start or through its end. `q` searches the raw line, at most 200
characters. Without `*` it is a case-insensitive substring. `*` matches any
text, including none. Other characters are literal.

`routes` lists distinct paths seen in the scan, sorted, at most 400.
`truncated` is true when more than `lines` matches existed. The newest are
kept. `lines` stays oldest first, so the newest match is last.

`metrics.hour`, `day`, `week` and `month` count every dated line in the scan,
not only the filtered page. `hour` is the last hour, `day` the last 24 hours,
`week` the last 7 times 24 hours, `month` the last 30 times 24 hours, ending
when the journal is read. `requests` omits `/healthz`. `top` is at most 10
paths, highest first, and still includes `/healthz`. A line with no `at` is skipped.

### `POST /admin/api-log/clear`

Authenticated administrator. Deletes the current diagnostic file and every
rotated generation, and returns `{ "success": true, "clearedFiles": number }`.
The write preference does not gate this route.

## E-mail journal

Private NDJSON of mail that left the process (`sendMail` and `sendChatMail`),
including a failure to send. The keep-warm outage script does not write here:
it must not open the database. Reading or clearing this journal is not written
into the API journal. Writing follows `emailLogEnabled` in every target,
including production. The preference is seeded from `ENABLED_EMAIL_LOG` (unset
means off). Each record stores when, target, outcome (`sent` or `failed`),
channel (`smtp` or `folder`), kind (`user`, `spy`, `contact`, `chat`), the
From, To and Reply-To, the subject, whether HTML was present, attachment
filenames and count, the error message, and the text body. The text is bounded
by 32 KiB and by `API_LOG_BODY_MAX_BYTES`. Rotation uses
`API_LOG_ROTATE_MAX_BYTES` and `API_LOG_ROTATE_MAX_FILES`. The file is
`PRIVATE_LOG_EMAIL_FILE`.

Credentials are replaced with `[REDACTED]` everywhere. Production also
anonymises personal data the same way as the API journal. An email that
belongs to an account is stored as that user's id; every other email and
any phone number inside a string becomes `[REDACTED]`. A name inside the
subject or the body stays.

### `GET /admin/email-log?lines=100&kind=&outcome=&q=`

Authenticated administrator with `api_log`. `lines` is 1 to 500, default 100.
`kind` is `user`, `spy`, `contact` or `chat`. `outcome` is `sent` or `failed`.
`q` is a case-insensitive substring of the raw line, at most 200 characters.
The scan covers the current file and every rotated generation. Response:

```json
{
  "success": true,
  "enabled": true,
  "lines": ["..."],
  "truncated": false,
  "metrics": { "hour": 1, "day": 4, "week": 12, "month": 40 }
}
```

`enabled` is false when the write preference is off. A missing file returns
`"lines": []`. `truncated` means more than `lines` matches existed; the newest
are kept, oldest first. `metrics.hour`, `day`, `week` and `month` count every
dated line (last hour, 24 hours, 7 and 30 times 24 hours), not only the page.

### `POST /admin/email-log/clear`

Authenticated administrator with `api_log`. Deletes the current file and every
rotated generation, and returns `{ "success": true, "clearedFiles": number }`.
The write preference does not gate this route.

Spy recipients are the Recipients tab on Plugins, Spy e-mails, Configure. There is no Spy e-mails menu. The tab uses the routes below, all gated by `preferences` and `tuucho-mail-spy` (`404 plugin_disabled` when off). They read and write that plugin's `rules` setting and `config.json`. Each item is `{ "channel", "role" }` or `{ "channel", "email" }`. `channel` is a channel id or `*` for every channel. `"enabled": false` turns that channel off. An empty list sends nothing. No role is added automatically. Customers (`user`) are ignored. An address must be an existing unlocked staff account.

### `GET /admin/spy-mail`

Lists every channel registered on `mail.spy.channels`, whether it is enabled, its recipient rules, and the staff roles the operator may pick. Response `{ "success": true, "channels": [...], "staffRoles": [...] }`.

### `PATCH /admin/spy-mail/channels/:channelId`

Body `{ "enabled": boolean }`. Unknown channel `404 not_found`.

### `POST /admin/spy-mail/channels/:channelId/recipients`

Body `{ "filter": "role"|"email", "value": "..." }`. Role `user` is refused (`invalid_role`). Email must be an existing unlocked staff account (`not_staff_account`).

### `DELETE /admin/spy-mail/recipients/:id`

Unknown id `404 not_found`.
