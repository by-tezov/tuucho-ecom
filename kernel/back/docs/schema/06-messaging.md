# Messaging

### Contact chat (included in `1738000000000_init.js`)

Account-owned asynchronous messaging on the Contact page. Guests use the
classic form; connected users use chat. Messages are append-only and have no
schedule, availability switch, timeout, grace phase, or automatic closure.

#### `chat_sessions`

| Column               | Type        | Notes                                              |
| -------------------- | ----------- | -------------------------------------------------- |
| `id`                 | `uuid` PK   | App-generated                                      |
| `public_id`          | `text` UK   | Opaque 8-hex code in URLs / email subject, upper-case (`CHECK`) |
| `user_id`            | `uuid not null` | FK `users` on delete cascade                    |
| `visitor_email`      | `text`      |                                                    |
| `visitor_identity`   | `text` null |                                                    |
| `status`             | `text`      | `open` \| `closed`                                  |
| `last_user_read_message_id` / `last_user_read_at` | `bigint null` / `timestamptz null` | Durable customer read cursor and its acknowledgement date. |
| `last_user_active_at` | `timestamptz null` | Short-lived browser-reading heartbeat, used by the notification worker across API instances. |
| `subject`            | `text` null | Email subject for the inbound/outbound owner thread |
| `last_message_at`    | `timestamptz` null | Timestamp of the newest message; sorts the admin conversation list (`chat_sessions_status_idx (status, last_message_at desc)`). |
| `closed_at`          | `timestamptz` null | When the session was closed, by the customer or by ops. Null while `status = 'open'`. Reopening clears it. |
| `owner_email_suppressed_until` | `timestamptz` null | Admin-chat temporary mute for owner notifications on new customer messages; added by `1787300000000_chat_admin_owner_email_suppression.js`. |
| `transcript_sent_at` | `timestamptz` null | Reserved for a future transcript-email workflow; current chat sends each owner reply directly, not a transcript |

#### `chat_messages`

Append-only. `id bigserial` is the SSE event id. `session_id` is the owning
`chat_sessions.id` (cascade-deleted with it). `sender` is `user`\|`owner`;
`source` is `web`\|`email`. `email_message_id` unique for inbound idempotency;
`outbound_message_id` stores the Message-ID we minted on owner-notify emails.

#### `chat_message_attachments`

Private image files for a chat message. Cascade-deleted with the message.

`chat_messages.client_message_id` and its per-session unique index allow a
customer retry to reuse the original message instead of creating a duplicate.
Stores `file_name` (under `PRIVATE_DIR`/`PRIVATE_MEDIA_CHAT_DIR`),
`original_name` (visitor upload name for UI/email), `byte_size`,
`content_type` — never the image bytes. Public APIs expose `{ id, fileName }`
(`fileName` = original name); pixels via session-gated attachment GET.
ops/CLI resolve the absolute path from `file_name`.

#### `chat_notification_outbox`

Durable, idempotent notification batches for unread Shop replies. The
worker cancels a pending batch when the customer has read it, is actively
connected, or disabled the `chat_reply` notification preference. Drained by
`POST /operation/chat/notifications/process`.

| Column | Type | Notes |
| --- | --- | --- |
| `session_id` | `uuid not null` FK → `chat_sessions.id` | Conversation the batch belongs to; cascades. |
| `first_message_id` / `through_message_id` | `bigint not null` FK → `chat_messages.id` | Inclusive range of owner messages this batch covers, so a single email can summarize several replies and a retry cannot re-notify a narrower or wider span. |
| `provider_message_id` | `text` null | Message-ID returned by the mail provider on a successful send, for correlating with a delivery log. |
| `last_error` | `text` null | Failure detail from the most recent attempt; kept alongside `attempts` so a stuck batch is diagnosable without provider access. |
| `cancelled_at` | `timestamptz` null | Set when the batch became unnecessary (read, active, or preference off) rather than sent — distinguishes "deliberately not sent" from `failed`. |

#### `chat_inbound_dead_letters`

Ops log for chat-looking inbound that could not be attached cleanly. Records
`reason`, the `email_message_id` and `subject` when present, and `snippet` — a
short excerpt of the body, kept for diagnosis rather than the whole message, so
an unmatched mail is triageable without storing an arbitrary amount of
someone's text.

### Anonymous contacts (added in `1787310000000_unconnected_contacts.js`)

`POST /contact` creates a durable record for messages sent without an account.
The original owner-notification email still sends, but it is no longer the only
record. All PII and message/file names in these tables are encrypted by the
application. Only the authenticated admin inbox can read the records or their
private images.

#### `unconnected_contacts`

| Column              | Type          | Notes                                      |
| ------------------- | ------------- | ------------------------------------------ |
| `id`                | `uuid` PK     | App-generated                              |
| `public_id`         | `text` UK     | Opaque 8-hex admin handle, upper-case (`CHECK`) |
| `email`             | `text`        | Encrypted PII                              |
| `email_lookup`      | `text` null   | HMAC equality index of normalized email. New form records write it; the operation migration handler backfills existing ciphertext. It powers the exact-email (not account-FK) customer-admin contact view. |
| `identity`          | `text`        | Encrypted PII                              |
| `language`          | `text` null   | Language the visitor wrote in (the request's language, added by `1791500000000_visitor_language.js`); the admin reply email uses it. Null on older rows, which get the French reply. |
| `status`            | `text`        | `new` (default) \| `answered` \| `ignored` |
| `status_updated_at` | `timestamptz` |                                            |
| `created_at`        | `timestamptz` |                                            |

Indexes: `unconnected_contacts_status_created_idx (status, created_at)` and
partial `unconnected_contacts_email_lookup_idx (email_lookup) where email_lookup is not null`.

#### `unconnected_contact_messages`

Each visitor message and each reply sent from the admin inbox.

| Column       | Type          | Notes                       |
| ------------ | ------------- | --------------------------- |
| `id`         | `bigserial` PK|                             |
| `contact_id` | `uuid` FK     | `unconnected_contacts`, cascade delete |
| `direction`  | `text`        | `visitor` \| `admin`       |
| `body`       | `text`        | Encrypted PII               |
| `created_at` | `timestamptz` |                             |

#### `unconnected_contact_attachments`

Private images attached to the visitor's contact message. File names are
encrypted; bytes stay in `PRIVATE_MEDIA_CONTACT_DIR` and are never public.

| Column         | Type           | Notes                                      |
| -------------- | -------------- | ------------------------------------------ |
| `id`           | `bigserial` PK |                                            |
| `message_id`   | `bigint` FK    | `unconnected_contact_messages`, cascade delete |
| `file_name`    | `text`         | Encrypted private-storage filename         |
| `original_name`| `text`         | Encrypted visitor-facing filename          |
| `created_at`   | `timestamptz`  |                                            |

### Product requests (`1738000000000_init.js` + `1787290000000_product_request_snapshots_and_messages.js`)

Sold-out size requests from `POST /contact/product-request`. The spy email
still fires; this table is the durable ops/admin record (`npm run
product-request -- list` / `set-status`, and `/admin/product-requests*`). No
manager archive. Snapshot/response columns and the message thread were added
by `1787290000000_product_request_snapshots_and_messages.js`.

#### `product_requests`

| Column              | Type        | Notes                                                                 |
| ------------------- | ----------- | --------------------------------------------------------------------- |
| `id`                | `uuid` PK   | App-generated                                                         |
| `public_id`         | `text` UK   | Opaque 8-hex handle in the spy email and CLI, upper-case (`CHECK`)    |
| `user_id`           | `uuid` null | FK `users` on delete set null (guest requests have no user)           |
| `email`             | `text`      | Encrypted PII (reply-to)                                              |
| `product_id`        | `uuid` null | FK `products` on delete set null                                      |
| `product_uid`       | `text`      | Snapshot of the catalogue reference at request time                   |
| `title_fr`          | `text`      | French title snapshot                                                 |
| `shape_key`         | `text`      |                                                                       |
| `shape_label_fr`    | `text`      | French shape label snapshot (raw key if the shape is gone)            |
| `length_key`        | `text`      |                                                                       |
| `size`              | `text`      | `XS` \| `S` \| `M` \| `L`                                             |
| `quantity`          | `integer`   | `> 0`                                                                 |
| `unit_price`        | `numeric(10,2)` null | Catalogue unit price snapshot at request time                |
| `photo_path`        | `text` null | Private snapshot path for the product thumbnail used in admin UI      |
| `comment`           | `text` null | Encrypted PII; optional customer note                                 |
| `language`          | `text` null | Language of the request (added by `1791500000000_visitor_language.js`); the reply email uses the account's saved language, else this, else French |
| `status`            | `text`      | `requested` (default) \| `accepted` \| `refused`                      |
| `refusal_reason`    | `text` null | Required when `status = refused`, null otherwise                      |
| `response_price`    | `numeric(10,2)` null | Admin reply price (when responding)                          |
| `response_message`  | `text` null | Encrypted PII; admin reply body                                       |
| `status_updated_at` | `timestamptz` |                                                                     |
| `created_at`        | `timestamptz` |                                                                     |

Constraint `product_requests_refusal_reason_ck`: refused rows must have a
non-empty `refusal_reason`; other statuses must have it null.

Index: `product_requests_status_created_idx (status, created_at desc)`.

#### `product_request_messages`

Append-only thread for a product request (customer inbound email replies and
admin dashboard responses). Added by
`1787290000000_product_request_snapshots_and_messages.js`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigserial` PK | |
| `request_id` | `uuid not null` | FK `product_requests` on delete cascade |
| `direction` | `text not null` | `admin` \| `customer` |
| `body` | `text not null` | Encrypted PII for message text |
| `email_message_id` | `text` null UK | Inbound idempotency when present |
| `created_at` | `timestamptz not null` | Default `now()` |

Index: `product_request_messages (request_id, created_at)`.

### Durable mail outbox (`mail_jobs`, `1788100000000_ai_efficency.js`)

Heavy customer/owner mail that must leave the HTTP request path. An
event-driven worker started from `app.listen` wakes on enqueue (and on a
one-shot timer for retry backoff / stuck-`processing` reclaim), claims due
rows with `FOR UPDATE SKIP LOCKED`, sends, retries with exponential backoff,
and marks `dead` after 8 attempts. A transactional insert wakes the drain
again after commit. Idle processes do not poll. Process
shutdown stops the worker before closing the pool. A wake against a missing
table is a no-op (one stderr line, then silence) so a process started before
migrate does not dump a stack. Not a production crontab entry. `sent` and
`dead` rows are deleted 30 days after their last update (checked at most once
per process every six hours, at the start of a drain).
`order_confirmation` is enqueued once per order: settlement replays (webhook
retry, finalize racing the webhook) look for a job of that kind created in the
last 7 days for the same `payload.orderId` under an advisory lock
(`mail_jobs_kind_created_idx`).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | App-generated |
| `kind` | `text not null` | `gift_share_card` \| `order_confirmation` \| `contact_form` |
| `payload` | `jsonb not null` | Kind-specific send inputs (no secrets beyond paths already on disk) |
| `status` | `text not null` | `pending` \| `processing` \| `sent` \| `failed` \| `dead` |
| `attempts` | `integer not null` | Incremented on each claim |
| `next_attempt_at` | `timestamptz not null` | Due time for pending/failed |
| `last_error` | `text` null | Truncated last failure |
| `created_at` / `updated_at` | `timestamptz not null` | |

Indexes: claim `(status, next_attempt_at)` partial for live statuses; `(kind, created_at desc)`.

### Public ids are upper-case

The application mints every `chat_sessions`, `unconnected_contacts` and
`product_requests` `public_id` as upper-case hex and always looks it up
upper-cased. `1791331200000_staff_roles.js` upper-cased rows
inserted by hand in lower case (they were listed but could never be opened
or closed) and added `CHECK (public_id = upper(public_id))` to all three
tables, `NOT VALID` so a hypothetical row whose upper-case form was already
taken is left alone instead of failing the deploy.
