---
name: tuucho-plugin-spy
description: >-
  Registers a tuucho-ecom spy/ops-notify mail channel so tuucho-mail-spy can
  route staff copies. Use when a plugin or kernel event must send a spy
  e-mail. Never edits the email SMTP shell.
---

# Register a spy channel

## Invariants

- Kernel email **shell** (`sendMail`, SMTP, `mail_jobs`) stays kernel. Who and whether are `tuucho-mail-spy`.
- Do not hardcode `EMAIL_ORDER_SPY_RECIPIENT`, `EMAIL_CONTACT_RECIPIENT`, or `EMAIL_CHAT_RECIPIENT` as To.
- Do not put channel ids in the spy plugin. The owner of the event `addFilter`s `mail.spy.channels`.
- Role `user` (customers) never receives spy mail. Recipients are existing unlocked staff accounts only.
- Current branch only; no extra git branch; no PR unless asked.

## Recipe

1. Declare the channel (English title/description: purpose of the email). `filters` is the subset of `role`, `email`, `kind` the admin may use.

```ts
import {
  CORE_OPENING_FILTERS,
  appendSpyChannel,
  type SpyChannelDeclaration,
} from '@tuucho/plugin-sdk';

api.addFilter(CORE_OPENING_FILTERS.mailSpyChannels, (channels: SpyChannelDeclaration[]) =>
  appendSpyChannel(channels, {
    id: 'your_event',
    pluginId: api.pluginId,
    title: 'Your event',
    description: 'Staff copy when this happens.',
    filters: ['role', 'email', 'kind'],
  }),
);
```

2. Send through the kernel helper, skip when empty:

```ts
import { sendMail, spyTo } from '@kernel/back/modules/messaging/application/email';

const to = await spyTo('your_event');
if (!to) return;
await sendMail({ to, ...yourSpyEmail(data), kind: 'spy' });
```

Kernel-originated channels are the seed `KERNEL_SPY_CHANNELS` (`pluginId: 'kernel'`). Gift uses `gift_created`, product-requests `product_request`, contact `contact.inbound` and `contact.chat`. Outage script uses `spyTo` / last cached To for `website_down` and `website_restore_failed`, never env.

`kind` in `filters` marks a typed spy notification in Admin → Spy e-mails. Recipients remain role and/or email, stored per channel.

## Follow-up

Admin page / permission is owned by `tuucho-mail-spy` (`spy_mail`). Do not add a second recipients UI. Locale overlay → `tuucho-plugin-locale`.
