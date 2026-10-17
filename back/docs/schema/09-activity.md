# Administration journal

Append-only history of changes that alter the running application: browser
admin actions, operator CLIs (seed, import, deploy, migrate), and system jobs
that advance an order, delete an account, or summarise a cron run that changed
something.

The live journal is the private NDJSON file `PRIVATE_LOG_ACTIVITY_FILE`
(`/log/activity.jsonl` inside `PRIVATE_DIR`). Each change appends one line.
The administration page reads that file. `POST /admin/activity/clear` deletes
it. Lines carry `at`. The same daily sweep as the cron journals drops a line
older than `CRON_LOG_RETENTION`. A line with no `at` stays until a clear.
Nothing is copied out of the database into the file.

## `admin_activity`

The table remains so the previously deployed application can still read rows
it wrote. This application does not insert into it and does not list it.
Rows already stored there are not shown in the journal.


| Column | Meaning |
| --- | --- |
| `id` | Row uuid |
| `occurred_at` | When the change was recorded (newest first in the admin list) |
| `category` | Filter bucket: `catalogue`, `orders`, `accounts`, `loyalty`, `gift`, `promotions`, `shipping`, `messaging`, `settings`, `operations`, `deploy` |
| `action` | Stable code such as `library.seed`, `order.status`, `loyalty.credit`, `deploy.finish` |
| `outcome` | `success` or `failure` (failed deploy that never swapped `current` still gets a row) |
| `origin` | `admin` (browser), `operator` (CLI / deploy), `system` (cron / worker) |
| `actor_user_id` / `actor_email` | Browser admin account; null for operator and system. FK `ON DELETE SET NULL` |
| `actor_label` | Always set: admin email, `user@host (mode)`, or job name |
| `operator_user` / `operator_host` / `mode` / `source_command` | CLI attribution (headers from the ops tunnel; not authentication) |
| `target_type` / `target_id` | Primary subject when there is one (product uid, order id, user id) |
| `targets` | Bounded list of related ids (cap 200; overflow flagged in `detail`) |
| `summary` | Short French sentence for the list. For a short value change it names the concrete before/after (example: `Stock 0117 oval/medium: Taille XS 2 -> 3`). |
| `detail` | Redacted JSON, capped at 8 KB. Value mutations use `changes` (see below). |

### `detail.changes`

For a write that alters stored values, `detail` carries only the fields that
actually differed:

```json
{
  "shapeKey": "oval",
  "lengthKey": "medium",
  "changes": [
    { "field": "sizes.XS", "before": 2, "after": 3 }
  ]
}
```

- `before` is read in the same transaction, before the write.
- Unchanged fields are omitted. An idempotent click still appends a line with
  `changes: []` and summary `aucun changement`.
- Bulk operator seed/delete rows keep count summaries instead of per-field
  before/after. Single-entity toggles use `changes` like browser admin.

Constraints: `origin = admin` requires `actor_user_id`; operator and system rows
must not carry an admin user id.

Loyalty wallet money stays in `loyalty_ledger`. Manual credit and debit also
append one journal line. That line is not part of the database transaction.
