/** Plugin-owned schema bookkeeping.

 * `plugins.schema_version` is the plugin package version after its
 * `back/migrations/` files have been applied. `plugins_schema_migrations`
 * records which files ran (host bookkeeping; not a plugin-owned table).
 * Disable keeps both. Uninstall runs down and deletes these rows.

 * @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.plugins
      ADD COLUMN IF NOT EXISTS schema_version text
  `);
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS public.plugins_schema_migrations (
      plugin_id text NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (plugin_id, name)
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS public.plugins_schema_migrations`);
  pgm.sql(`ALTER TABLE public.plugins DROP COLUMN IF EXISTS schema_version`);
};
