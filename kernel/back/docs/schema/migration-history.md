# Migration history (deleted / squashed files)

This file records migrations that once existed under `src/db/migrations/` and
were later removed because their final effect was folded into a later file.
It is an operator/agent memory aid. It is **not** a runnable history.

## Full squash (2026-10-20) → `1738000000000_init.js`

Nothing is in prod. Kernel history was flattened again: every numbered file
after the previous squash was folded into `1738000000000_init.js`, regenerated
from `pg_dump --schema-only` of this shop's Postgres 10 (plugin tables
excluded). The baseline includes sealed `plugins.secrets`, `plugins.settings`,
staff roles/permissions, SEO redirects, `orders.plugin_snapshot`,
`vocabulary_lengths`, en/fr language checks, and the current seeds
(`user` + `super-admin` + `preparator`/`manager`, not `admin`).

This shop already has `1738000000000_init` in `pgmigrations`, so
`database-migrate` skips the rewritten file. Leftover rows for the deleted
names are harmless (`checkOrder: false`). A lagged database that applied the
old init but not the later files must `database-reset` then migrate. Fresh
shop: `database-reset` (or empty `public`) then `database-migrate`. New kernel
work after today is a new timestamped file again.

Plugin tables were **not** dumped into kernel. The only plugin that had SQL
keeps one baseline:
`plugins/tuucho/messaging/mail-spy/tuucho-mail-spy/back/migrations/001_spy_mail.js`
(same filename so `plugins_schema_migrations` skips it on this shop).

| Former file | Role (historical) |
| --- | --- |
| `1791331200000_staff_roles.js` | Staff roles, permissions, inheritance, public-id upper-case checks |
| `1791900000000_gift_receiver_email.js` | `gift_offers.receiver_email` / lookup |
| `1792000000000_catalogue_edit_permission.js` | `catalogue_edit` permission |
| `1792100000000_catalogue_vocabulary.js` | `vocabulary_lengths`, `shape_lengths.sort_order` |
| `1792200000000_plugins_and_store.js` | `plugins` table + store identity prefs |
| `1792300000000_plugin_email_log_permission.js` | `email_log` permission |
| `1792400000000_product_seo_and_redirects.js` | Product SEO columns, `seo_redirects` |
| `1792500000000_plugin_schema_lifecycle.js` | `plugins.schema_version`, `plugins_schema_migrations` |
| `1792600000000_order_plugin_snapshot.js` | `orders.plugin_snapshot` |
| `1792700000000_language_en_fr.js` | Language checks en/fr only |
| `1792800000000_strip_extra_locale_keys.js` | Strip extra locale keys from seed JSONB |
| `1792900000000_tuucho_plugin_ids.js` | Rename plugin ids to `tuucho-*` |
| `1792910000000_tuucho_home_faq.js` | Menu pluginId remap for home FAQ |
| `1792920000000_tuucho_commerce_vinted_review.js` | Menu pluginId remap for Vinted review |
| `1792930000000_courier_edit_permission.js` | `courier_edit` permission |
| `1792940000000_page_legal_user.js` | Legal page menu pluginId remap |
| `1792960000000_plugin_secrets.js` | `plugins.secrets` JSONB (now sealed at rest) |

## Policy

Never rewrite applied migration history in place. Do not edit a migration that
has already been applied on a shared target (`dev` after teammates apply it,
`preprod`, `prod`) to change its effect. Add a new forward migration instead.
Local-only squash before first deploy to a target is an exception and must be
documented here when intermediate files are deleted.

## Gift offers squash → `1788000000000_gift_offers.js`

Earlier gift work used `1787500000000_gift_offers` plus incremental files in
the `178751`–`178759` band. Those were squashed into the current
`1788000000000_gift_offers.js` (renamed past production’s already-applied
`1787931097213_apple_sign_in` timestamp). `database-migrate` still aliases a
recorded `1787500000000_gift_offers` `pgmigrations` row to
`1788000000000_gift_offers` when present.

Deleted intermediate gift-era files (effects now in `1788000000000_gift_offers`
or obsolete before the squash):

| Former file | Role (historical) |
| --- | --- |
| `1787500000000_gift_offers.js` | Original gift schema create (renamed to `178800…`) |
| `1787510000000_gift_drop_unused_settings.js` | Dropped unused settings / `pending_giver_confirm` |
| `1787510000000_gift_items_product_cascade.js` | `gift_items.product_id` ON DELETE CASCADE (interim) |
| `1787520000000_gift_drop_receiver_email.js` | Temporary receiver-email drop |
| `1787520000000_gift_comment_accessories.js` | Giver comment / accessories / `pack_key` (interim) |
| `1787530000000_gift_restore_receiver_email.js` | Restored receiver email |
| `1787530000000_gift_carts_may_be_active.js` | Dropped `carts_gift_not_active_chk` (interim) |
| `1787540000000_gift_access_pin.js` | Access PIN columns / sessions |
| `1787550000000_gift_drop_receiver_email_again.js` | Receiver email removed again |
| `1787560000000_gift_accessory_budget_ceiling.js` | Accessory budget settings |
| `1787570000000_gift_pin_attempts.js` | PIN attempt tracking |
| `1787580000000_gift_pin_free_failures.js` | Free PIN failure budget |
| `1787590000000_drop_products_search_text.js` | Dropped unused `products.search_text` (also folded into init / gift-era cleanup) |

## Post-gift squash → `1788000000000_gift_offers.js` + `1788100000000_ai_efficency.js`

Local-only squash before first deploy. Runnable history was then three files:
`1738000000000_init`, `1788000000000_gift_offers` (final gift create, including
`pin_max_failures`, `pin_hash text`, `gift_offers_giver_open_idx`), and
`1788100000000_ai_efficency` (`rate_limit_buckets` + `mail_jobs`). A local DB
that already applied the deleted names keeps the schema; `checkOrder` is off,
so leftover `pgmigrations` rows for those names are harmless. The combined
file uses `IF NOT EXISTS` so a DB that already created those tables can still
record the new name.

| Former file | Role (historical) |
| --- | --- |
| `1788100000000_gift_pin_max_failures.js` | `gift_settings.pin_max_failures` 1–100, default 10 |
| `1788100000000_rate_limit_mail_jobs.js` | Short-lived combined name |
| `1788100000000_rate_limit_buckets_and_mail_outbox.js` | Short-lived combined name |
| `1788200000000_rate_limit_buckets.js` | Shared `rate_limit_buckets` table |
| `1788400000000_mail_jobs.js` | Durable `mail_jobs` outbox |
| `1788500000000_gift_offers_open_index.js` | Partial `gift_offers_giver_open_idx` |
| `1788600000000_gift_pin_hash_text.js` | Widen `pin_hash` from `character(64)` to `text` |

Forward apply for shared targets that still have `character(64)`:
`1788700000000_gift_pin_hash_text.js`. Already-`text` columns are a no-op.

## Full squash (2026-10-07) → `1738000000000_init.js`

Every migration was folded into `1738000000000_init.js`, regenerated from
`pg_dump --schema-only` of a database built by the previous chain, so a fresh
database gets the final schema as a first deployment. Seeds now also cover
`gift_settings` (`id = 1`) and the `loyalty_enabled` / `compose_enabled`
`app_preferences` rows. The unused `pg_trgm` extension block was dropped
(`products.search_text` and its trigram index were already gone).
Verified: schema dump and seed rows of a database built from the new init are
identical to those built from the old chain, except for `pg_trgm`.

Existing targets are not upgraded by this: their `pgmigrations` already lists
`1738000000000_init`, so they skip it, and `checkOrder: false` makes the
leftover names harmless. Any change they had not yet applied is lost, so
preprod and prod are reset (`database-reset`, then `database-migrate`, then
data restore or re-import). The `1787500000000_gift_offers` rename alias in
`database-migrate` was removed with this squash. Backups taken before it pin
the old migration list and file hashes, so restoring one needs
`--bypass-preflight`.

| Former file | Role (historical) |
| --- | --- |
| `1788000000000_gift_offers.js` | Gift offers: settings singleton, capability-token offers, destinations |
| `1788100000000_ai_efficency.js` | Shared HTTP rate-limit counters (`rate_limit_buckets`) and the durable |
| `1788700000000_gift_pin_hash_text.js` | Widen leftover `gift_offers.pin_hash` from `character(64)` to `text`. |
| `1788800000000_payment_auth_expiry_spy_sends.js` | Idempotent dedup for the payment-authorization-expiry-spy cron: at most |
| `1789700000000_gift_offers_share_card_style.js` | Persists the giver's chosen share-card style on the offer itself. |
| `1789800000000_shape_length_gender.js` | Grammatical gender for the shape and length vocabularies. |
| `1789900000000_shape_attributive.js` | The attributive form of each shape word, per language. |
| `1790000000000_fk_indexes.js` | Indexes on the foreign keys that had none. |
| `1790100000000_token_hash_text.js` | Session and offer token hashes move from `character(64)` to `text`. |
| `1790200000000_compose_nail_set.js` | Composed nail sets: single-nail catalogue, boolean availability, cart and |
| `1790300000000_nail_variations.js` | Single-nail variations (docs/plans/nail-variations.md). |
| `1790400000000` | Retired per-set gift cart-rule kind: a gift per composed set holding at |
| `1790500000000_cart_rule_min_nails.js` | Fold composed sets into the existing gift and volume rules. |
| `1790600000000_loyalty_always_on.js` | Force the leftover loyalty switch on for the previously deployed application. |
| `1790700000000_gift_always_on.js` | Force the leftover gift switch on for the previously deployed application. |
| `1790800000000_compose_always_on.js` | Force the leftover compose-a-set switch on for the previously deployed application. |
| `1790900000000_nail_variation_copy.js` | Each single-nail variation option is its own product for everything a |
| `1791000000000_shape_length_hidden.js` | Per-shape/length visibility (docs/plans/variant-visibility.md). |
| `1791100000000_line_comments.js` | Customer note per cart card ("+ Ajouter un commentaire"). |
| `1791200000000_password_cancelled.js` | Password cancelled on an inbox-proving sign-in (account pre-hijacking guard). |
| `1791300000000_index_and_fk_tuning.js` | Index and foreign-key tuning from the 2026-10 backend review. |
| `1791400000000_admin_activity.js` | Append-only administration journal. |
| `1791500000000_visitor_language.js` | The language a visitor wrote in, on anonymous contact threads and product |
| `1791600000000_vinted_reviews.js` | Vinted reviews read from the shop's public Vinted profile. |
| `1791700000000_vinted_reviews_featured_only.js` | Only the reviews shown on the home page are stored from now on: scraped |
| `1791800000000_vinted_rating.js` | The shop's star rating as Vinted shows it, for the home page hero. |
| `1791900000000_vinted_review_translations.js` | Machine translations of the home-page reviews, so a visitor reads them in |
| `1792000000000_drop_user_checkout_vault_keys.js` | Drops `user_checkout_vault_keys`, the legacy per-user key behind the |

See also [08-gift.md](./08-gift.md) and [00-overview.md](./00-overview.md).

## Squash after init → `1791331200000_staff_roles.js`

The staff-roles work was built in steps, then flattened into
`1791331200000_staff_roles.js`, which creates the final schema directly
(roles columns, `permissions`, `role_permissions`, `role_parents`,
`user_roles`, `role_assignable_roles`, `role_targetable_roles`, the
`admin` to `super-admin` rename, the `preparator`/`manager` seeds, and the
upper-case public ids of chats, contacts and product requests). The
first file kept its name, so a database that already applied the steps
(dev, preprod) records it as applied and skips it; its schema was checked
identical to a fresh run. The deleted step names stay as harmless rows in
`pgmigrations` (`database-migrate` runs with `checkOrder: false`).

Deleted intermediate files (effects now in `1791331200000_staff_roles.js`,
or obsolete):

| Former file | Role (historical) |
| --- | --- |
| `1791331300000_role_inheritance.js` | Multi-role `user_roles`, `role_parents`, on/off + dominant grants, `manager` seed |
| `1791331500000_super_admin_label.js` | Built-in admin labelled "Super-administrateur" |
| `1791331600000_super_admin_code.js` | `admin` code renamed to `super-admin` |
| `1791331700000_role_assignment_permission.js` | `assign_roles` permission and `role_assignable_roles` |
| `1791331800000_role_targetable_roles.js` | `role_targetable_roles` |
| `1791331900000_drop_assign_roles_permission.js` | Removed `assign_roles` again (obsolete in the squash) |
| `1791331400000_uppercase_public_ids.js` | Upper-case public ids and their `NOT VALID` checks |

## `admin` role code renamed to `super-admin`

`1791331200000_staff_roles.js` moves every reference (`users.role`,
`user_roles`) from the built-in role `admin` to the new code `super-admin`
and deletes the `admin` row. A version older than that migration checks
`users.role = 'admin'` and would refuse every super-admin. Before rolling
back to such a version, run on the target database:

```sql
INSERT INTO roles (code, label, system) VALUES ('admin', 'Administrateur', true)
  ON CONFLICT (code) DO NOTHING;
UPDATE users SET role = 'admin' WHERE role = 'super-admin';
```

(`user_roles` rows can stay: older versions do not read that table.)
