# API

Account-side subjects have their own sections:
[addresses and favorites](./10-addresses.md),
[delivery options](./11-delivery.md),
[payment methods](./12-payment-methods.md), [cart](./13-cart.md),
[account checkout and orders](./14-account-checkout.md),
[loyalty](./15-loyalty.md).

Every route, with its guards and handler file:
[route reference](./09-reference.md), generated from the running app. The
sections below explain what those routes do. reference

HTTP surface for pamsurin-back. Root [`API.md`](../../API.md) links here.

Base URL is this app's own subdomain for whichever environment — locally
`http://localhost:3000`, preprod `https://preprod-api.pamsurin.fr`, prod
`https://api.pamsurin.fr`. No `/api` prefix on any route.

## Menu

| Section                                               | File                                           |
| ----------------------------------------------------- | ---------------------------------------------- |
| Conventions (envelope, webhooks, limits, PII, health) | [00-conventions.md](./00-conventions.md)       |
| Administration (`/admin/...`)                         | [01-admin.md](./01-admin.md)                   |
| Auth (`/auth/...`)                                    | [02-auth.md](./02-auth.md)                     |
| Account (`/account/...`)                              | [03-account.md](./03-account.md)               |
| Guest checkout (`/checkout/guest/...`)                | [04-guest-checkout.md](./04-guest-checkout.md) |
| Contact, chat, anonymous contacts, product requests   | [05-contact-chat.md](./05-contact-chat.md)     |
| Gallery API (`/gallery/...`)                          | [06-gallery.md](./06-gallery.md)               |
| Operations (`/operation/...`)                         | [07-operation.md](./07-operation.md)           |
| Gift offers (`/gift/...`, `/admin/gift/...`)          | [08-gift.md](./08-gift.md)                     |
| Customer reviews (`/reviews`, `/admin/vinted-reviews/...`) | [16-reviews.md](./16-reviews.md)       |

## Fast lookup

The reference is organized by route ownership, not by implementation file.
Use the menu above when learning a capability. When the route is already
known, repository search is faster:

```bash
rg -n '^###? `?(GET|POST|PUT|PATCH|DELETE).*your-route' docs/api
```

Each endpoint heading is followed by its authorization, input, success shape,
and expected errors. Cross-cutting envelopes, upload limits, PII rules, and
webhook conventions live once in [Conventions](./00-conventions.md); endpoint
pages link there instead of repeating them.

Related: [order lifecycle](../orders.md) · [schema](../schema/README.md) · [command](../command/README.md) · [cron](../cron/README.md)
