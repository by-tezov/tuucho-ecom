/**
 * Plugin config-file drift stamps and kernel permissions for import/export.
 *
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.plugins
      ADD COLUMN IF NOT EXISTS config_files_hash text
  `);
  pgm.sql(`
    ALTER TABLE public.plugins
      ADD COLUMN IF NOT EXISTS config_files_applied_at timestamp with time zone
  `);
  pgm.sql(`
    INSERT INTO public.permissions (code, label, sort_order) VALUES
      ('plugin_config_import', 'Plugin config import', 162),
      ('plugin_config_export', 'Plugin config export', 163)
    ON CONFLICT (code) DO NOTHING
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE public.plugins DROP COLUMN IF EXISTS config_files_hash`);
  pgm.sql(`ALTER TABLE public.plugins DROP COLUMN IF EXISTS config_files_applied_at`);
  pgm.sql(`DELETE FROM public.permissions WHERE code IN ('plugin_config_import', 'plugin_config_export')`);
};
