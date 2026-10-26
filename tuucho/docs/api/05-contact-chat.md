# Contact and messaging

Owner To is resolved by `tuucho-mail-spy` channel `contact.inbound` from that
plugin's `rules` (Plugins, Configure, or `config.json`: a role or an unlocked
staff email). Nothing is added when `rules` is empty. Signed-in chat
owner-notify uses channel `contact.chat` the same way. Empty spy To keeps the
customer message. `EMAIL_CHAT_FROM` / `SMTP_CHAT_*` stay the piped
mailbox transport, never the visitor. The endpoint is rate-limited to five requests per IP
every 15 minutes. The owner notification is **enqueued** on `mail_jobs` after
the contact row is persisted; successful enqueue responds `201` with
`{"success":true}` even when nobody is configured to receive the owner copy.
Invalid input responds `400`, persistence failure responds `503`, enqueue
failure responds `502`, and the rate limit responds `429` with the usual error
envelope. Actual SMTP/folder delivery is drained by the in-process mail worker
with retry/backoff.

In local development (and on preprod when folder routing is on —
`ROUTE_EMAIL_FOLDER` absent or not `false`), SMTP is not required: the complete
message is written under the configured `DEV_EMAIL_USER_DIR` (locally
`<outputDir>/dev/email-user/`; see `devEmailWriter`) once the worker claims the job
and spy resolve returned a To, and the endpoint still responds `201` after
enqueue.

### Account chat

Every account-chat endpoint requires `Authorization: Bearer <access-token>`.
There is no guest chat, schedule, availability flag, deadline, or automatic
closure. `GET /account/chat/sessions` returns history summaries; `GET
/account/chat/sessions/:publicId` returns a transcript page (keyset
pagination: optional `limit` 1–200 default 50, `after` for newer ids,
`before` for older ids; response includes
`data.pagination.{limit,hasMore,oldestId,newestId}`); `POST
/account/chat/sessions` creates the open session together with its first
message; `POST /account/chat/sessions/:publicId/messages` adds a user message
only while it is open. `POST /account/chat/sessions/:publicId/read` advances the durable customer
read cursor; `POST /account/chat/sessions/:publicId/close` makes the transcript read-only for the customer. Shop may
write to closed sessions and may reopen one through operations, which closes
the customer’s other open session transactionally. `POST /account/chat/sessions/:publicId/presence` marks the customer as actively
reading (`{"active":boolean}`) — it drives `chat_sessions.last_user_active_at`
and suppresses the owner-notify email while the customer is visibly in the
conversation. The browser receives Bearer-authenticated SSE at
`GET /account/chat/sessions/:publicId/events`. The customer's own
image attachments are served from
`GET /account/chat/sessions/:publicId/attachments/:attachmentId`, owner-checked
the same way as the transcript.

### Administration chat

Administrators use `GET /admin/chats?status=open|closed&page=N` to load a
20-conversation page (there is intentionally no default status). Optional
filters: `q` (up to 100 characters, case-insensitive, matched anywhere in
the visitor e-mail, name, conversation id or any message), `period=7|30|90|365`
(opened within that many days) and `sort=activity|opened_desc|opened_asc`
(default `activity`: latest message first; the others order by opening
date). An unknown `period` or `sort` is ignored. Each row carries `createdAt`
(the opening date). Then `GET
/admin/chats/:publicId` for one transcript page (same `limit`/`after`
keyset as account chat, default limit 100, plus `pagination`). While a transcript is open, `GET
/admin/chats/:publicId/events` streams its message/close/reopen events using
the same bearer-authenticated fetch-stream pattern as account chat. `POST
/admin/chats/:publicId/messages` accepts JSON or multipart with `body` and
optional `images` (0–3) and appends a Shop reply. Admin replies never
email the customer automatically. `PATCH
/admin/chats/:publicId/owner-email-notification` temporarily suppresses the
owner-notify email sent when the customer writes; the API automatically resets
it after `ADMIN_CHAT_OWNER_EMAIL_SUPPRESSION_TIMEOUT`. `POST
/admin/chats/:publicId/notify` sends an explicit notification for the latest
Shop reply, respecting that same customer preference. `POST
/admin/chats/:publicId/close` closes an open conversation (idempotent if
already closed) — same effect as the customer's own close. Private attachments
are available only to admins at `GET /admin/chats/:publicId/attachments/:attachmentId`.
`GET /admin/chats/attention-counts` returns
`{"success":true,"counts":{"open":N}}` for the Conversations hub badge.

### Administration anonymous contacts

Administrators use `GET /admin/unconnected-contacts?status=new|answered|ignored&page=N`
to list contact-form messages. It takes the same optional `q`, `period` and
`sort` as the chat list (default `sort=activity`: latest message first). The
visitor e-mail, name and messages are encrypted at rest, so `q` matches an
exact e-mail (HMAC lookup) or the public id across the whole tab, and
matches any text inside the e-mail, name or messages within the 2000 most
recent threads of that tab and period (`CONTACT_SEARCH_WINDOW`, decrypted in
memory). Each row carries `createdAt` (the opening date). Then
`GET /admin/unconnected-contacts/:publicId`
for the full thread. `PATCH /admin/unconnected-contacts/:publicId/status` with
`{"status":"new"|"answered"|"ignored"}` changes its status. `POST
/admin/unconnected-contacts/:publicId/replies` accepts JSON or multipart with
`body` and optional `images` (0–3) and emails a reply to the visitor, records
it, and marks the contact `answered` only after delivery succeeds. Original contact images remain private and are available
only to admins at `GET /admin/unconnected-contacts/:publicId/attachments/:attachmentId`.
`GET /admin/unconnected-contacts/attention-counts` returns
`{"success":true,"counts":{"new":N}}` for unanswered contact-form messages.

### Administration product requests

`GET /admin/users/:id/contacts` is the customer-dashboard view of this inbox.
It matches its account by the normalized HMAC email lookup, not by a foreign
key: an anonymous form was sent while signed out. It therefore only shows
threads for the account's current email and must be presented as an exact
email match rather than account-owned contact history.

Administrators use `GET /admin/product-requests?status=requested|accepted|refused&page=N`
to list product requests, then `GET /admin/product-requests/:publicId` for the
full thread. `PATCH /admin/product-requests/:publicId` with
`{"status":"accepted"|"refused","message":"…","price":N}` records the response
and emails the customer. `GET /admin/product-requests/attention-counts` returns
`{"success":true,"counts":{"requested":N}}` for the Demandes produit hub badge.

### `POST /contact`

For visitors without an account. JSON body:

```json
{ "email": "customer@example.com", "identity": "Last name First name", "message": "…" }
```

Or multipart with the same fields plus optional `images` (0–3 jpeg/png/webp,
max `CONTACT_IMAGE_MAX_BYTES` after processing). Declared MIME must match
file magic bytes (`invalid_type` when spoofed); Sharp remains the final
decoder. Files are stored under
`PRIVATE_MEDIA_CONTACT_DIR`, attached to the owner email, and retained for the
authenticated admin contact inbox (no public URL).

`email`, `identity`, and `message` are required. The delivery email includes
these fields and has the visitor's email set as its reply-to address. The
contact is also retained as a `new` anonymous-contact record for the admin
inbox, even if notification email delivery subsequently fails.

### `POST /contact/product-request`

"This size is sold out — make it for me." Optional auth: with a valid bearer
token the customer's address and id come from the token and any `email` in the
body is ignored; without one, `email` is required and is the only way back to
them. Rate-limited like the contact form. Body:

```json
{
  "productId": "uuid",
  "shapeKey": "amande",
  "lengthKey": "default",
  "size": "M",
  "quantity": 1,
  "email": "customer@example.com",
  "comment": "optional note"
}
```

`size` must be one of `XS`/`S`/`M`/`L`. `quantity` is optional (defaults to
`1`, capped at `FIELD_CART_QUANTITY_MAX`) — only the gallery's "request your
size" dialog asks for it; the cart's own entry points don't. `comment` is
optional (max `FIELD_PRODUCT_REQUEST_COMMENT_MAX`); omit it or send blank to
leave the spy email without a note. The product's
reference, title and shape label are resolved server-side from `productId`,
never taken from the body; `404 not_found` when it doesn't exist or the
customer can't see it (user-library products). The request is stored as
`product_requests` with status `requested` (see
`GET /operation/product-requests`) **and** a spy email is sent when
`tuucho-mail-spy` channel `product_request` resolves staff recipients (the
customer's address is reply-to). The spy subject includes the 8-hex `publicId`
used by `npm run product-request -- set-status`. Empty resolve skips the spy
copy; a mailbox outage is logged and still returns `201` (the row is stored).
The route requires plugin `tuucho-commerce-product-requests`
(`404 plugin_disabled` when off). Response `201`: `{"success":true}`.

---

### Operations chat

Loopback-only ops access (see [operation](./07-operation.md)), mounted under
`/operation/chat`. `GET /operation/chat/sessions?status=open|closed|all` and
`GET /operation/chat/sessions/:publicId` mirror the admin reads;
`POST /operation/chat/sessions/:publicId/messages` appends a Shop reply.

Each session in the list carries `publicId`, `status`, `visitorEmail`,
`visitorIdentity`, `createdAt`, `lastMessageAt`, `closedAt`, `messageCount` and
`visitorLive`.

`visitorLive` is true while the customer still has the chat panel open, so an
operator can tell a reply that will be read now from one that has to become an
email. It counts the customer's own SSE stream only: the operator's admin panel
subscribes to the same session, so an unqualified count would answer yes to
whoever asked. Presence lives in the serving process and is immediate, so it
means "someone is there right now", never a record of who was, and on a
multi-node deployment it would describe only the node that answered. An open
session with `visitorLive: false` is what `npm run chat` labels an orphan.

`POST /operation/chat/sessions/:publicId/close` and
`POST /operation/chat/sessions/:publicId/reopen` are the operator equivalents of the admin actions — reopening closes the customer's
other open session transactionally, since an account may only have one.

`POST /operation/chat/notifications/process` drains the `chat_notification_outbox`; body
`{"limit":number}` (1–100, default 25). This is the cron entry point for
delivering "you have a reply" emails.

`POST /operation/chat/inbound` ingests a raw inbound email so a customer can answer by
replying to the notification. Body is `{"raw":"string"}` or
`{"rawBase64":"string"}`. The handler first checks for a product-request
reply — identified by an `X-Tuucho-Product-Request` header or a
`TUCHO-REQUEST:<publicId>:<token>:…` marker in the body, with the token
verified before anything is written — and otherwise routes the mail to the
chat-session matcher. Unmatched mail is recorded in
`chat_inbound_dead_letters` rather than dropped. Always responds
`{"success":true,"data":{"outcome":…}}`, including for ignored mail, so the
mail pipe never retries.
