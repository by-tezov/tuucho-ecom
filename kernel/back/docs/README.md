# Tuucho back-end documentation

Index of the HTTP, database, CLI, and cron references. Thin stubs at the
repo root (`API.md`, `SCHEMA.md`, `COMMAND.md`, `CRON.md`) point here so
existing links keep working.

| Doc | Description |
| --- | --- |
| [API](./api/README.md) | JSON HTTP surface (gallery, auth, account, admin, ops, …) |
| [Schema](./schema/README.md) | PostgreSQL tables and constraints |
| [Orders](./orders.md) | Order lifecycle: statuses, graphs, payment capture, who can move what |
| [Command](./command/README.md) | Every `npm run` script and flag |
| [Cron](./cron/README.md) | Production shipment-tracking cron |
| [Architecture](./architecture/README.md) | Module boundaries and dependency rules |
| [Gift offers](./api/08-gift.md) | Two-person gift promises (API). Schema: [08-gift.md](./schema/08-gift.md) |

Also see the repo [README.md](../README.md) for architecture and deploy
workflow.
