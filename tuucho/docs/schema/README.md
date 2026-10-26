# Database schema

PostgreSQL schema for kernel/back. Root [`SCHEMA.md`](../../SCHEMA.md) links here.

Kernel schema is the single baseline `src/db/migrations/1738000000000_init.js`,
applied via `POST /operation/database-migrate`. Plugin-owned tables live in
that plugin's one `back/migrations/` file, never in the kernel baseline.
This documentation describes the **current** schema result. New work after
this reset is a new timestamped migration again.

**To learn what a table holds, run `npm run table -- <name>`**, not a search
through these sections. It prints columns, types, keys, indexes and the files
that query the table in about twenty lines, from
[`tables.json`](./tables.json), which `npm run sync:schema` generates from the
real database. These sections carry what a generator cannot know: why a table
exists, what the retention rule is, and which invariants hold across tables.

`npm run sync:schema` also writes [`src/db/rows.ts`](../../kernel/back/src/db/rows.ts), one
TypeScript interface per table, so a query can be typed as
`Pick<Rows['orders'], 'id' | 'status'>` instead of restating the columns, and a
hand-written row type can be proved against its table with
`MatchesTable<OrderRow, 'orders'>`.

`npm run check:schema` fails when the snapshot is older than a migration, when
`rows.ts` no longer matches it, when a table is documented nowhere, or when
fewer files type themselves against `rows.ts` than before. `npm run check:sql`
validates every SQL identifier in `src/` against it.

## Menu

| Section | File |
| --- | --- |
| Overview (intro, catalogue ERD) | [00-overview.md](./00-overview.md) |
| Catalogue (`shapes` … `product_photos`) | [01-catalog.md](./01-catalog.md) |
| User accounts | [02-accounts.md](./02-accounts.md) |
| Pricing, cart and orders | [03-pricing-cart-orders.md](./03-pricing-cart-orders.md) |
| Vouchers | [04-vouchers.md](./04-vouchers.md) |
| Couriers & delivery networks | [05-couriers.md](./05-couriers.md) |
| Messaging (chat, contacts, product requests) | [06-messaging.md](./06-messaging.md) |
| Loyalty wallet | [07-loyalty.md](./07-loyalty.md) |
| Gift offers | [08-gift.md](./08-gift.md) |
| Administration journal (private file; `admin_activity` retained) | [09-activity.md](./09-activity.md) |
| Vinted reviews and rating (`vinted_reviews`, `vinted_rating`) | [10-reviews.md](./10-reviews.md) |
| Plugin registry (`plugins`, `plugins_schema_migrations`) | [11-plugins.md](./11-plugins.md) |
| Migration history (deleted / squashed files) | [migration-history.md](./migration-history.md) |

Related: [order lifecycle](../orders.md) · [api](../api/README.md) · [command](../command/README.md) · [cron](../cron/README.md)
