# Tuucho documentation

Index of the HTTP, database, CLI, cron, and plugin references for the whole
project. Thin stubs one level up (`../API.md`, `../SCHEMA.md`, `../COMMAND.md`,
`../CRON.md`) point here so existing links keep working.

| Doc                                      | Description                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [API](./api/README.md)                   | JSON HTTP surface (gallery, auth, account, admin, ops, …)                 |
| [Schema](./schema/README.md)             | PostgreSQL tables and constraints                                         |
| [Orders](./orders.md)                    | Order lifecycle: statuses, graphs, payment capture, who can move what     |
| [Command](./command/README.md)           | Every `npm run` script and flag, back and front                           |
| [Cron](./cron/README.md)                 | Production shipment-tracking cron                                         |
| [Architecture](./architecture/README.md) | Module boundaries, dependency rules, shop pack layout (`factory-backup`, `src/plugins`) |
| [Plugins](./plugins.md)                  | Plugin development guide (same text as Admin, Documentation)              |
| [Microkernel](./microkernel.md)          | Kernel, plugin SDK, factory backup, and opening contracts                 |
| [Front screens](./front/screens.md)      | Generated map of every front URL to its page file                         |
| [Gift offers](./api/08-gift.md)          | Two-person gift promises (API). Schema: [08-gift.md](./schema/08-gift.md) |

Also see the repository [README.md](../../README.md) for architecture and
deploy workflow.
