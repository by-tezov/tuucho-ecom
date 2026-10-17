# Spy e-mail plugin

Checkout: `/home/tezov/Local/tuucho-ecom`. Git is read-only for this worker.

**Finding:** spy mail is **kernel today**, not a plugin. Preferences Notifications lists `SPY_KINDS` toggles; `spyRecipient(kind)` returns one env address (`EMAIL_ORDER_SPY_RECIPIENT`, or `dev@localhost` under folder routing). Contact inbound uses a second env (`EMAIL_CONTACT_RECIPIENT`). Te lock: SMTP / `mail_jobs` stay kernel; **who** and **whether** must be a plugin.

**Plugin id:** `tuucho-mail-spy` (name “Spy e-mails”, kind `generic`, `defaultEnabled: true`). Locale complement `tuucho-mail-spy-locale-fr`. Folder `plugins/tuucho/messaging/mail-spy/`.

## Current vs target

| | Current | Target |
| --- | --- | --- |
| Owner | Kernel (`spyKinds.ts`, Preferences island, `spyRecipient`) | Plugin `tuucho-mail-spy` decides who/whether. Kernel `sendMail` still SMTP. |
| Who | One env mailbox for every kind | Per-channel role and/or email filters. Union, then **one** send per destinaire. |
| Whether | `spy.<kind>` preference + `DISABLE_SPY_EMAIL` default | Per-channel enable. Plugin off → no spy (and no contact-owner) mail. |
| Catalogue | Closed kernel `SPY_KINDS` | Registration opening `mail.spy.channels`. Spy plugin does not enumerate gift/contact itself. |
| Contact | Hardcoded `EMAIL_CONTACT_RECIPIENT` or 503 | Channel `contact.inbound` uses the same resolve path. Chat owner To is `contact.chat`. |
| Customers | Not filtered (env is assumed to be the owner) | Role `user` never receives. Only **existing, unlocked** (`status = active`) **staff** accounts. |
| Admin | Preferences → Notifications spy groups | Admin → Spy e-mails (`/admin/spy-mail`), permission `spy_mail`. No Configure. |

SMTP, templates, `mail.send` / `mail.recipients` (templated To/Cc/Bcc), and `mail_jobs` stay the email **shell**. `mail.recipients` is the wrong opening for a channel catalogue.

## Registration API

SDK `CORE_OPENING_FILTERS`:

- `mail.spy.channels` — accumulate `SpyChannelDeclaration[]`. Kernel seeds `KERNEL_SPY_CHANNELS`; plugins `addFilter` and append.
- `mail.spy.resolve` — `{ channelId, to: string[] }`. Spy plugin fills `to`. Kernel `spyTo(channelId)` / `resolveSpyRecipients(channelId)` apply this filter and skip send when `to` is empty.

```ts
type SpyChannelFilter = 'role' | 'email' | 'kind';

interface SpyChannelDeclaration {
  id: string;          // e.g. gift_created, contact.inbound, login
  pluginId: string;    // kernel | tuucho-commerce-gift | tuucho-contact | …
  title: string;
  description: string; // purpose of the email
  filters: SpyChannelFilter[];
}

interface SpyResolveState {
  channelId: string;
  to: string[];
}
```

`kind` in `filters` means the channel is a typed spy notification (admin shows that filter). Recipients are still role and/or email, stored **per channel** (typed by that spy-email id). `appendSpyChannel` in the SDK de-dupes by `id`.

Kernel helper (call sites): `spyTo(channelId): Promise<string | undefined>` joins unique addresses for `sendMail({ to })`.

## Who registers what

**Kernel** (seed array, `pluginId: 'kernel'`): every current `SPY_KINDS` **except** `gift_created` and `product_request`. Filters `['role', 'email', 'kind']`.

**`tuucho-commerce-gift`:** `gift_created` — staff copy when a giver creates an offer.

**`tuucho-commerce-product-requests`:** `product_request` — staff copy when a sold-out size is requested. Spy path stops using `EMAIL_REQUEST_RECIPIENT` as the To (admin reply-To may still use env).

**`tuucho-contact`:** `contact.inbound` — owner mail for the guest/contact form. `contact.chat` — staff copy of signed-in chat messages. Filters `['role', 'email']` (not a legacy spy kind). Form no longer 503s on missing `EMAIL_CONTACT_RECIPIENT`; empty resolve skips the owner send after the message is stored. Chat empty To keeps the customer message (like preference off); `EMAIL_CHAT_FROM` / `SMTP_CHAT_*` stay transport.

`account_created` stays a **kernel** channel (gift sign-up still calls `spyTo('account_created')`).

## Data model

Plugin tables only (`plugin_tuucho_mail_spy_…`). No ALTER of kernel tables.

```sql
plugin_tuucho_mail_spy_channels (
  channel_id text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
)

plugin_tuucho_mail_spy_recipients (
  id uuid primary key,
  channel_id text not null references plugin_tuucho_mail_spy_channels (channel_id) on delete cascade,
  filter_type text not null check (filter_type in ('role', 'email')),
  filter_value text not null,
  created_at timestamptz not null default now(),
  unique (channel_id, filter_type, filter_value)
)
```

Missing channel row ⇒ enabled (first write materializes it). Disable plugin keeps tables; uninstall runs `down`.

## Resolve and safety

1. Plugin disabled or channel disabled → `[]`.
2. Collect emails from role filters: holders of that `user_roles.role_code` with `users.status = 'active'`. Ignore role `user` even if saved.
3. Collect emails from email filters: `findUserByEmailLower`; require `status = 'active'` and at least one staff role (`user_roles` non-empty). Unknown / customer / locked / pending_deletion / deleted → drop.
4. Lowercase dedupe. One SMTP `to` list (comma-joined), not N copies to the same person.
5. Kernel identity helpers decrypt PII; the plugin does not `SELECT` `users.email`.

First admin load / resolve: if the recipients table is empty and `EMAIL_ORDER_SPY_RECIPIENT` (or `EMAIL_CONTACT_RECIPIENT` for `contact.inbound`, `EMAIL_CHAT_RECIPIENT` for `contact.chat`) matches an unlocked staff account, seed that email onto enabled channels. Raw env mailboxes that are not shop accounts are **not** used.

## Admin

`/admin/spy-mail`, nav group `settings`, permission `spy_mail` on the manifest. Lists every registered channel: title, description, plugin id, available filters, enable switch, recipient chips (role / email) with add/remove. Theme UI: `ToggleSwitch`, `Button`, `Chip`, `ConfirmModal`. `pluginHasConfigure` stays false (generic, no settingsSchema).

## Left in kernel / env

- Email shell (`sendMail`, jobs, templates).
- `SPY_KINDS` preference keys remain in GET/PATCH so old clients do not 400; they no longer gate sends. Preferences Notifications **spy island removed**.
- `warmOutageSpy.js` uses live `spyTo` when plugins/DB load; otherwise `$PRIVATE_DIR/warm-outage/spy-recipients.json` (last resolve of `website_down` / `website_restore_failed`, including empty). SMTP transport stays env. Never `EMAIL_ORDER_SPY_RECIPIENT` as To.
- `DISABLE_SPY_EMAIL` still forces spy preference defaults off; plugin resolve is the live gate (including chat owner-notify and outage).

## Docs / skill / tests

- Skill `.cursor/skills/tuucho-plugin-spy/SKILL.md` + router / kernel-index rows.
- Handbook on the plugin; developer articles: openings table + “register a spy channel”.
- Tests: channel register, resolve safety (customer excluded, locked excluded, dedupe), gift/contact registration, `pluginHasConfigure` false, contact no longer requires env.

## Not in this job

Changing SMTP, customer transactional mail, chat SMTP, or kernel Couriers/Preferences chrome beyond removing the spy island.
